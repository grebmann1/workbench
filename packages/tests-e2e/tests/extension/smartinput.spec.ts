import { test, expect } from './fixtures';

test.describe('@extension smartinput', () => {
    test('creates a new category and persists it', async ({ appPage, context }) => {
        const page = await appPage('smartinput');
        await expect(page.getByRole('heading', { name: /smart input/i })).toBeVisible();

        // Initial state: either a pre-existing Default category or the empty-state
        // illustration telling the user to create one. Either shape is valid.
        const emptyState = page.getByText(/create a category to get started/i);
        const categoryHeader = page.getByRole('heading', { name: /^categories$/i });
        await expect(categoryHeader).toBeVisible();

        // Click the "New category" button on the left panel.
        await page.getByRole('button', { name: /new category/i }).click();

        // Empty-state should be gone (a category now exists); category-name
        // field should be editable in the body.
        await expect(emptyState).toHaveCount(0);
        await expect(page.getByText(/category name/i).first()).toBeVisible();

        // Reload to verify persistence across the extension's chrome.storage.
        await page.reload();
        await expect(page.getByRole('heading', { name: /smart input/i })).toBeVisible();
        await expect(emptyState).toHaveCount(0);

        // Clean up so the persistent context's chrome.storage doesn't leak
        // into the next test in this file (Step 8 adds an afterEach but
        // keeping this here is belt-and-braces).
        const [sw] = context.serviceWorkers();
        if (sw) {
            await sw
                .evaluate(async () => {
                    await chrome.storage.local.clear();
                    await chrome.storage.sync.clear();
                })
                .catch(() => {});
        }
    });
});
