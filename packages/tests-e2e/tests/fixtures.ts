import { test as base, expect, type Page } from '@playwright/test';

/**
 * Playwright fixtures for the Workbench landing site (apps/ui, port 27100).
 *
 * `welcome`: a Page already navigated to `/welcome/` with the main hero
 *     heading visible.
 *
 * `consoleErrors`: an array that collects console-error messages for the
 *     duration of a single test. Tests that want a clean console can
 *     assert `expect(consoleErrors).toEqual([])` at the end. Subscribed
 *     to the current test's `page` (so it stays scoped per test and is
 *     auto-torn down with Playwright's page lifecycle).
 *
 * Note: Playwright here covers the public landing / welcome site, not the
 *     in-extension LWC apps (those are built into the Chrome extension and
 *     only render from chrome-extension:// URLs). Extension-side coverage
 *     lives in the unit-test suite.
 */
type Fixtures = {
    welcome: Page;
    consoleErrors: string[];
};

export const test = base.extend<Fixtures>({
    welcome: async ({ page }, use) => {
        await page.goto('/welcome/');
        await expect(page).toHaveTitle(/Workbench/i);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await use(page);
    },

    consoleErrors: async ({ page }, use) => {
        const errors: string[] = [];
        const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
            if (msg.type() === 'error') errors.push(msg.text());
        };
        page.on('console', onConsole);
        await use(errors);
        page.off('console', onConsole);
    },
});

export { expect };
