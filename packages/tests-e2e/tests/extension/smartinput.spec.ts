import { test, expect } from './fixtures';

test.describe('@extension smartinput', () => {
    test('redirects to home while the beta app is disabled by default', async ({ appPage }) => {
        const page = await appPage('smartinput');

        // Smart Input is beta-gated off in a clean extension context. The
        // shell should redirect to Home instead of rendering the disabled app.
        await expect(page.getByRole('heading', { name: /^workbench$/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /smart input/i })).toHaveCount(0);
    });
});
