import { test, expect } from './fixtures';

test.describe('@extension files', () => {
    // Per plan Step 6: IndexedDB is empty on first launch. Cover only the
    // empty-state branch — seeding the virtual FS is Track 2 territory.
    test('renders empty-state preview on first launch', async ({ appPage }) => {
        const page = await appPage('files');
        await expect(page.getByRole('heading', { name: /^files$/i })).toBeVisible();

        // Empty-state copy in the preview pane when no file is selected.
        await expect(
            page.getByText(/select a file from the tree to preview its contents/i)
        ).toBeVisible();

        // Refresh button is always present — acts as a smoke signal that the
        // toolbar rendered.
        await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
    });
});
