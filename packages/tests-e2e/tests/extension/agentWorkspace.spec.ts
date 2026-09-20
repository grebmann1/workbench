import { test, expect } from './fixtures';

const isChat = process.env.E2E_EXTENSION_TARGET === 'chat';
test('native Slides edits require approval, call Google with the revision, and return a preview', async ({
    context,
    extensionId,
}) => {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    await page.evaluate(async () =>
        chrome.storage.local.set({
            openai_key: 'fixture-key',
            openai_url: 'https://provider.fixture/v1',
            ai_provider: 'openai',
            tool_google_sheet_enabled: true,
            einstein_agent_conversation_data: {
                schemaVersion: 1,
                activeConversationId: 'slides',
                selectedModel: 'gpt-4o',
                conversations: [
                    {
                        id: 'slides',
                        title: 'Slides test',
                        streamHistory: [
                            { role: 'user', content: 'Use deck fixture-deck.' },
                            { role: 'assistant', content: 'Ready.' },
                        ],
                    },
                ],
            },
        })
    );
    await page.addInitScript(() => {
        chrome.identity.getAuthToken = (_options, callback) => callback('fixture-token');
    });
    const writes: object[] = [];
    let previews = 0;
    await context.route('https://slides.googleapis.com/**', async route => {
        expect(route.request().headers().authorization).toBe('Bearer fixture-token');
        if (route.request().url().includes(':batchUpdate')) {
            writes.push(route.request().postDataJSON());
            return route.fulfill({ json: { presentationId: 'fixture-deck', replies: [{}] } });
        }
        previews++;
        return route.fulfill({
            json: { width: 1200, height: 675, contentUrl: 'https://preview.fixture/slide.png' },
        });
    });
    let round = 0;
    await context.route('https://provider.fixture/**', async route => {
        if (route.request().method() !== 'POST')
            return route.fulfill({ json: { data: [{ id: 'gpt-4o', object: 'model' }] } });
        const body = route.request().postDataJSON();
        expect(JSON.stringify(body.tools)).toContain('google_slides_update');
        expect(body.tools.find(tool => tool.name === 'google_slides_update').strict).toBe(false);
        round++;
        const tool =
            round === 1
                ? {
                      name: 'google_slides_update',
                      args: {
                          presentationId: 'fixture-deck',
                          requiredRevisionId: 'r1',
                          requests: [
                              {
                                  replaceAllText: {
                                      containsText: { text: '{{TITLE}}', matchCase: true },
                                      replaceText: 'Pipeline review',
                                  },
                              },
                          ],
                      },
                  }
                : {
                      name: 'google_slides_preview',
                      args: { presentationId: 'fixture-deck', pageId: 'slide1' },
                  };
        const item =
            round <= 2
                ? {
                      id: `item-${round}`,
                      type: 'function_call',
                      call_id: `call-${round}`,
                      name: tool.name,
                      arguments: JSON.stringify(tool.args),
                  }
                : {
                      id: 'reply',
                      type: 'message',
                      role: 'assistant',
                      content: [
                          {
                              type: 'output_text',
                              text: 'Slides updated and preview ready.',
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
                      delta: 'Slides updated and preview ready.',
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
        return route.fulfill({
            contentType: 'text/event-stream',
            body: events
                .map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
                .join(''),
        });
    });
    await page.goto(
        `chrome-extension://${extensionId}/views/${isChat ? 'chat.html' : 'default.html'}`
    );
    if (!isChat) await page.getByTitle('Agent', { exact: true }).click();
    const chat = page.locator('agent-app');
    await chat
        .getByRole('textbox', { name: 'Prompt input' })
        .fill('Update the deck title and show its preview.');
    await chat.getByRole('textbox', { name: 'Prompt input' }).press('Enter');
    const allow = chat.getByRole('option', { name: /Allow once/ });
    await expect(allow).toBeVisible({ timeout: 15000 });
    expect(writes).toHaveLength(0);
    await allow.click();
    await chat.getByRole('button', { name: /^Continue/ }).click();
    await expect(chat.locator('agent-message')).toContainText([
        'Slides updated and preview ready.',
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ writeControl: { requiredRevisionId: 'r1' } });
    expect(previews).toBe(1);
});
