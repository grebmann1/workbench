import { test, expect } from './fixtures';

test.skip(process.env.E2E_EXTENSION_TARGET !== 'chat', 'Requires the chat extension');

test('assistant transcript keeps browser and bash evidence visible in the new presentation', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 1000 });
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-5-mini', object: 'model' }] } })
    );
    await context.route('https://shop.fixture/**', route =>
        route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><title>Shopping cart</title><h1>Your cart</h1>',
        })
    );
    const target = await context.newPage();
    await target.goto('https://shop.fixture/cart');
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        const history = [
            { role: 'user', content: 'Read the cart and check its totals with bash.' },
            {
                role: 'assistant',
                content: [
                    {
                        type: 'reasoning',
                        text: '**Reviewing the cart**\nI will inspect the page before checking the item count.',
                        state: 'done',
                    },
                    {
                        type: 'tool-call',
                        toolCallId: 'browser-1',
                        toolName: 'browser_snapshot',
                        input: { description: 'Inspect the cart' },
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'browser-1',
                        toolName: 'browser_snapshot',
                        output: {
                            type: 'json',
                            value: {
                                url: 'https://shop.fixture/cart',
                                text: 'Three items in your cart',
                            },
                        },
                    },
                ],
            },
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'bash-1',
                        toolName: 'exec',
                        input: {
                            description: 'Check the item count',
                            command: 'printf "3 items\\n"',
                        },
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'bash-1',
                        toolName: 'exec',
                        output: {
                            type: 'json',
                            value: {
                                stdout: '3 items\n',
                                stderr: 'Using the observed page data\n',
                                exitCode: 0,
                            },
                        },
                    },
                ],
            },
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'bash-2',
                        toolName: 'exec',
                        input: {
                            description: 'Check the optional inventory file',
                            command: 'cat /workspace/inventory.json',
                        },
                    },
                ],
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'bash-2',
                        toolName: 'exec',
                        output: {
                            type: 'json',
                            value: {
                                stdout: '',
                                stderr: 'inventory.json: No such file\n',
                                exitCode: 1,
                            },
                        },
                    },
                ],
            },
            {
                role: 'assistant',
                content:
                    'The cart contains **3 items**. The optional inventory file was unavailable; no cart changes were made.',
            },
        ];
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
            einstein_agent_conversation_data: {
                schemaVersion: 1,
                activeConversationId: 'presentation',
                selectedModel: 'gpt-5-mini',
                conversations: [
                    { id: 'presentation', title: 'Review the cart', streamHistory: history },
                ],
            },
        });
    });
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    const browser = page.locator('.assistant-tool-card[data-tool="browser_snapshot"]');
    const bash = page.locator('.assistant-tool-card[data-tool="exec"]');
    const group = page.locator('.assistant-activity-group details');
    const summary = group.locator('summary');
    await expect(summary).toHaveText('3 actions · 1 failed');
    await expect(group).not.toHaveAttribute('open');
    await expect(browser).not.toBeVisible();
    await expect(page.getByText(/The cart contains/)).toBeVisible();
    await page.screenshot({ path: 'test-results/assistant-grouped-transcript.png' });
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(group).toHaveAttribute('open');
    await expect(browser).toBeVisible();
    await expect(browser).toContainText('Browser');
    await expect(browser).toContainText('Complete');
    await expect(bash).toHaveCount(2);
    await expect(bash.first()).toContainText('Bash');
    await expect(bash.first()).toContainText('printf "3 items\\n"');
    await expect(bash.last()).toContainText('Failed');
    await expect(page.locator('.assistant-speaker').filter({ hasText: 'You' })).toBeVisible();
    await expect(page.locator('.assistant-speaker').filter({ hasText: 'Assistant' })).toBeVisible();
    await page.screenshot({ path: 'test-results/assistant-reference-transcript.png' });

    const reasoning = page.getByRole('button', { name: 'Reviewing the cart', exact: true });
    await reasoning.focus();
    await page.keyboard.press('Enter');
    await expect(reasoning).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.reasoning-block-body')).toContainText('inspect the page');
    await page.keyboard.press('Enter');
    await expect(reasoning).toHaveAttribute('aria-expanded', 'false');

    await bash.first().getByRole('button', { name: 'Expand exec details', exact: true }).click();
    await expect(bash.first()).toContainText('stdout:');
    await expect(bash.first()).toContainText('stderr:');
    await expect(bash.first()).toContainText('Using the observed page data');
    await expect(bash.first()).toContainText('Exit code: 0');
    await expect(bash.first().getByRole('button', { name: 'Copy result' })).toBeVisible();
    await bash.first().screenshot({ path: 'test-results/assistant-reference-bash.png' });
    await bash.last().getByRole('button', { name: 'Expand exec details', exact: true }).click();
    await expect(bash.last()).toContainText('inventory.json: No such file');
    await expect(bash.last()).toContainText('Exit code: 1');
    await browser
        .getByRole('button', { name: 'Expand browser_snapshot details', exact: true })
        .click();
    await expect(browser).toContainText('https://shop.fixture/cart');

    for (const width of [320, 520, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        );
        const composer = await page.locator('.assistant-composer').boundingBox();
        expect(composer!.x + composer!.width).toBeLessThanOrEqual(width);
    }
    await bash.first().scrollIntoViewIfNeeded();
    const prompt = page.getByRole('textbox', { name: 'Prompt input', exact: true });
    await prompt.fill('Keep this draft while composing');
    await prompt.dispatchEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 229,
        isComposing: true,
    });
    await expect(prompt).toHaveValue('Keep this draft while composing');
    await summary.click();
    await expect(browser).not.toBeVisible();
    await expect(page.getByText(/The cart contains/)).toBeVisible();
    await expect(prompt).toHaveValue('Keep this draft while composing');
    await summary.click();
    await expect(bash.first()).toContainText('Exit code: 0');
});

test('reading earlier messages stays put when a response arrives and Latest message returns to the end', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 800 });
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-5-mini', object: 'model' }] } })
    );
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        const streamHistory = Array.from({ length: 15 }, (_, index) => [
            { role: 'user', content: `Earlier question ${index}` },
            {
                role: 'assistant',
                content: `Earlier answer ${index}. ${'This is a saved response with useful details. '.repeat(12)}`,
            },
        ]).flat();
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
            einstein_agent_conversation_data: {
                schemaVersion: 1,
                activeConversationId: 'scroll',
                selectedModel: 'gpt-5-mini',
                conversations: [{ id: 'scroll', title: 'Long conversation', streamHistory }],
            },
        });
    });
    let release: (() => void) | undefined;
    let requested = false;
    const waiting = new Promise<void>(resolve => {
        release = resolve;
    });
    await context.route('https://provider.fixture/v1/responses', async route => {
        requested = true;
        await waiting;
        const text = 'New response arrived. ' + 'Here are the next details. '.repeat(120);
        const item = {
            id: 'reply',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text, annotations: [] }],
        };
        const events = [
            {
                type: 'response.created',
                response: { id: 'response-scroll', created_at: 1, model: 'gpt-5-mini' },
            },
            { type: 'response.output_item.added', output_index: 0, item },
            { type: 'response.output_text.delta', item_id: item.id, delta: text },
            { type: 'response.output_item.done', output_index: 0, item },
            {
                type: 'response.completed',
                response: { usage: { input_tokens: 10, output_tokens: 20 } },
            },
        ];
        await route.fulfill({
            contentType: 'text/event-stream',
            body: events
                .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
                .join(''),
        });
    });
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    const prompt = page.getByRole('textbox', { name: 'Prompt input', exact: true });
    await prompt.fill('Write the next result');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => requested).toBe(true);
    const transcript = page.locator('section[data-id="chatSection"]');
    await transcript.evaluate(element => {
        element.scrollTop = 0;
    });
    const latest = page.getByRole('button', { name: 'Latest message', exact: true });
    await expect(latest).toBeInViewport();
    release?.();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    await expect(
        page.locator('.message-content-text').filter({ hasText: 'New response arrived.' })
    ).toHaveCount(1);
    expect(await transcript.evaluate(element => element.scrollTop)).toBeLessThan(100);
    await expect(latest).toBeInViewport();
    await latest.click();
    await expect
        .poll(() =>
            transcript.evaluate(
                element => element.scrollHeight - element.scrollTop - element.clientHeight
            )
        )
        .toBeLessThan(5);
});
