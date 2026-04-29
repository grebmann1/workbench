import { test, expect } from './fixtures';

test.describe('@extension urlencoder', () => {
    test('encodes and decodes input text', async ({ appPage }) => {
        const page = await appPage('urlencoder');
        await expect(page.getByRole('heading', { name: /url encoder/i })).toBeVisible();

        const input = page.getByRole('textbox', { name: /input/i });
        const output = page.getByRole('textbox', { name: /output/i });

        await input.fill('hello world&foo=bar');
        await page.getByRole('button', { name: /^run$/i }).click();
        await expect(output).toHaveValue(/hello%20world/);

        await page.getByRole('radio', { name: /decode/i }).check();
        await input.fill('hello%20world%26foo%3Dbar');
        await page.getByRole('button', { name: /^run$/i }).click();
        await expect(output).toHaveValue('hello world&foo=bar');
    });
});
