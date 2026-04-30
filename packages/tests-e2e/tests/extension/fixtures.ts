import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Absolute path to the built Chrome extension.
 *
 * Extension specs launch a persistent Chromium context with
 * `--load-extension` pointing at this directory, so `npm run
 * build:prod:extension` (or the faster `build:extension:main`) must have
 * completed before running the `extension` Playwright project.
 */
const EXT_DIR = path.resolve(__dirname, '../../../../dist/extension');

/**
 * Derive the Chrome extension id from the `key` field in manifest.json.
 *
 * Workbench's manifest pins a public key so the extension id is stable
 * across rebuilds. That lets us deep-link to `chrome-extension://<id>/...`
 * without waiting for the MV3 service worker to register (which is racy
 * in Playwright: SWs are lazy and may not boot until the extension is
 * interacted with).
 */
function deriveExtensionId(manifestKeyB64: string): string {
    const pub = Buffer.from(manifestKeyB64, 'base64');
    const hash = crypto.createHash('sha256').update(pub).digest('hex');
    // First 32 hex chars, shifted a..p (Chrome's extension-id encoding).
    return hash
        .slice(0, 32)
        .split('')
        .map(c => String.fromCharCode(parseInt(c, 16) + 'a'.charCodeAt(0)))
        .join('');
}

type Fixtures = {
    context: BrowserContext;
    extensionId: string;
    appPage: (applicationName: string) => Promise<Page>;
};

/**
 * Playwright fixtures for the in-extension LWC apps.
 *
 * `context`: a persistent Chromium context with the built extension loaded.
 *     Each test file gets its own context, so chrome.storage / IndexedDB are
 *     isolated between spec files. Within a file, `afterEach` clears
 *     chrome.storage to reset between tests.
 *
 * `extensionId`: the MV3 extension id. Derived deterministically from
 *     `manifest.key` when present; falls back to the service-worker URL.
 *
 * `appPage`: opens `chrome-extension://<id>/views/app.html?applicationName=<name>`
 *     in a new tab and waits for the shell to render its first heading.
 */
export const test = base.extend<Fixtures>({
    context: async ({}, use) => {
        if (!fs.existsSync(path.join(EXT_DIR, 'manifest.json'))) {
            throw new Error(
                `Extension not built at ${EXT_DIR}. Run npm run build:prod:extension first.`
            );
        }
        // Use Playwright's bundled Chromium (patched) rather than
        // channel: 'chrome'. Chrome for Testing 137+ removed support for
        // `--load-extension` / `--disable-extensions-except` from branded
        // builds (see crbug.com/1426531), which caused
        // ERR_BLOCKED_BY_CLIENT on all chrome-extension:// navigations on
        // GitHub Actions. Bundled Chromium still supports those flags.
        //
        // Playwright's default args include `--disable-extensions`
        // unconditionally; we must drop it via ignoreDefaultArgs or the
        // extension's service worker is never registered.
        //
        // On CI this runs under xvfb-run (headed); locally macOS shows a
        // window briefly. MV3 extensions do not load in the old headless
        // shell, so `headless: false` is required here.
        const ctx = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: false,
            ignoreDefaultArgs: ['--disable-extensions'],
            args: [
                `--disable-extensions-except=${EXT_DIR}`,
                `--load-extension=${EXT_DIR}`,
                '--no-first-run',
                '--no-default-browser-check',
                // CI: no-sandbox is required under GitHub Actions where
                // the kernel doesn't allow user namespaces for Chrome.
                ...(process.env.CI ? ['--no-sandbox'] : []),
            ],
        });
        await use(ctx);
        await ctx.close();
    },
    extensionId: async ({ context }, use) => {
        // MV3 service workers are lazy on Linux/xvfb and don't reliably emit
        // the `serviceworker` event at launch. The manifest ships with a
        // pinned `key`, so derive the id deterministically from it instead
        // of waiting. Fall back to the SW url only if the key is absent.
        const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
        let id: string | undefined;
        if (typeof manifest.key === 'string' && manifest.key.length > 0) {
            id = deriveExtensionId(manifest.key);
        } else {
            let [sw] = context.serviceWorkers();
            if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 30_000 });
            id = sw.url().split('/')[2];
        }
        await use(id);
    },
    appPage: async ({ context, extensionId }, use) => {
        const open = async (applicationName: string) => {
            const page = await context.newPage();
            const url = `chrome-extension://${extensionId}/views/app.html?applicationName=${applicationName}`;
            await page.goto(url);
            // Shell readiness signal — wait for the skeleton-full-view to
            // render a heading. LWC shadow DOM is pierced natively by
            // Playwright's ARIA-role locators.
            await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
            return page;
        };
        await use(open);
    },
});

/**
 * Reset the extension's persistent chrome.storage between tests so state
 * from one test (e.g. smartinput categories) does not leak into the next.
 * Runs through the extension's service worker when one is registered; if
 * the SW is idle (MV3 lazy registration) this is a no-op — isolation is
 * still guaranteed at the spec-file level because each file gets its own
 * persistent context.
 */
test.afterEach(async ({ context }) => {
    // `context` can be null if the fixture setup itself failed (e.g. the
    // persistent-context launch timed out) — guard to avoid masking the
    // real error with a TypeError from the cleanup.
    if (!context) return;
    const [sw] = context.serviceWorkers();
    if (!sw) return;
    await sw
        .evaluate(async () => {
            // eslint-disable-next-line no-undef
            await chrome.storage.local.clear();
            // eslint-disable-next-line no-undef
            await chrome.storage.sync.clear();
        })
        .catch(() => {
            // Service worker may have gone idle between tests; ignore.
        });
});

export { expect };
