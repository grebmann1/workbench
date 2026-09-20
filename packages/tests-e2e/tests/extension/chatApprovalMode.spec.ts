import { test, expect } from './fixtures';

const isChat = process.env.E2E_EXTENSION_TARGET === 'chat';

test('conversation options use the compact ellipsis button and retain keyboard navigation', async ({
    context,
    extensionId,
}, testInfo) => {
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
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-4o', object: 'model' }] } })
    );
    await page.goto(`chrome-extension://${extensionId}/views/${isChat ? 'chat' : 'default'}.html`);
    if (!isChat) await page.getByTitle('Agent', { exact: true }).click();
    const chat = page.locator('agent-app');
    await expect(chat.getByRole('textbox', { name: 'Prompt input' })).toBeFocused();
    const menu = chat.getByRole('button', { name: 'Conversation options', exact: true });
    await expect(menu).toHaveCSS('border-radius', '10.4px');
    await menu.focus();
    await menu.press('ArrowDown');
    const rename = chat.getByRole('menuitem', { name: 'Rename conversation', exact: true });
    await expect(rename).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('conversation-options.png') });
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(rename).not.toBeVisible();
    await menu.click();
    await rename.click();
    await expect(chat.getByRole('textbox', { name: 'Conversation title' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeVisible();
});

for (const yolo of [false, true]) {
    test(`Workbench ${yolo ? 'runs tools in YOLO mode' : 'asks before running tools'}`, async ({
        context,
        extensionId,
    }, testInfo) => {
        test.skip(isChat, 'Workbench extension approval control');
        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`chrome-extension://${extensionId}/manifest.json`);
        await page.evaluate(async () => {
            await chrome.storage.local.set({
                openai_key: 'fixture-key',
                openai_url: 'https://provider.fixture/v1',
                ai_provider: 'openai',
                // Standalone Chat preference must not enable Workbench automatically.
                chat_approval_mode: 'yolo',
            });
        });
        await context.route('https://provider.fixture/**', route =>
            route.fulfill({ json: { data: [{ id: 'gpt-4o', object: 'model' }] } })
        );
        let round = 0;
        let approvalPrompt = '';
        let toolOutput = '';
        let releaseReply = () => {};
        const replyBarrier = new Promise<void>(resolve => {
            releaseReply = resolve;
        });
        await context.route('https://provider.fixture/v1/responses', async route => {
            const body = route.request().postDataJSON();
            const title = !body.tools;
            if (!title) {
                round++;
                approvalPrompt = JSON.stringify(body.input);
                if (round === 2) {
                    toolOutput = JSON.stringify(
                        body.input.find(entry => entry.type === 'function_call_output')?.output
                    );
                    await replyBarrier;
                }
            }
            const item =
                !title && round === 1
                    ? {
                          id: 'fc-1',
                          type: 'function_call',
                          call_id: 'call-1',
                          name: 'bash',
                          arguments: JSON.stringify({
                              command: 'echo approval-fixture-ok',
                              description: 'Check the approval mode',
                          }),
                      }
                    : {
                          id: 'reply',
                          type: 'message',
                          role: 'assistant',
                          content: [
                              {
                                  type: 'output_text',
                                  text: title ? 'Approval check' : 'Tool completed.',
                                  annotations: [],
                              },
                          ],
                      };
            const events = [
                {
                    type: 'response.created',
                    response: { id: `response-${round}`, created_at: 1, model: 'gpt-4o' },
                },
                {
                    type: 'response.output_item.added',
                    output_index: 0,
                    item: item.type === 'function_call' ? { ...item, arguments: '' } : item,
                },
                item.type === 'function_call'
                    ? {
                          type: 'response.function_call_arguments.delta',
                          item_id: item.id,
                          output_index: 0,
                          delta: item.arguments,
                      }
                    : {
                          type: 'response.output_text.delta',
                          item_id: item.id,
                          delta: item.content![0].text,
                      },
                {
                    type: 'response.output_item.done',
                    output_index: 0,
                    item: { ...item, status: 'completed' },
                },
                {
                    type: 'response.completed',
                    response: { usage: { input_tokens: 10, output_tokens: 5 } },
                },
            ];
            await route.fulfill({
                contentType: 'text/event-stream',
                body: events
                    .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
                    .join(''),
            });
        });
        await page.goto(
            `chrome-extension://${extensionId}/views/app.html?applicationName=urlencoder`
        );
        await page
            .locator('skeleton-header')
            .getByRole('button', { name: 'Open AI assistant', exact: true })
            .click();
        const chat = page.locator('agent-app');
        const mode = chat.getByRole('switch', { name: 'YOLO mode', exact: true });
        await expect(mode).toBeEnabled();
        await expect(mode).toHaveAttribute('aria-checked', 'false');
        if (yolo) {
            await mode.click();
            await expect(mode).toBeEnabled();
            await expect(mode).toHaveAttribute('aria-checked', 'true');
            await expect
                .poll(() =>
                    page.evaluate(
                        async () =>
                            (await chrome.storage.local.get('workbench_chat_approval_mode'))
                                .workbench_chat_approval_mode
                    )
                )
                .toBe('yolo');
            // The side-panel reads the same saved Workbench preference.
            await page.goto(`chrome-extension://${extensionId}/views/default.html`);
            await page.getByTitle('Agent', { exact: true }).click();
            await page.setViewportSize({ width: 320, height: 900 });
            await expect(mode).toHaveAttribute('aria-checked', 'true');
        }
        await page.evaluate(() => {
            Reflect.set(window, 'approvalCount', 0);
            window.addEventListener('agent:ask_user', () =>
                Reflect.set(window, 'approvalCount', Reflect.get(window, 'approvalCount') + 1)
            );
        });
        await chat.getByRole('textbox', { name: 'Prompt input' }).fill('Run the approval check.');
        await chat.getByRole('button', { name: 'Send', exact: true }).click();
        const allow = chat.getByRole('option', { name: /Allow once/ });
        if (!yolo) {
            await expect(allow).toBeVisible({ timeout: 30000 });
            await expect(mode).toBeDisabled();
            await allow.click();
            await chat.getByRole('button', { name: /^Continue/ }).click();
        }
        try {
            await expect.poll(() => round, { timeout: 30000 }).toBe(2);
            await expect(mode).toBeDisabled();
            expect(toolOutput).toContain('approval-fixture-ok');
            expect(approvalPrompt).toContain(
                yolo ? 'YOLO mode is enabled' : 'Ask-first mode is enabled'
            );
            expect(await page.evaluate(() => Reflect.get(window, 'approvalCount'))).toBe(
                yolo ? 0 : 1
            );
        } finally {
            releaseReply();
        }
        await expect(chat.getByText('Tool completed.', { exact: true })).toBeVisible();
        await expect(mode).toBeEnabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        );
        await page.screenshot({ path: testInfo.outputPath('workbench-approval-mode.png') });
        if (yolo) {
            await mode.click();
            await expect(mode).toBeEnabled();
            await page.reload();
            await page.getByTitle('Agent', { exact: true }).click();
            await expect(mode).toHaveAttribute('aria-checked', 'false');
        }
    });
}
