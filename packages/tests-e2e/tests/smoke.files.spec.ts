import { test, expect, appRoute } from './fixtures';

test.describe('@smoke files', () => {
    test('loads at /files/ with the Files header', async ({ page }) => {
        await page.goto(appRoute('files'));
        await expect(page).toHaveTitle(/Workbench/i);
        await expect(page.getByText('Files').first()).toBeVisible();
    });
});
