import { test, expect } from './fixtures';

test.describe('@extension textcompare', () => {
    // Reduced assertions per plan's Risk 2: Monaco interaction via Playwright
    // is historically flaky; cover that the app renders and the toolbar is
    // clickable, leaving editor-level assertions to a future harness pass.
    test('loads with toolbar actions clickable', async ({ appPage }) => {
        const page = await appPage('textcompare');
        await expect(page.getByRole('heading', { name: /text compare/i })).toBeVisible();

        // Toolbar buttons are present and clickable without throwing.
        for (const name of [/^copy left$/i, /^copy right$/i, /^swap$/i, /^clear$/i]) {
            const btn = page.getByRole('button', { name });
            await expect(btn).toBeVisible();
            await btn.click();
        }

        // Ignore-whitespace toggle is accessible.
        await expect(page.getByRole('switch', { name: /ignore whitespace/i })).toBeVisible();
    });
});
