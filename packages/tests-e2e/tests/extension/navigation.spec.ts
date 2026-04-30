import { test, expect } from './fixtures';

test.describe('@extension navigation', () => {
    test('deep-links between offline apps via applicationName query param', async ({ appPage }) => {
        const urlencoderPage = await appPage('urlencoder');
        await expect(urlencoderPage.getByRole('heading', { name: /url encoder/i })).toBeVisible();

        // New tab, same persistent context — shell should honor the
        // applicationName query param on a fresh load.
        const textcomparePage = await appPage('textcompare');
        await expect(textcomparePage.getByRole('heading', { name: /text compare/i })).toBeVisible();

        // The original tab is still on urlencoder; deep-links don't leak.
        await expect(urlencoderPage.getByRole('heading', { name: /url encoder/i })).toBeVisible();
    });
});
