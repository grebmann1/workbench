import { test, expect } from './fixtures';

test.skip(process.env.E2E_EXTENSION_TARGET === 'chat', 'Requires the Workbench extension');

test('Workbench chat shares the conversation presentation with a Workbench palette and Salesforce context', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-5-mini', object: 'model' }] } })
    );
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
            einstein_agent_conversation_data: {
                schemaVersion: 1,
                activeConversationId: 'presentation',
                selectedModel: 'gpt-5-mini',
                conversations: [
                    {
                        id: 'presentation',
                        title: 'Review opportunity totals',
                        streamHistory: [
                            { role: 'user', content: 'Check the opportunity export totals.' },
                            {
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'reasoning',
                                        text: '**Checking the export**\nI will count the exported opportunities.',
                                        state: 'done',
                                    },
                                    {
                                        type: 'tool-call',
                                        toolCallId: 'count-1',
                                        toolName: 'exec',
                                        input: {
                                            description: 'Count the exported opportunities',
                                            command: 'wc -l /workspace/opportunities.csv',
                                        },
                                    },
                                ],
                            },
                            {
                                role: 'tool',
                                content: [
                                    {
                                        type: 'tool-result',
                                        toolCallId: 'count-1',
                                        toolName: 'exec',
                                        output: {
                                            type: 'json',
                                            value: {
                                                stdout: '3 opportunities\n',
                                                stderr: 'Using the exported data\n',
                                                exitCode: 0,
                                            },
                                        },
                                    },
                                ],
                            },
                            {
                                role: 'assistant',
                                content: 'The export contains **3 opportunities**.',
                            },
                        ],
                    },
                ],
            },
        });
    });
    await page.goto(`chrome-extension://${extensionId}/views/app.html?applicationName=urlencoder`);
    await page
        .locator('skeleton-header')
        .getByRole('button', { name: 'Open AI assistant', exact: true })
        .click();
    const chat = page.locator('agent-app');
    await expect(chat.locator('.assistant-speaker').first()).toHaveText('You');
    await expect(chat.getByText('The export contains', { exact: false })).toBeVisible();
    await page.screenshot({ path: 'test-results/workbench-chat-transcript.png' });
    // Presentation must not activate the standalone extension's browser capabilities.
    expect(
        await chat.evaluate(element => ({
            browser: Reflect.get(element, 'browserAgentEnabled'),
            style: Reflect.get(element, 'assistantStyle'),
            theme: Reflect.get(element, 'assistantTheme'),
        }))
    ).toEqual({ browser: false, style: true, theme: 'workbench' });

    const activity = chat.locator('.assistant-activity-group details > summary');
    const tool = chat.locator('.assistant-tool-card[data-tool="exec"]');
    await expect(tool).not.toBeVisible();
    await activity.focus();
    await page.keyboard.press('Enter');
    await expect(tool).toBeVisible();
    const reasoning = chat.getByRole('button', { name: 'Checking the export', exact: true });
    await reasoning.click();
    await expect(reasoning).toHaveAttribute('aria-expanded', 'true');
    await expect(chat.locator('.reasoning-block-body')).toContainText('exported opportunities');
    await tool.getByRole('button', { name: 'Expand exec details', exact: true }).click();
    await expect(tool).toContainText('3 opportunities');
    await expect(tool).toContainText('Using the exported data');
    await expect(tool).toContainText('Exit code: 0');

    const prompt = chat.getByRole('textbox', { name: 'Prompt input', exact: true });
    await expect(prompt).toHaveAttribute(
        'placeholder',
        'Ask about Salesforce, your data, or your tools…'
    );
    await prompt.fill('Keep this Workbench draft');
    await expect(chat.getByRole('button', { name: 'Send', exact: true })).toHaveCSS(
        'background-color',
        'rgb(1, 118, 211)'
    );
    await expect(chat.locator('.chat-input-container')).toHaveCSS(
        'border-top-color',
        'rgb(1, 118, 211)'
    );
    await expect(chat.locator('.reasoning-button_active')).toHaveCSS('color', 'rgb(1, 118, 211)');

    const separator = page.getByRole('separator', { name: 'Next Gen Agent width' });
    await separator.focus();
    await separator.press('Home');
    await expect(separator).toHaveAttribute('aria-valuenow', /25[89]|260/);
    const panel = await chat.boundingBox();
    for (const control of [
        chat.locator('.conversation-toolbar'),
        chat.locator('.assistant-composer'),
    ]) {
        const box = await control.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(panel!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1);
    }
    await expect(prompt).toHaveValue('Keep this Workbench draft');
    await page.screenshot({ path: 'test-results/workbench-chat-narrow.png' });
    await page.setViewportSize({ width: 768, height: 700 });
    await expect(prompt).toHaveValue('Keep this Workbench draft');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
    );

    const historyButton = chat.getByRole('button', { name: 'Toggle conversations', exact: true });
    await historyButton.click();
    const history = chat.getByRole('dialog', { name: 'Conversations', exact: true });
    const search = history.getByRole('searchbox', { name: 'Search conversations', exact: true });
    await expect(search).toBeFocused();
    await search.fill('no matching title');
    await expect(history.getByText('No matching conversations.')).toBeVisible();
    await search.fill('opportunity');
    await page.screenshot({ path: 'test-results/workbench-chat-history.png' });
    await history.getByRole('button', { name: /^Review opportunity totals/ }).click();
    await expect(history).not.toBeVisible();
    await historyButton.click();
    await page.keyboard.press('Escape');
    await expect(historyButton).toBeFocused();
    await expect(prompt).toHaveValue('Keep this Workbench draft');

    await chat.getByRole('button', { name: 'New conversation', exact: true }).click();
    await expect(
        chat.getByRole('button', { name: 'Write a SOQL query for QTD opportunities' })
    ).toBeVisible();
    await expect(chat.getByText('Give me a goal.', { exact: false })).toHaveCount(0);
    await chat.getByRole('button', { name: 'Conversation options', exact: true }).click();
    await chat.getByRole('menuitem', { name: 'Rename conversation', exact: true }).click();
    await chat
        .getByRole('textbox', { name: 'Conversation title', exact: true })
        .fill('Plan deployment');
    await chat.getByRole('button', { name: 'Save title', exact: true }).click();
    await expect(historyButton).toHaveText('Plan deployment');
    await chat.getByRole('button', { name: 'Conversation options', exact: true }).click();
    await chat.getByRole('menuitem', { name: 'Rename conversation', exact: true }).click();
    const title = chat.getByRole('textbox', { name: 'Conversation title', exact: true });
    await title.fill('Discard this title');
    await title.press('Escape');
    await expect(historyButton).toHaveText('Plan deployment');
    await expect(prompt).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'test-results/workbench-chat-empty.png' });
});

test('Workbench extension side-panel chat keeps the same blue presentation at narrow widths', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-5-mini', object: 'model' }] } })
    );
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
        });
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`chrome-extension://${extensionId}/views/default.html`);
    await page.getByTitle('Agent', { exact: true }).click();
    const chat = page.locator('agent-app');
    const prompt = chat.getByRole('textbox', { name: 'Prompt input', exact: true });
    await expect(
        chat.getByRole('button', { name: 'Write a SOQL query for QTD opportunities' })
    ).toBeVisible();
    expect(await chat.evaluate(element => Reflect.get(element, 'browserAgentEnabled'))).toBe(false);
    await prompt.fill('Help with a SOQL query');
    await expect(chat.getByRole('button', { name: 'Send', exact: true })).toHaveCSS(
        'background-color',
        'rgb(1, 118, 211)'
    );
    for (const width of [320, 520, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        );
        const composer = await chat.locator('.assistant-composer').boundingBox();
        expect(composer!.x + composer!.width).toBeLessThanOrEqual(width);
        await expect(prompt).toHaveValue('Help with a SOQL query');
    }
    await page.screenshot({ path: 'test-results/workbench-chat-sidepanel.png' });
});
