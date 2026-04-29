import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

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
        // Chrome extensions don't load in headless mode — launch headed.
        // On CI this runs under xvfb-run; locally macOS shows a window briefly.
        // Must drop `--disable-extensions` (Playwright default) or the
        // extension's service worker is never registered.
        const ctx = await chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: false,
            ignoreDefaultArgs: ['--disable-extensions'],
            args: [
                `--disable-extensions-except=${EXT_DIR}`,
                `--load-extension=${EXT_DIR}`,
                '--no-first-run',
                '--no-default-browser-check',
            ],
        });
        await use(ctx);
        await ctx.close();
    },
    extensionId: async ({ context }, use) => {
        const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
        let id: string | undefined;
        if (typeof manifest.key === 'string' && manifest.key.length > 0) {
            id = deriveExtensionId(manifest.key);
        }
        if (!id) {
            let [sw] = context.serviceWorkers();
            if (!sw) {
                sw = await context.waitForEvent('serviceworker', { timeout: 15_000 });
            }
            id = sw.url().split('/')[2];
        }
        await use(id);
    },
    appPage: async ({ context, extensionId }, use) => {
        const open = async (applicationName: string) => {
            const page = await context.newPage();
            await page.goto(
                `chrome-extension://${extensionId}/views/app.html?applicationName=${applicationName}`
            );
            // Shell readiness signal — wait for the skeleton-full-view to
            // render a heading. LWC shadow DOM is pierced natively by
            // Playwright's ARIA-role locators.
            await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
            return page;
        };
        await use(open);
    },
});

export { expect };
