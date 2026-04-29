import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Absolute path to the built Chrome extension.
 *
 * Extension specs launch a persistent Chromium context with
 * `--load-extension` pointing at this directory, so `npm run
 * build:prod:extension` (or the faster `build:extension:main`) must have
 * completed before running the `extension` Playwright project.
 */
const EXT_DIR = path.resolve(__dirname, '../../../../dist/extension');

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
 * `extensionId`: the MV3 extension id resolved at runtime from the service
 *     worker URL.
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
        const ctx = await chromium.launchPersistentContext('', {
            channel: 'chromium',
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
        let [sw] = context.serviceWorkers();
        if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15_000 });
        const id = sw.url().split('/')[2];
        await use(id);
    },
    appPage: async ({ context, extensionId }, use) => {
        const open = async (applicationName: string) => {
            const page = await context.newPage();
            await page.goto(
                `chrome-extension://${extensionId}/views/app.html?applicationName=${applicationName}`
            );
            // Shell readiness signal — wait for the skeleton-full-view to render a heading.
            await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });
            return page;
        };
        await use(open);
    },
});

export { expect };
