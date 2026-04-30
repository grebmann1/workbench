import { test, expect } from './fixtures';

test.describe('@extension files', () => {
    // Per plan Step 6: IndexedDB is empty on first launch. Cover only the
    // empty-state branch — seeding the virtual FS is Track 2 territory.
    test('renders shell with the Refresh toolbar action', async ({ appPage }) => {
        const page = await appPage('files');
        // Shell heading renders "Explorers" as the top title + "Files" as
        // the sub-title — match either to avoid coupling to exact layout.
        await expect(page.getByRole('heading').filter({ hasText: /files/i }).first()).toBeVisible();

        // Refresh button is always present — acts as a smoke signal that the
        // toolbar rendered.
        await expect(page.getByRole('button', { name: /refresh/i }).first()).toBeVisible();
    });

    test('shows the tree region alongside the toolbar', async ({ appPage }) => {
        const page = await appPage('files');
        // Any tree-style container should be visible — the app always renders
        // a navigation/tree region even on empty FS. Use role=tree or
        // role=navigation; either signals the sidebar mounted.
        const navOrTree = page
            .getByRole('tree')
            .or(page.getByRole('navigation'))
            .or(page.locator('[role="tree"], [role="navigation"]'));
        await expect(navOrTree.first()).toBeVisible();
    });
});
