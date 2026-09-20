import { test, expect } from './fixtures';

const isChat = process.env.E2E_EXTENSION_TARGET === 'chat';
test('a recovered task waits for Resume, recalls memory, restores attachments and clears its journal', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => console.error('Recovery error:', error.message));
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () => {
        await chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
            einstein_agent_conversation_data: {
                schemaVersion: 1,
                activeConversationId: 'recovery',
                selectedModel: 'gpt-4o',
                conversations: [
                    {
                        id: 'recovery',
                        title: 'Recovery check',
                        streamHistory: [
                            { role: 'user', content: 'Prepare the report' },
                            { role: 'assistant', content: 'The data is ready.' },
                        ],
                        contextMessages: [
                            { role: 'user', content: 'Prepare the report' },
                            {
                                role: 'assistant',
                                content:
                                    'Checkpoint: report data prepared; no external writes performed.',
                            },
                        ],
                    },
                ],
            },
        });
        const open = indexedDB.open('sf-toolkit-bash-fs-v1', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('entries', { keyPath: 'path' });
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
        });
        const transaction = db.transaction('entries', 'readwrite');
        const entries = transaction.objectStore('entries');
        for (const path of [
            '/',
            '/workspace',
            '/workspace/memory',
            '/workspace/agent-runs',
            '/workspace/agent-runs/files',
            '/workspace/agent-runs/files/run1',
        ])
            entries.put({ path, type: 'directory', mode: 493, mtimeMs: Date.now() });
        const files = {
            '/workspace/memory/notes.md':
                '2026-09-20: Always use explicit SOQL fields for recovery-fixture.',
            '/workspace/agent-runs/files/run1/0': 'Name,Amount\nSample,100',
            '/workspace/agent-runs/pending.json': JSON.stringify({
                version: 1,
                runs: [
                    {
                        id: 'recovery',
                        requests: [
                            {
                                id: 'run1',
                                prompt: 'Finish the recovery-fixture report',
                                model: 'gpt-4o',
                                fileNames: ['pipeline.csv'],
                                interrupted: true,
                                attachments: [
                                    {
                                        path: '/workspace/agent-runs/files/run1/0',
                                        name: 'pipeline.csv',
                                        type: 'text/csv',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
        };
        for (const [path, text] of Object.entries(files))
            entries.put({
                path,
                type: 'file',
                mode: 420,
                mtimeMs: Date.now(),
                contentBase64: btoa(text),
                size: text.length,
            });
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    });
    const calls: string[] = [];
    await context.route('https://provider.fixture/**', async route => {
        if (route.request().method() !== 'POST')
            return route.fulfill({ json: { data: [{ id: 'gpt-4o', object: 'model' }] } });
        calls.push(route.request().postData() || '');
        const item = {
            id: 'reply',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Recovered task completed.', annotations: [] }],
        };
        const events = [
            {
                type: 'response.created',
                response: { id: 'response-recovery', created_at: 1, model: 'gpt-4o' },
            },
            { type: 'response.output_item.added', output_index: 0, item },
            {
                type: 'response.output_text.delta',
                item_id: 'reply',
                delta: 'Recovered task completed.',
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
    const openChat = async () => {
        await page.goto(
            `chrome-extension://${extensionId}/views/${isChat ? 'chat.html' : 'default.html'}`
        );
        if (!isChat) await page.getByTitle('Agent', { exact: true }).click();
    };
    await openChat();
    const chat = page.locator('agent-app');
    await expect(chat.getByText('Recovered · review before resume', { exact: true })).toBeVisible();
    expect(calls).toHaveLength(0);
    await chat.getByRole('button', { name: 'Resume queue', exact: true }).click();
    await expect(chat.locator('agent-message')).toContainText(['Recovered task completed.']);
    expect(calls.join('\n')).toContain('Always use explicit SOQL fields for recovery-fixture');
    expect(calls.join('\n')).toContain('Checkpoint: report data prepared');
    expect(calls.join('\n')).toContain('pipeline.csv');
    expect(calls.join('\n')).toContain('Inspect the current state before repeating any write');
    await openChat();
    await expect(chat.getByRole('textbox', { name: 'Prompt input' })).toBeVisible();
    await expect(chat.getByRole('button', { name: 'Resume queue', exact: true })).toHaveCount(0);
});
