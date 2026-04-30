import { test, expect } from './fixtures';

test.describe('@extension textcompare', () => {
    // Reduced assertions per plan Risk 2: Monaco interaction via Playwright
    // is historically flaky, and the ignore-whitespace toggle sits inside a
    // shadowed lightning-input that doesn't always expose a `switch` role.
    // Cover that the app's shell + headline toolbar actions render.
    test('renders shell and toolbar actions', async ({ appPage }) => {
        const page = await appPage('textcompare');
        await expect(page.getByRole('heading', { name: /text compare/i })).toBeVisible();

        // Toolbar buttons are visible. Don't click them — some depend on
        // editor state that isn't populated in this smoke.
        for (const name of [/^copy left$/i, /^copy right$/i, /^swap$/i, /^clear$/i]) {
            await expect(page.getByRole('button', { name })).toBeVisible();
        }
    });
});
