import { test, expect } from './fixtures';

const isChat = process.env.E2E_EXTENSION_TARGET === 'chat';
test('memory editing, knowledge citations, and Drive selection persist across reload', async ({
    context,
    extensionId,
}, testInfo) => {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => console.error('Memory settings error:', error.message));
    await page.setViewportSize({ width: 480, height: 1000 });
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => chrome.storage.local.set({ tool_google_sheet_enabled: true }));
    await page.addInitScript(() => {
        chrome.identity.getAuthToken = (_options, callback) => callback('fixture-token');
    });
    await context.route('https://www.googleapis.com/drive/v3/files**', route => {
        if (route.request().url().includes('/export'))
            return route.fulfill({
                contentType: 'text/plain',
                body: 'Company guide\nThe approved slide template uses the blue logo.',
            });
        return route.fulfill({
            json: {
                files: [
                    {
                        id: 'guide',
                        name: 'Company guide',
                        mimeType: 'application/vnd.google-apps.document',
                    },
                ],
            },
        });
    });
    const open = async () => {
        await page.goto(
            `chrome-extension://${extensionId}/views/${isChat ? 'chat.html' : 'app.html?applicationName=settings&tab=ai'}`
        );
        if (isChat) await page.getByRole('button', { name: 'AI settings', exact: true }).click();
        await page.locator('agent-memory-manager summary').click();
    };
    await open();
    const manager = page.locator('agent-memory-manager');
    const notes = manager.getByRole('textbox', { name: 'Personal preferences', exact: true });
    await notes.fill('2026-09-20: Prefer explicit SOQL fields.');
    await manager.getByRole('button', { name: 'Save notes', exact: true }).click();
    await expect(manager.getByRole('status')).toContainText('Memory saved');
    await manager.locator('input[type=file]').setInputFiles({
        name: 'org-guide.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('Org guide\nThe integration key is Account.External_ID__c.'),
    });
    await expect(manager.getByRole('status')).toContainText('Documents added');
    await manager.getByRole('searchbox', { name: 'Search your knowledge' }).fill('integration');
    await manager.getByRole('button', { name: 'Search documents', exact: true }).click();
    await expect(manager.locator('article')).toContainText('Lines 1–2');
    await expect(manager.locator('article')).toContainText('Account.External_ID__c');
    await manager.getByRole('searchbox', { name: 'Find a Drive document' }).fill('Company');
    await manager.getByRole('button', { name: 'Search Drive', exact: true }).click();
    await expect(manager.getByRole('button', { name: 'Search Drive', exact: true })).toBeEnabled({
        timeout: 35000,
    });
    expect(await manager.getByRole('alert').allTextContents()).toEqual([]);
    await expect(manager.getByRole('status')).toContainText('Choose a file');
    await manager.getByRole('button', { name: 'Add or refresh', exact: true }).click();
    await expect(manager.getByRole('status')).toContainText('Drive document added');
    await open();
    await expect(notes).toHaveValue('2026-09-20: Prefer explicit SOQL fields.');
    await expect(manager.getByText('org-guide.md', { exact: true })).toBeVisible();
    await expect(manager.getByText('Company guide', { exact: true })).toBeVisible();
    await manager.screenshot({ path: testInfo.outputPath('memory-knowledge.png') });
    await manager.getByRole('button', { name: 'Forget these notes', exact: true }).click();
    await expect(notes).toHaveValue('');
    await manager
        .locator('li')
        .filter({ hasText: 'org-guide.md' })
        .getByRole('button', { name: 'Remove', exact: true })
        .click();
    await expect(manager.getByText('org-guide.md', { exact: true })).toHaveCount(0);
    await open();
    await expect(notes).toHaveValue('');
    await expect(manager.getByText('org-guide.md', { exact: true })).toHaveCount(0);
});
