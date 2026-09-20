import type { BrowserContext } from '@playwright/test';
import { test, expect } from './fixtures';

const isChat = process.env.E2E_EXTENSION_TARGET === 'chat';

async function openCodeConversation(
    context: BrowserContext,
    extensionId: string,
    markdown: string
) {
    const page = await context.newPage();
    page.on('pageerror', error => console.error('Code rendering page error:', error.message));
    await page.setViewportSize({ width: isChat ? 390 : 1440, height: 1000 });
    await context.route('https://provider.fixture/**', route =>
        route.fulfill({ json: { data: [{ id: 'gpt-5-mini', object: 'model' }] } })
    );
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async content => {
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
            einstein_agent_conversation_data: {
                schemaVersion: 1,
                activeConversationId: 'code',
                selectedModel: 'gpt-5-mini',
                conversations: [
                    {
                        id: 'code',
                        title: 'Code examples',
                        streamHistory: [
                            { role: 'user', content: 'Show me the code examples.' },
                            { role: 'assistant', content },
                        ],
                    },
                ],
            },
        });
    }, markdown);
    await page.goto(
        `chrome-extension://${extensionId}/views/${isChat ? 'chat.html' : 'app.html?applicationName=urlencoder'}`
    );
    if (!isChat)
        await page
            .locator('skeleton-header')
            .getByRole('button', { name: 'Open AI assistant', exact: true })
            .click();
    const viewer = page.locator('agent-message slds-markdown-viewer').last();
    await expect(viewer.locator('.chat-code[data-code-index]').first()).toBeVisible();
    // Wait for the composer's existing delayed autofocus before testing code-control focus.
    await expect(page.getByRole('textbox', { name: 'Prompt input', exact: true })).toBeFocused();
    return { page, viewer };
}

test('code cards highlight Salesforce code, wrap long lines, and copy literal source safely', async ({
    context,
    extensionId,
}) => {
    const javascript =
        'const html = "<img src=\\"https://attacker.example/code\\" onerror=\\"alert(1)\\">";\nconst literal = "&lt; &amp; &#39;";\nconst message = "' +
        'A long line of code. '.repeat(18) +
        '";';
    const markdown = [
        'Use `Account.Id` to identify a record.',
        '```javascript\n' + javascript + '\n```',
        '```soql\nSELECT Id, Name FROM Account WHERE Name != null\n```',
        '```apex\nList<Account> accounts = [SELECT Id FROM Account LIMIT 5];\nSystem.debug(accounts);\n```',
        '```json\n{ "success": true, "count": 5 }\n```',
        '```space-alien\n<unsafe>& still literal\n```',
        '```\nPlain code without a language\n```',
        '```mermaid\ngraph TD\nA[Safe] --> B[Diagram]\n```',
    ].join('\n\n');
    const requests: string[] = [];
    await context.route('https://attacker.example/**', route => {
        requests.push(route.request().url());
        return route.abort();
    });
    const { page, viewer } = await openCodeConversation(context, extensionId, markdown);
    const cards = viewer.locator('.chat-code[data-code-index]');
    await expect(cards).toHaveCount(7);
    await expect(viewer.locator('slds-code-block')).toHaveCount(0);
    await expect(cards.nth(0).locator('.chat-code-language')).toHaveText('JavaScript');
    for (const index of [0, 1, 2, 3])
        expect(await cards.nth(index).locator('.token').count()).toBeGreaterThan(0);
    await expect(cards.nth(1).locator('.chat-code-language')).toHaveText('SOQL');
    await expect(cards.nth(4).locator('pre code')).toHaveText('<unsafe>& still literal');
    await expect(cards.nth(5).locator('.chat-code-language')).toHaveText('Text');
    await expect(cards.nth(6).locator('pre')).toContainText('graph TD');
    await expect(viewer.locator('img, script, iframe, svg, [onerror]')).toHaveCount(0);
    expect(requests).toEqual([]);

    const code = cards.first().locator('pre code');
    expect(await code.textContent()).toBe(javascript);
    const pre = cards.first().locator('pre');
    expect(await pre.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    const wrap = cards.first().getByRole('button', { name: 'Wrap JavaScript code' });
    await wrap.focus();
    await page.keyboard.press('Enter');
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    await expect(code).toHaveCSS('white-space', 'pre-wrap');
    expect(await pre.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(
        true
    );
    await expect(wrap).toHaveCSS('color', isChat ? 'rgb(99, 87, 189)' : 'rgb(1, 118, 211)');
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (text: string) => {
                    Reflect.set(window, 'copiedCodeFixture', text);
                },
            },
        });
    });
    await cards.first().getByRole('button', { name: 'Copy JavaScript code' }).click();
    await expect(
        cards.first().getByRole('button', { name: 'Code copied', exact: true })
    ).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, 'copiedCodeFixture'))).toBe(javascript);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
    );
    await page.screenshot({ path: `test-results/code-${isChat ? 'chat' : 'workbench'}.png` });
    // Raw HTML can contain multiple code children; give each pre only one toolbar.
    await viewer.evaluate(element =>
        Reflect.set(element, 'value', '<pre><code>first</code><code>second</code></pre>')
    );
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('pre')).toHaveText('firstsecond');
    await cards.getByRole('button', { name: 'Copy Text code' }).click();
    expect(await page.evaluate(() => Reflect.get(window, 'copiedCodeFixture'))).toBe('firstsecond');
    await viewer.evaluate(element =>
        Reflect.set(element, 'value', '```json\n{"updated":true}\n```')
    );
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.token.property')).toBeVisible();
});

test('streamed code stays highlighted, reuses completed fences, and preserves wrap and focus', async ({
    context,
    extensionId,
}) => {
    const stable =
        '<div class="chat-code">User HTML</div>\n\n```javascript\nconst stable = true;\n```\n\n';
    const { page, viewer } = await openCodeConversation(
        context,
        extensionId,
        stable + '```javascript\nconst next = 0;'
    );
    const wrap = viewer
        .locator('.chat-code[data-code-index]')
        .first()
        .getByRole('button', { name: 'Wrap JavaScript code' });
    await wrap.click();
    await wrap.focus();
    await expect(wrap).toBeFocused();
    const result = await viewer.evaluate(async (element, prefix) => {
        const prism = Reflect.get(window, 'Prism');
        const original = prism.highlight;
        let stableCalls = 0;
        prism.highlight = function (code: string, ...args: unknown[]) {
            if (code.includes('const stable')) stableCalls++;
            return original.call(this, code, ...args);
        };
        let highlightedFrames = 0;
        try {
            for (let i = 1; i <= 15; i++) {
                Reflect.set(element, 'value', prefix + '```javascript\nconst next = ' + i + ';');
                await new Promise(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
                const root = element.shadowRoot || element;
                const codes = root.querySelectorAll('.chat-code pre code');
                if (
                    codes[1]?.textContent?.includes('= ' + i + ';') &&
                    codes[1]?.querySelector('.token')
                )
                    highlightedFrames++;
            }
        } finally {
            prism.highlight = original;
        }
        return { stableCalls, highlightedFrames };
    }, stable);
    expect(result.stableCalls).toBe(0);
    expect(result.highlightedFrames).toBe(15);
    await expect(wrap).toHaveAttribute('aria-pressed', 'true');
    await expect(wrap).toBeFocused();
    await expect(viewer.locator('slds-code-block')).toHaveCount(0);

    // Long or unsupported code remains selectable and copyable without synchronous tokenization.
    await viewer.evaluate(element =>
        Reflect.set(
            element,
            'value',
            '```javascript\n' + 'const value = 123;\n'.repeat(2000) + '```'
        )
    );
    await expect(viewer.locator('.chat-code pre code')).toHaveCount(1);
    await expect(viewer.locator('.chat-code pre code')).toContainText('const value = 123;');
    await expect(viewer.locator('.chat-code .token')).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Copy JavaScript code' })).toBeVisible();

    // Non-chat markdown keeps the existing component and diagram path.
    await viewer.evaluate(element => {
        Reflect.set(element, 'chatCode', false);
        Reflect.set(element, 'value', '```javascript\nconst legacy = true;\n```');
    });
    await expect(viewer.locator('slds-code-block')).toContainText('const legacy = true;');
});
