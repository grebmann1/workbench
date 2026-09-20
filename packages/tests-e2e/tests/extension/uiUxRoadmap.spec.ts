import { test, expect } from './fixtures';

test('home tasks offer environment choice and recover from invalid input or cancellation', async ({
    appPage,
}) => {
    const page = await appPage('home');
    const home = page.locator('home-welcome');
    await expect(home.getByRole('button', { name: /Query data/ })).toBeVisible();
    await expect(home.getByRole('button', { name: /Inspect objects/ })).toBeVisible();
    await expect(home.getByRole('button', { name: /Run Apex/ })).toBeVisible();
    await home.getByRole('button', { name: /Query data/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Connect to use SOQL');
    await expect(dialog.getByRole('radio', { name: 'Production', exact: true })).toBeChecked();
    await dialog.getByText('Sandbox', { exact: true }).click();
    await expect(dialog.getByRole('radio', { name: 'Sandbox', exact: true })).toBeChecked();
    await dialog.getByText('My Domain', { exact: true }).click();
    await dialog.getByRole('textbox', { name: 'My Domain URL' }).fill('https://example.invalid');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(home.getByRole('button', { name: /Query data/ })).toBeFocused();
    await home.getByRole('button', { name: /Run Apex/ }).click();
    await dialog.getByRole('button', { name: 'Manage connections', exact: true }).click();
    await expect(page.locator('connection-app')).toBeVisible();
    await expect(
        page.getByRole('status').filter({ hasText: 'Connect to continue to' })
    ).toContainText('Apex');
    await page.getByRole('button', { name: 'Cancel task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cancel task', exact: true })).toBeHidden();
});

test('native tab buttons preserve inactive drafts and restore focus after closing', async ({
    appPage,
}) => {
    const page = await appPage('urlencoder');
    const header = page.locator('skeleton-header');
    const menu = page.locator('skeleton-menu');
    const draft = page.locator('urlencoder-app').getByRole('textbox').first();
    await draft.fill('Keep this draft');
    await menu.getByRole('button', { name: 'Text Compare', exact: true }).click();
    await menu.getByRole('button', { name: 'Settings', exact: true }).click();
    await header.getByRole('button', { name: 'Close Text Compare', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(header.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
    );
    await expect(header.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
    await header.getByRole('button', { name: 'URL Encoder', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(draft).toHaveValue('Keep this draft');
    await header.getByRole('button', { name: 'Close URL Encoder', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(header.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
    await header.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await expect(header.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute(
        'aria-current',
        'page'
    );
});

test('compact navigation and assistant retain tool drafts across size changes', async ({
    appPage,
}) => {
    const page = await appPage('urlencoder');
    const header = page.locator('skeleton-header');
    const menu = page.locator('skeleton-menu');
    const draft = page.locator('urlencoder-app').getByRole('textbox').first();
    await draft.fill('Survives resizing');
    await page.setViewportSize({ width: 1024, height: 768 });
    await header.getByRole('button', { name: 'Expand navigation', exact: true }).click();
    const search = menu.getByRole('searchbox', { name: 'Search tools and pages' });
    await expect(search).toBeFocused();
    await expect(draft).toBeHidden();
    await search.press('Escape');
    await expect(draft).toHaveValue('Survives resizing');
    await expect(
        header.getByRole('button', { name: 'Expand navigation', exact: true })
    ).toBeFocused();
    await header.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
    const separator = page.getByRole('separator', { name: 'Next Gen Agent width' });
    await expect(separator).toBeVisible();
    await separator.focus();
    await separator.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', /25[89]|260/);
    await separator.press('End');
    const maximum = Number(await separator.getAttribute('aria-valuemax'));
    await expect
        .poll(async () => Number(await separator.getAttribute('aria-valuenow')))
        .toBeGreaterThanOrEqual(maximum - 2);
    await page.setViewportSize({ width: 768, height: 768 });
    const back = page.getByRole('button', { name: 'Back to tool', exact: true });
    await expect(back).toBeFocused();
    await expect(draft).toBeHidden();
    await expect(separator).toBeHidden();
    await back.press('Escape');
    await expect(draft).toHaveValue('Survives resizing');
    await page.setViewportSize({ width: 600, height: 768 });
    await expect(
        page.getByRole('heading', { name: 'This tool needs a wider window' })
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(draft).toHaveValue('Survives resizing');
    await expect(search).toBeVisible();
    await header.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
    await header.getByRole('button', { name: 'Expand navigation', exact: true }).click();
    await page.setViewportSize({ width: 768, height: 600 });
    await page.reload();
    await expect(
        header.getByRole('button', { name: 'Expand navigation', exact: true })
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(
        header.getByRole('button', { name: 'Collapse navigation', exact: true })
    ).toBeVisible();
});

test('assistant drafts, active requests and navigation preferences survive layout changes', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        // This isolated profile uses a fake provider; no external model request is sent.
        // eslint-disable-next-line no-undef
        await chrome.storage.local.set({
            openai_key: 'ui-test-only',
            openai_url: 'https://provider.example/v1',
            ai_provider: 'openai',
        });
    });
    await context.route('https://provider.example/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-4o', object: 'model' }] } })
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`chrome-extension://${extensionId}/views/app.html?applicationName=urlencoder`);
    const header = page.locator('skeleton-header');
    await header.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
    await page.reload();
    await expect(
        header.getByRole('button', { name: 'Expand navigation', exact: true })
    ).toBeVisible();
    await header.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
    const prompt = page.getByRole('textbox', { name: 'Prompt input' });
    await expect(prompt).toBeVisible();
    await prompt.fill('Preserve this unsent assistant draft');
    const separator = page.getByRole('separator', { name: 'Next Gen Agent width' });
    const box = await separator.boundingBox();
    if (!box) throw new Error('Missing resize handle');
    await page.mouse.move(box.x + box.width / 2, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(0, box.y + 50);
    await page.mouse.up();
    const max = Number(await separator.getAttribute('aria-valuemax'));
    await expect
        .poll(async () => Number(await separator.getAttribute('aria-valuenow')))
        .toBeGreaterThanOrEqual(max - 2);
    await page.setViewportSize({ width: 768, height: 600 });
    await expect(prompt).toHaveValue('Preserve this unsent assistant draft');
    await page.getByRole('button', { name: 'Back to tool', exact: true }).click();
    await header.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
    await expect(prompt).toHaveValue('Preserve this unsent assistant draft');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(separator).toBeVisible();
    await expect(prompt).toHaveValue('Preserve this unsent assistant draft');
    await header.getByRole('button', { name: 'Close AI assistant', exact: true }).click();
    await expect(
        header.getByRole('button', { name: 'Expand navigation', exact: true })
    ).toBeVisible();

    let requests = 0;
    let release = () => {};
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    await context.route('https://provider.example/v1/responses', async route => {
        requests++;
        await gate;
        await route.abort().catch(() => {});
    });
    try {
        await header.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
        await prompt.fill('Keep this request active while resizing');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        await expect.poll(() => requests).toBe(1);
        await page.setViewportSize({ width: 768, height: 600 });
        await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Back to tool', exact: true }).click();
        await header.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
        expect(requests).toBe(1);
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
    } finally {
        release();
    }
});
