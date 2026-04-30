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

    test('decode mode reverses a percent-encoded string', async ({ appPage }) => {
        const page = await appPage('urlencoder');
        const input = page.getByRole('textbox', { name: /input/i });
        const output = page.getByRole('textbox', { name: /output/i });

        // Flip to Decode, paste encoded text, Run, assert decoded output.
        // The SLDS radio visual overlay (slds-radio_faux) intercepts clicks
        // on the actual input — click the label by text instead.
        await page.locator('label').filter({ hasText: /^decode$/i }).click();
        await input.fill('hello%20world%26foo%3Dbar');
        await page.getByRole('button', { name: /^run$/i }).click();
        await expect(output).toHaveValue('hello world&foo=bar');
    });
});
