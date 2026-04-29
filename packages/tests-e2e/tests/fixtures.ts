import { test as base, expect, type Page } from '@playwright/test';

/**
 * Playwright fixtures for the Workbench landing site (apps/ui, port 27100).
 *
 * `welcome`: a Page already navigated to `/welcome/` with the main hero
 *     heading visible.
 *
 * Note: Playwright here covers the public landing / welcome site, not the
 *     in-extension LWC apps (those are built into the Chrome extension and
 *     only render from chrome-extension:// URLs). Extension-side coverage
 *     lives in the unit-test suite.
 */
type Fixtures = {
    welcome: Page;
};

export const test = base.extend<Fixtures>({
    welcome: async ({ page }, use) => {
        await page.goto('/welcome/');
        await expect(page).toHaveTitle(/Workbench/i);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await use(page);
    },
});

export { expect };
