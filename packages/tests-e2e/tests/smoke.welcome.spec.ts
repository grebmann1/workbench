import { test, expect } from '@playwright/test';

test('welcome page: title mentions Workbench and a main landmark is visible', async ({ page }) => {
    await page.goto('/welcome/');
    await expect(page).toHaveTitle(/Workbench/i);
    // Page should expose at least one main landmark.
    const main = page.locator('main, [role="main"]').first();
    await expect(main).toBeVisible();
});
