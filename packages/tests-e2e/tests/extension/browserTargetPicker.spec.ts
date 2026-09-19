import { test, expect } from './fixtures';

test.skip(process.env.E2E_EXTENSION_TARGET !== 'chat', 'Requires the chat extension');

test('tab picker supports search, keyboard selection, pinned targets and closed-tab recovery', async ({
    context,
    extensionId,
}) => {
    await context.route('https://catalog.fixture/**', route =>
        route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><title>Pokémon anniversary collection</title><h1>Collection</h1>',
        })
    );
    await context.route('https://docs.fixture/**', route =>
        route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><title>Browser workflow guide</title><h1>Guide</h1>',
        })
    );
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({
            json: { data: [{ id: 'gpt-5-mini', object: 'model' }] },
        })
    );
    const catalog = await context.newPage();
    await catalog.goto('https://catalog.fixture/collection');
    const docs = await context.newPage();
    await docs.goto('https://docs.fixture/guide');
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
        });
    });
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    const trigger = page.getByRole('button', { name: 'Browser target', exact: true });
    const picker = page.getByRole('dialog', { name: 'Choose a tab', exact: true });
    const search = picker.getByRole('searchbox', { name: 'Search tabs', exact: true });
    const prompt = page.getByRole('textbox', { name: 'Prompt input', exact: true });
    await prompt.fill('Keep this draft while choosing a page');
    await trigger.click();
    await expect(search).toBeFocused();
    await expect(picker.getByText('2 tabs available', { exact: true })).toBeVisible();
    await search.fill('DOCS.FIXTURE');
    await expect(picker.locator('.tab-picker-option')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(picker.locator('.tab-picker-option')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(picker).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText('Browser workflow guide');
    const pinned = await trigger.getAttribute('data-tab-id');
    expect(pinned).toBeTruthy();
    await expect(prompt).toHaveValue('Keep this draft while choosing a page');

    const other = await context.newPage();
    await other.goto('https://catalog.fixture/new');
    await page.bringToFront();
    await trigger.click();
    await expect(search).toHaveValue('');
    await expect(picker.getByText('3 tabs available', { exact: true })).toBeVisible();
    await expect(trigger).toHaveAttribute('data-tab-id', pinned!);
    await expect(picker.locator('.tab-picker-option[aria-pressed="true"]')).toContainText(
        'Browser workflow guide'
    );
    await page.screenshot({ path: 'test-results/chat-tab-picker.png' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await expect(picker.locator('.tab-picker-option').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(picker.locator('.tab-picker-option').first()).toBeFocused();
    await search.fill('unmatched website');
    await expect(picker.getByText('No matching tabs', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('data-tab-id', pinned!);

    for (const [width, height] of [
        [320, 360],
        [520, 780],
        [390, 780],
    ]) {
        await page.setViewportSize({ width, height });
        await trigger.click();
        const bounds = await picker.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        );
        await picker.getByRole('button', { name: 'Close tab picker', exact: true }).click();
        await expect(trigger).toBeFocused();
    }
    await page.screenshot({ path: 'test-results/chat-tab-button.png' });
    await trigger.click();
    await page.mouse.click(2, 150);
    await expect(picker).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await docs.close();
    await expect(trigger).toContainText('Previous tab closed');
    await expect(trigger).toHaveAttribute('data-tab-id', pinned!);
    await catalog.close();
    await other.close();
    await trigger.click();
    await expect(picker.getByText('No web tabs open', { exact: true })).toBeVisible();
    const replacement = await context.newPage();
    await replacement.goto('https://docs.fixture/reopened');
    await expect(picker.locator('.tab-picker-option')).toHaveCount(1);
    await search.fill('workflow');
    await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    await expect(picker).toBeVisible();
    await search.press('Enter');
    await expect(picker).not.toBeVisible();
    await expect(trigger).toContainText('Browser workflow guide');
    expect(await trigger.getAttribute('data-tab-id')).not.toBe(pinned);
    await expect(prompt).toHaveValue('Keep this draft while choosing a page');
});
