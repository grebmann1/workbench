import { test, expect } from './fixtures';

test('side-panel onboarding opens the full app directly at AI settings', async ({
    context,
    extensionId,
}) => {
    test.skip(process.env.E2E_EXTENSION_TARGET === 'chat', 'Core side-panel entry point');
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/views/default.html`);
    await panel.getByTitle('Agent', { exact: true }).click();
    await panel.getByRole('button', { name: /Developer, Administrator, etc/ }).click();
    const [settings] = await Promise.all([
        context.waitForEvent('page', { timeout: 5000 }),
        panel.getByRole('button', { name: 'Open Settings → AI' }).click(),
    ]);
    await expect(settings.getByRole('tab', { name: 'AI', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
    );
    await expect(
        settings.locator('agent-ai-settings lightning-input[data-key="openai_key"] input')
    ).toBeVisible();
});

test('full-app assistant onboarding opens the AI settings tab', async ({ appPage }) => {
    test.skip(process.env.E2E_EXTENSION_TARGET === 'chat', 'Core app entry point');
    const page = await appPage('urlencoder');
    await page
        .locator('skeleton-header')
        .getByRole('button', { name: 'Open AI assistant', exact: true })
        .click();
    await page.getByRole('button', { name: /Developer, Administrator, etc/ }).click();
    await page.getByRole('button', { name: 'Open Settings → AI' }).click();
    await expect(page.getByRole('tab', { name: 'AI', exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
    );
    await expect(
        page.locator('agent-ai-settings lightning-input[data-key="openai_key"] input')
    ).toBeVisible();
});

test('Open Settings AI opens provider controls and dismisses setup when already in Settings', async ({
    context,
    extensionId,
    appPage,
}) => {
    const isChat = process.env.E2E_EXTENSION_TARGET === 'chat';
    const page = isChat ? await context.newPage() : await appPage('settings');
    if (isChat) {
        await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
        await page.getByRole('button', { name: /Developer, Administrator, etc/ }).click();
        await page.getByRole('button', { name: 'Open Settings → AI' }).click();
        await expect(page.getByRole('heading', { name: 'AI Settings', exact: true })).toBeVisible();
        await page.getByText('API keys & endpoints', { exact: false }).first().click();
        await page.locator('.api-provider > summary').filter({ hasText: 'OpenAI' }).click();
    } else {
        await page.getByRole('tab', { name: 'AI', exact: true }).click();
    }
    await expect(
        page.locator('agent-ai-settings lightning-input[data-key="openai_key"] input')
    ).toBeVisible();
    await page.getByRole('button', { name: 'Setup AI Provider', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'AI Provider Setup' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Developer, Administrator, etc/ }).click();
    await dialog.getByRole('button', { name: 'Open Settings → AI' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
        page.locator('agent-ai-settings lightning-input[data-key="openai_key"] input')
    ).toBeVisible();
    if (!isChat) {
        await page.goto(
            `chrome-extension://${extensionId}/views/app.html?applicationName=settings&tab=ai`
        );
        await expect(page.getByRole('tab', { name: 'AI', exact: true })).toHaveAttribute(
            'aria-selected',
            'true'
        );
        await expect(
            page.locator('agent-ai-settings lightning-input[data-key="openai_key"] input')
        ).toBeVisible();
    }
});
