import { test, expect } from './fixtures';

test.skip(process.env.E2E_EXTENSION_TARGET !== 'chat', 'Requires the chat extension');

test('compact chat navigation fits narrow panels and supports conversation management', async ({
    context,
    extensionId,
}) => {
    await context.route('https://shop.fixture/**', route =>
        route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><title>Pokémon TCG: 30th Anniversary Mini Tin — Product availability and shipping details</title><h1>Product details</h1>',
        })
    );
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-5-mini', object: 'model' }] } })
    );
    const target = await context.newPage();
    await target.goto('https://shop.fixture/products/mini-tin');
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
        });
    });
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    await expect(
        page.getByRole('heading', { name: 'Your browser. A helping hand.' })
    ).toBeVisible();
    await expect(page.getByLabel('Browser target', { exact: true })).toContainText('Pokémon');
    const targetBox = await page.getByRole('region', { name: 'Browser context' }).boundingBox();
    expect(targetBox?.height).toBeLessThanOrEqual(40);
    await expect(page.getByRole('button', { name: 'Toggle debug mode' })).toHaveCount(0);

    const historyButton = page.getByRole('button', { name: 'Toggle conversations', exact: true });
    const rename = async (title: string) => {
        await page.getByRole('button', { name: 'Conversation options', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Rename conversation', exact: true }).click();
        await page.getByRole('textbox', { name: 'Conversation title', exact: true }).fill(title);
        await page.getByRole('button', { name: 'Save title', exact: true }).click();
        await expect(historyButton).toHaveText(title);
    };
    const longTitle = 'Review Pokémon stock, shipping options and delivery dates for Switzerland';
    await rename(longTitle);
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await rename('Plan my next task');
    await page.screenshot({ path: 'test-results/chat-compact.png' });

    await historyButton.focus();
    await page.keyboard.press('Enter');
    const history = page.getByRole('dialog', { name: 'Conversations', exact: true });
    const search = history.getByRole('searchbox', { name: 'Search conversations', exact: true });
    await expect(history).toBeVisible();
    await expect(search).toBeFocused();
    await search.fill('no matching title');
    await expect(history.getByText('No matching conversations.')).toBeVisible();
    await search.fill('pokémon');
    await expect(history.getByRole('button', { name: longTitle, exact: true })).toBeVisible();
    await history.getByRole('button', { name: longTitle, exact: true }).click();
    await expect(history).not.toBeVisible();
    await expect(historyButton).toHaveText(longTitle);
    await historyButton.click();
    await expect(search).toHaveValue('');
    await page.screenshot({ path: 'test-results/chat-conversations.png' });
    await page.keyboard.press('Escape');
    await expect(history).not.toBeVisible();
    await expect(historyButton).toBeFocused();

    for (const width of [320, 520, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        );
        const toolbar = await page.locator('.conversation-toolbar').boundingBox();
        expect(toolbar?.height).toBeLessThanOrEqual(44);
        const picker = await page.getByLabel('Browser target', { exact: true }).boundingBox();
        expect(picker!.x + picker!.width).toBeLessThanOrEqual(width);
        await historyButton.click();
        const bounds = await history.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        await page.keyboard.press('Escape');
    }

    await historyButton.click();
    await history.getByRole('button', { name: 'Delete Plan my next task', exact: true }).click();
    await expect(
        history.getByRole('button', { name: 'Delete Plan my next task', exact: true })
    ).toHaveCount(0);
    await expect(search).toBeFocused();
    await history.getByRole('button', { name: 'New chat', exact: true }).click();
    await expect(history).not.toBeVisible();
    await expect(historyButton).toHaveText('Conversation 2');
});
