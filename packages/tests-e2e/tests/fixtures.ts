import { test as base, expect, type Page } from '@playwright/test';

/**
 * Playwright fixtures for Workbench smokes.
 *
 * `shell`: a Page already navigated to `/welcome/` with the main landmark
 *     visible. Tests can then click into apps or navigate elsewhere.
 * `appRoute(name)`: route helper that returns the app's URL path, i.e.
 *     `appRoute('urlencoder')` → `/urlencoder/`. Kept trivial today because
 *     the shell uses top-level path slugs (see APPLICATION_ENTRIES).
 */
export const appRoute = (name: string) => `/${name}/`;

type Fixtures = {
    shell: Page;
};

export const test = base.extend<Fixtures>({
    shell: async ({ page }, use) => {
        await page.goto('/welcome/');
        await expect(page).toHaveTitle(/Workbench/i);
        const main = page.locator('main, [role="main"]').first();
        await expect(main).toBeVisible();
        await use(page);
    },
});

export { expect };
