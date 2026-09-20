import { test, expect } from './fixtures';

test.skip(process.env.E2E_EXTENSION_TARGET !== 'chat', 'Requires the chat extension build');

test('chat sanitizes saved messages and supports retry, Stop, and queue resume', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    page.on('pageerror', error => console.error('Chat page error:', error.message));
    const remoteRequests: string[] = [];
    await context.route('https://attacker.example/**', route => {
        remoteRequests.push(route.request().url());
        return route.abort();
    });
    // Seed from an inert extension document so a running chat cannot overwrite the fixture.
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        // Synthetic history exercises the same persisted-message renderer as a real conversation.
        // eslint-disable-next-line no-undef
        await chrome.storage.local.set({
            openai_key: 'test-key-no-network',
            openai_url: 'https://provider.example/v1',
            ai_provider: 'openai',
            einstein_agent_conversation_data: {
                schemaVersion: 1,
                activeConversationId: 'security-test',
                selectedModel: 'gpt-4o',
                conversations: [
                    {
                        id: 'security-test',
                        title: 'Rendering regression',
                        streamHistory: [
                            { role: 'user', content: 'Render this safely' },
                            {
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'text',
                                        text: [
                                            'Safe **formatted text** and [safe record](sfrecord://001000000000001).',
                                            '<img src="https://attacker.example/track" onerror="window.chatXss=1" alt="Tracking blocked">',
                                            '<script>window.chatXss=1</script>',
                                            '<iframe src="https://attacker.example/frame"></iframe>',
                                            '<a href="javascript:alert(1)" onclick="window.chatXss=1">Unsafe link</a>',
                                            '<svg onload="window.chatXss=1"><foreignObject><img src="https://attacker.example/svg"></foreignObject></svg>',
                                            '<form action="https://attacker.example/form"><input autofocus onfocus="window.chatXss=1"></form>',
                                            '<a href="https://example.com/guide">Safe guide</a>',
                                            '```mermaid\ngraph TD\nA[Safe] --> B[Diagram]\n```',
                                        ].join('\n\n'),
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        });
    });
    await context.route('https://provider.example/**', route =>
        route.fulfill({
            json: { data: [{ id: 'gpt-4o', object: 'model' }] },
        })
    );
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    await expect(page.locator('agent-app')).toBeAttached({ timeout: 30_000 });
    const viewer = page.locator('agent-message slds-markdown-viewer').last();
    await expect(viewer.getByText('formatted text', { exact: true })).toBeVisible({
        timeout: 30_000,
    });
    await expect(viewer.getByRole('link', { name: 'safe record' })).toHaveAttribute(
        'href',
        'sfrecord://001000000000001'
    );
    await expect(viewer.getByRole('link', { name: 'Safe guide' })).toHaveAttribute(
        'rel',
        'noopener noreferrer'
    );
    await expect(
        viewer.locator('script, iframe, form, input, foreignObject, [onclick], [onerror], [onload]')
    ).toHaveCount(0);
    await expect(viewer.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(viewer.locator('img[src^="https://attacker.example"]')).toHaveCount(0);
    await expect(viewer.locator('.chat-code-language')).toHaveText('Mermaid');
    await expect(viewer.locator('.chat-code pre')).toContainText('graph TD');
    expect(remoteRequests).toEqual([]);
    expect(
        await page.evaluate(() => (window as Window & { chatXss?: number }).chatXss)
    ).toBeUndefined();
    await expect(page.getByRole('textbox', { name: 'Prompt input' })).toBeVisible();

    let requests = 0;
    let releaseStoppedRequest: (() => void) | undefined;
    await context.route('https://provider.example/v1/responses', async route => {
        requests++;
        if (requests === 1) {
            await route.fulfill({
                status: 400,
                json: {
                    error: {
                        message: 'Deliberate provider failure',
                        type: 'invalid_request_error',
                    },
                },
            });
            return;
        }
        if (requests === 3) {
            await new Promise<void>(resolve => {
                releaseStoppedRequest = resolve;
            });
            await route.abort().catch(() => {});
            return;
        }
        const reply = requests === 2 ? 'Recovered reply' : 'Queued reply';
        const item = {
            id: `message-${requests}`,
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: reply, annotations: [] }],
        };
        const events = [
            {
                type: 'response.created',
                response: { id: `response-${requests}`, created_at: 1, model: 'gpt-5-mini' },
            },
            { type: 'response.output_item.added', output_index: 0, item },
            { type: 'response.output_text.delta', item_id: item.id, delta: reply },
            { type: 'response.output_item.done', output_index: 0, item },
            {
                type: 'response.completed',
                response: { usage: { input_tokens: 10, output_tokens: 2 } },
            },
        ];
        await route.fulfill({
            contentType: 'text/event-stream',
            body: events
                .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
                .join(''),
        });
    });
    await page.getByRole('switch', { name: 'YOLO mode', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'YOLO mode', exact: true })).toHaveAttribute(
        'aria-checked',
        'true'
    );
    const prompt = page.getByRole('textbox', { name: 'Prompt input' });
    await prompt.fill('Retry regression prompt');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => requests, { timeout: 10_000 }).toBe(1);
    await expect(page.getByRole('button', { name: 'Retry last prompt' })).toBeVisible({
        timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Retry last prompt' }).click();
    await expect(page.getByText('Recovered reply', { exact: true })).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.getByText('Retry regression prompt', { exact: true })).toHaveCount(1);
    expect(requests).toBe(2);

    await prompt.fill('Stop this request');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => requests).toBe(3);
    await prompt.fill('Keep this queued');
    await prompt.press('Enter');
    await expect(page.getByText('Keep this queued', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    releaseStoppedRequest?.();
    await expect(page.getByRole('button', { name: 'Resume queue' })).toBeVisible();
    expect(requests).toBe(3);
    await page.getByRole('button', { name: 'Resume queue' }).click();
    await expect(page.getByText('Queued reply', { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(requests).toBe(4);
});
