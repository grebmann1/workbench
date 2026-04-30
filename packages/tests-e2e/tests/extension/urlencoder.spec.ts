import { test, expect } from './fixtures';

test.describe('@extension urlencoder', () => {
    test('renders shell and encodes input text', async ({ appPage }) => {
        const page = await appPage('urlencoder');
        await expect(page.getByRole('heading', { name: /url encoder/i })).toBeVisible();

        const input = page.getByRole('textbox', { name: /input/i });
        const output = page.getByRole('textbox', { name: /output/i });
        await expect(input).toBeVisible();
        await expect(output).toBeVisible();

        // Encode path — default mode on first mount.
        await input.fill('hello world&foo=bar');
        await page.getByRole('button', { name: /^run$/i }).click();
        await expect(output).toHaveValue(/hello%20world/);
    });
});
