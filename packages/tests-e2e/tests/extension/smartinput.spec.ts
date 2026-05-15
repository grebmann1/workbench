import { test, expect } from './fixtures';

test.describe('@extension smartinput', () => {
    test('creates a category and saves a snippet', async ({ appPage }) => {
        const page = await appPage('smartinput');
        await expect(page.getByRole('heading', { name: /smart input/i })).toBeVisible();

        // Fresh load shows the "No category" empty state — bootstrap by
        // creating a category, which reveals the composer textarea.
        await page.getByRole('button', { name: /new category/i }).click();

        const input = page.getByRole('textbox', { name: /smart input value/i });
        await expect(input).toBeVisible({ timeout: 15_000 });

        // Enter (without shift) is the composer's primary save action; it
        // dispatches `createitems` and renders a smartinput-item row.
        await input.fill('hello@example.com');
        await input.press('Enter');

        // Newly created item exposes its action group via aria-label.
        await expect(page.getByRole('button', { name: /^apply$/i }).first()).toBeVisible({
            timeout: 15_000,
        });
        await expect(page.getByText('hello@example.com').first()).toBeVisible();
    });
});
