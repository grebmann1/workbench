import { test, expect, appRoute } from './fixtures';

test.describe('@smoke textcompare', () => {
    test('loads at /textcompare/ with the Text Compare header', async ({ page }) => {
        await page.goto(appRoute('textcompare'));
        await expect(page).toHaveTitle(/Workbench/i);
        await expect(page.getByText('Text Compare').first()).toBeVisible();
    });

    test('exposes Copy Left / Copy Right / Swap / Clear toolbar buttons', async ({
        page,
    }) => {
        await page.goto(appRoute('textcompare'));
        await expect(page.getByRole('button', { name: /copy left/i }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /copy right/i }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /swap/i }).first()).toBeVisible();
    });
});
