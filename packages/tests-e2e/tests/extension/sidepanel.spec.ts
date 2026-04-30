import { test, expect } from './fixtures';

test.describe('@extension sidepanel', () => {
    // Playwright can't click the pinned toolbar icon (it's in browser chrome,
    // not a page) and chrome.sidePanel.open() requires a user gesture we
    // can't synthesize. But when Chrome DOES open the panel it loads
    // `views/default.html` — the `STABLE_SIDEPANEL_PATH` constant in
    // `packages/extension/src/workers/background.js`. Verify that
    // destination still mounts without throwing; a regression here breaks
    // the pin-and-click UX even though the trigger itself is untestable.
    test('destination page renders without a page error', async ({ context, extensionId }) => {
        const errors: Error[] = [];
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e));

        await page.goto(`chrome-extension://${extensionId}/views/default.html`);

        // Either of the two top-level panel custom elements signals the
        // shell mounted. Use `toBeAttached` rather than `toBeVisible` —
        // panels-salesforce is CSS-hidden when not on a Salesforce tab.
        await expect(
            page.locator('panels-default, panels-salesforce').first()
        ).toBeAttached({ timeout: 15_000 });
        expect(errors).toEqual([]);
    });
});
