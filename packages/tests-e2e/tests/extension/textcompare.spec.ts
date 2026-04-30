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

    test('clear toolbar button is clickable without throwing', async ({ appPage }) => {
        const page = await appPage('textcompare');
        // Clicking Clear on an already-empty editor is a safe no-op that
        // still exercises the click handler wiring. If the handler throws,
        // Playwright surfaces the uncaught exception via page errors.
        const errors: Error[] = [];
        page.on('pageerror', e => errors.push(e));
        await page.getByRole('button', { name: /^clear$/i }).click();
        expect(errors).toEqual([]);
    });
});
