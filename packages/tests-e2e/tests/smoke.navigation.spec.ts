import { test, expect, appRoute } from './fixtures';

test.describe('@smoke navigation', () => {
    test('direct deep-link from welcome → urlencoder route', async ({ page }) => {
        await page.goto('/welcome/');
        await expect(page).toHaveTitle(/Workbench/i);

        // Simulate what the shell menu does: navigate to the app path slug.
        await page.goto(appRoute('urlencoder'));
        await expect(page).toHaveURL(/\/urlencoder\/?$/);
        await expect(page.getByText('URL Encoder').first()).toBeVisible();
    });

    test('unknown route does not crash the shell', async ({ page }) => {
        await page.goto('/thisrouteshouldnotexist/');
        // Shell should still render a main landmark rather than a blank page.
        const main = page.locator('main, [role="main"]').first();
        await expect(main).toBeVisible();
    });
});
