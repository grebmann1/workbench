import { test as domTest } from '@playwright/test';
import { test, expect } from './fixtures';
import { runPageOperation } from '../../../extension-chat/src/browser/pageRuntime.js';
import { BROWSER_LIMITS } from '../../../extension-chat/src/browser/constants.js';

test.skip(process.env.E2E_EXTENSION_TARGET !== 'chat', 'Requires the chat extension build');

test('chat settings validate and persist MCP server configuration', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    await page.getByRole('button', { name: 'AI settings', exact: true }).click();
    await page.locator('.mcp-settings > summary').click();
    const config = page.getByLabel('MCP server configuration', { exact: true });
    await config.fill('{ invalid json');
    await expect(config).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await config.fill(
        JSON.stringify({ mcpServers: { docs: { url: 'javascript:alert(1)', transport: 'http' } } })
    );
    await expect(config).toHaveAttribute('aria-invalid', 'true');
    await config.fill(
        JSON.stringify({
            mcpServers: {
                docs: { url: 'https://mcp.fixture/mcp', transport: 'http', enabled: false },
            },
        })
    );
    await expect(config).toHaveAttribute('aria-invalid', 'false');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const saved = await page.evaluate(() => chrome.storage.local.get('mcp_servers'));
    expect(saved.mcp_servers).toEqual(
        expect.arrayContaining([expect.objectContaining({ url: 'https://mcp.fixture/mcp' })])
    );
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await page.getByRole('button', { name: 'AI settings', exact: true }).click();
    await page.locator('.mcp-settings > summary').click();
    await expect(config).toHaveValue(/https:\/\/mcp.fixture\/mcp/);
    await config.fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await page.getByRole('button', { name: 'AI settings', exact: true }).click();
    await page.locator('.mcp-settings > summary').click();
    await expect(config).toHaveValue('');
});

const formHtml = `<!doctype html><html><head><title>Customer workspace</title></head><body>
<h1>Customer workspace</h1><p>Review the customer and save your changes.</p>
<form onsubmit="event.preventDefault(); document.querySelector('#result').textContent='Saved '+document.querySelector('#name').value">
<label for="name">Customer name</label><input id="name" name="name" value="Original">
<label for="secret">Password</label><input id="secret" type="password" value="NEVER-EXPOSE">
<label for="card">Card number</label><input id="card" autocomplete="cc-number" value="SENSITIVE-CARD">
<label for="tier">Tier</label><select id="tier"><option value="standard">Standard</option><option value="premium">Premium</option></select>
<button type="submit">Save customer</button><button disabled>Unavailable</button></form>
<p id="result" role="status"></p><a href="/next">Next page</a>
<div id="shadow"></div><script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<button>Shadow action</button>';</script>
<p style="display:none">HIDDEN-INSTRUCTION</p><div style="height:900px">Page detail</div><button>Bottom action</button>
</body></html>`;

domTest(
    'page snapshots and actions cover forms, shadow DOM, stale refs and redaction',
    async ({ context }) => {
        await context.route('https://browser-agent.test/**', route =>
            route.fulfill({ contentType: 'text/html', body: formHtml })
        );
        const page = await context.newPage();
        await page.goto('https://browser-agent.test/form');
        const snapshot = () =>
            page.evaluate(runPageOperation, { action: 'snapshot', limits: BROWSER_LIMITS });
        let state = await snapshot();
        expect(JSON.stringify(state)).not.toContain('NEVER-EXPOSE');
        expect(JSON.stringify(state)).not.toContain('SENSITIVE-CARD');
        expect(state.text).not.toContain('HIDDEN-INSTRUCTION');
        expect(state.elements.some(item => item.name === 'Shadow action')).toBe(true);
        expect(state.elements.some(item => item.name === 'Bottom action')).toBe(false);
        const field = state.elements.find(item => item.name === 'Customer name')!;
        const oldId = state.snapshotId;
        state = await page.evaluate(runPageOperation, {
            action: 'fill',
            limits: BROWSER_LIMITS,
            snapshotId: state.snapshotId,
            ref: field.ref,
            value: 'Ada',
        });
        await expect(page.getByLabel('Customer name')).toHaveValue('Ada');
        const currentField = state.elements.find(item => item.name === 'Customer name')!;
        await page.getByLabel('Customer name').fill('Edited by the user');
        await expect(
            page.evaluate(runPageOperation, {
                action: 'fill',
                limits: BROWSER_LIMITS,
                snapshotId: state.snapshotId,
                ref: currentField.ref,
                value: 'Do not overwrite',
            })
        ).rejects.toThrow(/changed or disappeared/);
        await expect(
            page.evaluate(runPageOperation, {
                action: 'click',
                limits: BROWSER_LIMITS,
                snapshotId: oldId,
                ref: field.ref,
            })
        ).rejects.toThrow(/snapshot changed/);
        state = await snapshot();
        const tier = state.elements.find(item => item.name === 'Tier')!;
        state = await page.evaluate(runPageOperation, {
            action: 'select',
            limits: BROWSER_LIMITS,
            snapshotId: state.snapshotId,
            ref: tier.ref,
            value: 'premium',
        });
        await expect(page.getByLabel('Tier')).toHaveValue('premium');
        const secret = state.elements.find(item => item.name === 'Password')!;
        await expect(
            page.evaluate(runPageOperation, {
                action: 'fill',
                limits: BROWSER_LIMITS,
                snapshotId: state.snapshotId,
                ref: secret.ref,
                value: 'blocked',
            })
        ).rejects.toThrow(/sensitive field/);
        const disabled = state.elements.find(item => item.name === 'Unavailable')!;
        await expect(
            page.evaluate(runPageOperation, {
                action: 'click',
                limits: BROWSER_LIMITS,
                snapshotId: state.snapshotId,
                ref: disabled.ref,
            })
        ).rejects.toThrow(/disabled/);
        const save = state.elements.find(item => item.name === 'Save customer')!;
        await page.getByRole('button', { name: 'Save customer' }).evaluate(el => {
            el.textContent = 'Delete customer';
        });
        await expect(
            page.evaluate(runPageOperation, {
                action: 'click',
                limits: BROWSER_LIMITS,
                snapshotId: state.snapshotId,
                ref: save.ref,
            })
        ).rejects.toThrow(/changed or disappeared/);
        state = await snapshot();
        state = await page.evaluate(runPageOperation, {
            action: 'scroll',
            limits: BROWSER_LIMITS,
            snapshotId: state.snapshotId,
            direction: 'down',
        });
        expect(state.scroll.y).toBeGreaterThan(0);
        expect(state.elements.some(item => item.name === 'Bottom action')).toBe(true);
    }
);

for (const yolo of [false, true]) {
    test(`chat agent ${yolo ? 'uses YOLO' : 'requests approval'}, fills and saves the pinned browser tab`, async ({
        context,
        extensionId,
    }) => {
        await context.route('https://browser-agent.test/**', route =>
            route.fulfill({ contentType: 'text/html', body: formHtml })
        );
        const target = await context.newPage();
        await target.goto('https://browser-agent.test/form');
        const page = await context.newPage();
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto(`chrome-extension://${extensionId}/manifest.json`);
        await page.evaluate(async () => {
            await chrome.storage.local.set({
                openai_key: 'test-key-no-network',
                openai_url: 'https://provider.example/v1',
                ai_provider: 'openai',
            });
        });
        await context.route('https://provider.example/**', route =>
            route.fulfill({ json: { data: [{ id: 'gpt-4o', object: 'model' }] } })
        );
        let round = 0;
        let failure = '';
        let releaseYoloAction: () => void = () => {};
        const yoloBarrier = new Promise<void>(resolve => {
            releaseYoloAction = resolve;
        });
        await context.route('https://provider.example/v1/responses', async route => {
            const body = route.request().postDataJSON();
            const isTitleRequest = !body.tools;
            if (!isTitleRequest) round++;
            let item;
            if (isTitleRequest) {
                item = {
                    id: 'title',
                    type: 'message',
                    role: 'assistant',
                    content: [
                        { type: 'output_text', text: 'Customer workspace task', annotations: [] },
                    ],
                };
            } else
                try {
                    expect(body.tools.some(tool => tool.name === 'browser_snapshot')).toBe(true);
                    const outputs = body.input.filter(
                        entry => entry.type === 'function_call_output'
                    );
                    const last = outputs.at(-1);
                    const state = last ? JSON.parse(last.output) : undefined;
                    if (round <= 3) {
                        const name =
                            round === 1
                                ? 'browser_snapshot'
                                : round === 2
                                  ? 'browser_fill'
                                  : 'browser_click';
                        const control = round === 2 ? 'Customer name' : 'Save customer';
                        const args =
                            round === 1
                                ? { description: 'Read customer workspace' }
                                : {
                                      description:
                                          round === 2
                                              ? 'Update customer name'
                                              : 'Save customer changes',
                                      snapshotId: state.snapshotId,
                                      ref: state.elements.find(element => element.name === control)
                                          .ref,
                                      ...(round === 2 ? { value: 'Ada Lovelace' } : {}),
                                  };
                        item = {
                            id: `fc-${round}`,
                            type: 'function_call',
                            call_id: `call-${round}`,
                            name,
                            arguments: JSON.stringify(args),
                        };
                    } else if (round === 4) {
                        expect(state.text).toContain('Saved Ada Lovelace');
                        item = {
                            id: 'fc-4',
                            type: 'function_call',
                            call_id: 'call-4',
                            name: 'browser_navigate',
                            arguments: JSON.stringify({
                                description: 'Open next page',
                                direction: 'url',
                                url: state.elements.find(element => element.name === 'Next page')
                                    .url,
                            }),
                        };
                    } else if (round === 5) {
                        await target.waitForURL('https://browser-agent.test/next');
                        await target.waitForLoadState('domcontentloaded');
                        item = {
                            id: 'fc-5',
                            type: 'function_call',
                            call_id: 'call-5',
                            name: 'browser_snapshot',
                            arguments: JSON.stringify({ description: 'Verify destination page' }),
                        };
                    } else {
                        expect(state.url).toBe('https://browser-agent.test/next');
                        item = {
                            id: 'reply',
                            type: 'message',
                            role: 'assistant',
                            content: [
                                {
                                    type: 'output_text',
                                    text: 'Verified: Saved Ada Lovelace.',
                                    annotations: [],
                                },
                            ],
                        };
                    }
                } catch (error) {
                    failure = String(error);
                    console.error('Browser agent fixture failed at round', round, failure);
                    await route.fulfill({ status: 400, json: { error: { message: failure } } });
                    return;
                }
            if (yolo && !isTitleRequest && round === 2) await yoloBarrier;
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
                ...(item.type === 'function_call'
                    ? [
                          {
                              type: 'response.function_call_arguments.delta',
                              item_id: item.id,
                              output_index: 0,
                              delta: item.arguments,
                          },
                      ]
                    : [
                          {
                              type: 'response.output_text.delta',
                              item_id: item.id,
                              delta: item.content[0].text,
                          },
                      ]),
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
        await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
        await expect(
            page.getByRole('heading', { name: 'Your browser. A helping hand.' })
        ).toBeVisible({
            timeout: 30000,
        });
        const mode = page.getByRole('switch', { name: 'YOLO mode', exact: true });
        await expect(mode).toHaveAttribute('aria-checked', 'false');
        if (yolo) {
            await mode.click();
            await expect(mode).toHaveAttribute('aria-checked', 'true');
            await expect(mode).toBeEnabled();
            await page.reload();
            await expect(mode).toHaveAttribute('aria-checked', 'true');
        }
        await page.evaluate(() => {
            const fixture = window as Window & { approvalCount?: number };
            fixture.approvalCount = 0;
            window.addEventListener('agent:ask_user', () => {
                fixture.approvalCount!++;
            });
        });
        const selector = page.getByLabel('Browser target', { exact: true });
        await expect(selector).toContainText('Customer workspace');
        const selected = await selector.getAttribute('data-tab-id');
        const other = await context.newPage();
        await other.goto('https://browser-agent.test/other');
        await expect(selector).toHaveAttribute('data-tab-id', selected!);
        await page.bringToFront();
        await page.screenshot({ path: 'test-results/chat-browser-agent.png', fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        );
        const composer = page.getByRole('textbox', { name: 'Prompt input' });
        await composer.fill('Set the customer name to Ada Lovelace, save it, and open Next page.');
        await page.getByRole('button', { name: 'Send', exact: true }).click();
        const allow = page.getByRole('option', { name: /Allow once/ });
        if (yolo) {
            await expect.poll(() => round).toBe(2);
            await expect(mode).toBeDisabled();
            await expect(selector).toBeDisabled();
            await expect(allow).toHaveCount(0);
            releaseYoloAction();
        } else {
            try {
                await expect(allow).toBeVisible({ timeout: 15000 });
            } catch (error) {
                throw new Error(
                    `Browser workflow stopped at round ${round}: ${failure || (await page.locator('body').innerText())}`,
                    { cause: error }
                );
            }
            await expect(target.getByLabel('Customer name')).toHaveValue('Original');
            await expect(page.locator('.assistant-activity-group')).toHaveCount(0);
            await expect(selector).toBeDisabled();
            await allow.click();
            await page.getByRole('button', { name: /^Continue/ }).click();
            await expect(target.getByLabel('Customer name')).toHaveValue('Ada Lovelace');
            await expect(allow).toBeVisible({ timeout: 30000 });
            await allow.click();
            await page.getByRole('button', { name: /^Continue/ }).click();
            await expect(target.getByRole('status')).toHaveText('Saved Ada Lovelace');
            await expect(allow).toBeVisible({ timeout: 30000 });
            await allow.click();
            await page.getByRole('button', { name: /^Continue/ }).click();
        }
        await expect(target).toHaveURL('https://browser-agent.test/next');
        await expect(
            page.getByText('Verified: Saved Ada Lovelace.', { exact: true }),
            failure
        ).toBeVisible({ timeout: 30000 });
        await expect(other.getByLabel('Customer name')).toHaveValue('Original');
        await expect(selector).toBeEnabled();
        const completed = page.locator('.assistant-activity-group details');
        await expect(completed.locator('summary')).toHaveText('5 actions completed');
        await expect(completed).not.toHaveAttribute('open');
        await completed.locator('summary').click();
        await expect(completed.locator('.assistant-tool-card')).toHaveCount(5);
        await expect(completed.getByText('Read customer workspace', { exact: true })).toBeVisible();
        await composer.fill('Keep this draft while I check settings');
        await page.getByRole('button', { name: 'AI settings', exact: true }).click();
        await page.getByRole('button', { name: 'Back to chat', exact: true }).click();
        await expect(composer).toHaveValue('Keep this draft while I check settings');
        expect(failure).toBe('');
        expect(
            await page.evaluate(() => (window as Window & { approvalCount?: number }).approvalCount)
        ).toBe(yolo ? 0 : 3);
        await expect(mode).toBeEnabled();
    });
}

test('YOLO is an explicit, remembered toggle and fits a narrow chat header', async ({
    context,
    extensionId,
}, testInfo) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 850 });
    await page.goto(`chrome-extension://${extensionId}/views/chat.html`);
    const mode = page.getByRole('switch', { name: 'YOLO mode', exact: true });
    await expect(mode).toHaveAttribute('aria-checked', 'false');
    await mode.focus();
    await page.keyboard.press('Space');
    await expect(mode).toHaveAttribute('aria-checked', 'true');
    await expect(mode).toBeEnabled();
    await page.reload();
    await expect(mode).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'AI settings', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('chat-yolo-mode.png') });
    expect(
        await page.locator('.chat-header').evaluate(el => el.scrollWidth <= el.clientWidth)
    ).toBe(true);
    await mode.click();
    await expect(mode).toBeEnabled();
    await page.reload();
    await expect(mode).toHaveAttribute('aria-checked', 'false');
    expect(
        (await page.evaluate(() => chrome.storage.local.get('chat_approval_mode')))
            .chat_approval_mode
    ).toBe('ask');
});
