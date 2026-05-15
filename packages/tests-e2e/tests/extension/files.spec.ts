import { test, expect } from './fixtures';
import { btn, h } from './helpers/domHelpers';

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
        await expect(btn(page, /refresh/i).first()).toBeVisible();
    });

    // Happy-path: clicking Refresh on an empty FS should redraw the tree
    // without throwing — the preview empty-state copy stays visible. This
    // exercises the only toolbar action available without a selection.
    test('refresh action keeps empty-state preview message visible', async ({ appPage }) => {
        const page = await appPage('files');
        const emptyMessage = page.getByText(/select a file from the tree to preview its contents/i);
        await expect(emptyMessage).toBeVisible({ timeout: 15_000 });

        await btn(page, /refresh/i)
            .first()
            .click();

        // Refresh re-reads /workspace; with no selection the same empty-
        // state copy must still be the active preview branch.
        await expect(emptyMessage).toBeVisible({ timeout: 15_000 });
        await expect(h(page, /files/i).first()).toBeVisible();
    });

    // Unhappy-path: with nothing selected, the conditional toolbar actions
    // (Download / Copy / Delete) must NOT render — only Refresh remains.
    // Guards against regressions that would surface stale buttons targeting
    // a null selection.
    test('toolbar hides selection-only actions when nothing is picked', async ({ appPage }) => {
        const page = await appPage('files');
        await expect(btn(page, /refresh/i).first()).toBeVisible({ timeout: 15_000 });

        // No selection => Download, Copy, Delete are guarded by lwc:if and
        // should be absent from the DOM entirely.
        await expect(btn(page, /^download$/i)).toHaveCount(0);
        await expect(btn(page, /^copy$/i)).toHaveCount(0);
        await expect(btn(page, /^delete$/i)).toHaveCount(0);

        // And the preview pane shows the "select a file" hint rather than a
        // spinner or error.
        await expect(
            page.getByText(/select a file from the tree to preview its contents/i)
        ).toBeVisible();
    });
});
