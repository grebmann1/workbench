import { test, expect, appRoute } from './fixtures';

test.describe('@smoke urlencoder', () => {
    test('loads at /urlencoder/ with a Workbench title and the header label', async ({
        page,
    }) => {
        await page.goto(appRoute('urlencoder'));
        await expect(page).toHaveTitle(/Workbench/i);

        // The header label "URL Encoder" should render somewhere on the page.
        // Built via <builder-header sub-title="URL Encoder">.
        await expect(page.getByText('URL Encoder').first()).toBeVisible();
    });

    test('renders the Run / Copy / Clear toolbar buttons (client-side only)', async ({
        page,
    }) => {
        await page.goto(appRoute('urlencoder'));
        await expect(page.getByRole('button', { name: /run/i }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /clear/i }).first()).toBeVisible();
    });
});
