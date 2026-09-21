import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateText, modelMessageSchema, type ModelMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

import {
    buildUserMessageParts,
    createUserModelMessage,
    isUiMessage,
    areMessagesEqual,
    appendMessageIfNotExists,
    normalizeModelMessages,
    sanitizeIncompleteToolExchanges,
} from '../message.ts';

test('buildUserMessageParts: plain text becomes a text part', () => {
    const parts = buildUserMessageParts({ text: 'hello', filesData: [] });
    assert.deepEqual(parts, [{ type: 'text', text: 'hello' }]);
});

test('buildUserMessageParts: whitespace-only text is dropped', () => {
    const parts = buildUserMessageParts({ text: '   ', filesData: [] });
    assert.deepEqual(parts, []);
});

test('buildUserMessageParts: image data URL becomes an image part with extracted base64', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [{ type: 'image/png', content: 'data:image/png;base64,QUJD', name: 'x.png' }],
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'image');
    assert.equal(parts[0].image, 'QUJD');
    assert.equal(parts[0].mediaType, 'image/png');
});

test('buildUserMessageParts: non-image with base64 data URL becomes a file part', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [
            {
                type: 'application/pdf',
                content: 'data:application/pdf;base64,ZmFrZQ==',
                name: 'a.pdf',
            },
        ],
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'file');
    assert.equal(parts[0].data, 'ZmFrZQ==');
    assert.equal(parts[0].mediaType, 'application/pdf');
    assert.equal(parts[0].filename, 'a.pdf');
});

test('buildUserMessageParts: text file with raw content keeps mediaType and data', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [{ type: 'text/plain', content: 'hello world', name: 'a.txt' }],
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'file');
    assert.equal(parts[0].data, 'hello world');
    assert.equal(parts[0].mediaType, 'text/plain');
});

test('buildUserMessageParts: skips files missing content or type', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [
            { type: '', content: 'abc' },
            { type: 'text/plain', content: '' },
            null,
            'not an object',
        ],
    });
    assert.deepEqual(parts, []);
});

test('createUserModelMessage: wraps parts with user role', () => {
    const msg = createUserModelMessage({ text: 'hi', filesData: [] });
    assert.equal(msg.role, 'user');
    assert.deepEqual(msg.content, [{ type: 'text', text: 'hi' }]);
});

test('isUiMessage: true for object with id/role/parts', () => {
    assert.equal(isUiMessage({ id: 'a', role: 'user', parts: [] }), true);
});

test('isUiMessage: false for missing fields or wrong types', () => {
    assert.equal(isUiMessage(null), false);
    assert.equal(isUiMessage(undefined), false);
    assert.equal(isUiMessage('string'), false);
    assert.equal(isUiMessage({ id: 1, role: 'u', parts: [] }), false);
    assert.equal(isUiMessage({ id: 'a', role: 'u', parts: 'not array' }), false);
});

test('areMessagesEqual: matches by id or _key', () => {
    assert.equal(areMessagesEqual({ id: 'a' }, { id: 'a' }), true);
    assert.equal(areMessagesEqual({ _key: 'k' }, { _key: 'k' }), true);
    assert.equal(areMessagesEqual({ id: 'a' }, { id: 'b' }), false);
    assert.equal(areMessagesEqual(null, null), null); // short-circuits on falsy
    assert.equal(areMessagesEqual({ id: undefined }, { id: undefined }), false);
});

test('appendMessageIfNotExists: appends when id/key not present', () => {
    const out = appendMessageIfNotExists([{ id: 'a' }], { id: 'b' });
    assert.equal(out.length, 2);
    assert.equal(out[1].id, 'b');
});

test('appendMessageIfNotExists: no-ops when message already exists', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    const out = appendMessageIfNotExists(list, { id: 'a' });
    assert.equal(out.length, 2);
    assert.equal(out, list);
});

test('normalizeModelMessages migrates saved Responses text, reasoning, and tool exchanges', () => {
    // Before the AI SDK migration, the stream writer persisted these raw
    // output/summary parts and Agents run-item envelopes in streamHistory.
    const legacy = [
        { role: 'user', content: [{ type: 'input_text', text: 'Inspect the file' }] },
        {
            id: 'reasoning-1',
            role: 'assistant',
            type: 'reasoning',
            content: [{ type: 'summary_text', text: 'Read it first', startedAt: 10, endedAt: 20 }],
        },
        {
            type: 'function_call',
            id: 'item-1',
            callId: 'call-1',
            name: 'read_file',
            arguments: '{"path":"/workspace/a.txt"}',
            providerOptions: { openai: { itemId: 'item-1' } },
        },
        {
            type: 'function_call_result',
            callId: 'call-1',
            output: { type: 'text', text: 'file contents' },
        },
        {
            role: 'assistant',
            content: [{ type: 'output_text', text: 'The file is readable.', annotations: [] }],
        },
    ];
    const snapshot = structuredClone(legacy);
    assert.equal(modelMessageSchema.array().safeParse(legacy).success, false);
    const normalized = normalizeModelMessages(legacy);
    const parsed = modelMessageSchema.array().parse(normalized);
    assert.deepEqual(parsed, [
        { role: 'user', content: [{ type: 'text', text: 'Inspect the file' }] },
        { role: 'assistant', content: [{ type: 'reasoning', text: 'Read it first' }] },
        {
            role: 'assistant',
            providerOptions: { openai: { itemId: 'item-1' } },
            content: [
                {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'read_file',
                    input: { path: '/workspace/a.txt' },
                    providerOptions: { openai: { itemId: 'item-1' } },
                },
            ],
        },
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'call-1',
                    toolName: 'read_file',
                    output: { type: 'text', value: 'file contents' },
                },
            ],
        },
        { role: 'assistant', content: [{ type: 'text', text: 'The file is readable.' }] },
    ]);
    assert.deepEqual(legacy, snapshot);
    assert.deepEqual(normalizeModelMessages(JSON.parse(JSON.stringify(normalized))), normalized);
});

test('normalizeModelMessages preserves legacy attachments and SDK args/result values', () => {
    const legacy = [
        {
            id: 'user-1',
            role: 'user',
            parts: [
                { type: 'input_text', text: 'Use these attachments' },
                { type: 'input_image', image: 'data:image/png;base64,QUJD' },
                { type: 'input_file', file_id: 'file-pdf', filename: 'report.pdf' },
            ],
        },
        {
            role: 'assistant',
            content: [
                { type: 'reasoning', reasoning: 'Check status' },
                {
                    type: 'tool-call',
                    toolCallId: 'status',
                    toolName: 'status',
                    args: { verbose: false },
                    providerOptions: { google: { thoughtSignature: 'signature' } },
                },
            ],
        },
        {
            role: 'tool',
            content: [{ type: 'tool-result', toolCallId: 'status', result: false, isError: true }],
        },
    ];
    const parsed = modelMessageSchema.array().parse(normalizeModelMessages(legacy));
    assert.deepEqual(parsed[0].content, [
        { type: 'text', text: 'Use these attachments' },
        { type: 'image', image: 'data:image/png;base64,QUJD' },
        { type: 'file', data: 'file-pdf', mediaType: 'application/pdf', filename: 'report.pdf' },
    ]);
    assert.deepEqual(parsed[1].content, [
        { type: 'reasoning', text: 'Check status' },
        {
            type: 'tool-call',
            toolCallId: 'status',
            toolName: 'status',
            input: { verbose: false },
            providerOptions: { google: { thoughtSignature: 'signature' } },
        },
    ]);
    assert.deepEqual(parsed[2].content, [
        {
            type: 'tool-result',
            toolCallId: 'status',
            toolName: 'status',
            output: { type: 'error-json', value: false },
        },
    ]);
});

test('persisted numeric-key tool content is restored without losing multimodal results', () => {
    const value = {
        0: { type: 'text', text: 'Read result' },
        1: { type: 'image-data', data: 'QUJD', mediaType: 'image/png' },
        2: { type: 'text', text: 'Final result' },
    };
    const history = [
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'read-1',
                    toolName: 'read',
                    providerOptions: { openai: { itemId: 'result-1' } },
                    output: { type: 'content', value },
                },
            ],
        },
    ];
    const normalized = normalizeModelMessages(history);
    const parsed = modelMessageSchema.array().parse(normalized);
    assert.deepEqual(parsed[0].content, [
        {
            ...history[0].content[0],
            output: { type: 'content', value: Object.values(value) },
        },
    ]);
    assert.equal(Array.isArray(history[0].content[0].output.value), false);
    assert.equal(normalizeModelMessages(normalized)[0], normalized[0]);
});

test('tool content objects with missing indexes or named fields are not silently discarded', () => {
    for (const value of [
        { 1: { type: 'text', text: 'Missing first item' } },
        {
            0: { type: 'text', text: 'First item' },
            2: { type: 'text', text: 'Missing middle item' },
        },
        { 0: { type: 'text', text: 'Result' }, extra: 'Preserve this data' },
    ]) {
        const history = [
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'read-1',
                        toolName: 'read',
                        output: { type: 'content', value },
                    },
                ],
            },
        ];
        const normalized = normalizeModelMessages(history);
        assert.equal(normalized[0], history[0]);
        assert.equal(modelMessageSchema.array().safeParse(normalized).success, false);
    }
});

test('continuation reaches the SDK with completed trailing tool context intact', async () => {
    const history = normalizeModelMessages([
        { role: 'user', content: 'Count the records' },
        {
            type: 'function_call',
            call_id: 'count-1',
            name: 'count',
            arguments: '{}',
        },
        { type: 'function_call_output', call_id: 'count-1', output: '42' },
    ]);
    const model = new MockLanguageModelV3({
        doGenerate: {
            content: [{ type: 'text', text: 'There are 42 records.' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 5, text: 5, reasoning: 0 },
            },
            warnings: [],
        },
    });
    const result = await generateText({
        model,
        messages: [
            ...sanitizeIncompleteToolExchanges(history),
            { role: 'user', content: 'What was the count?' },
        ],
    });
    assert.equal(result.text, 'There are 42 records.');
    const prompt = model.doGenerateCalls[0].prompt;
    assert.deepEqual(
        prompt.map(message => message.role),
        ['user', 'assistant', 'tool', 'user']
    );
    assert.deepEqual(prompt[2].content, [
        {
            type: 'tool-result',
            toolCallId: 'count-1',
            toolName: 'count',
            output: { type: 'text', value: '42' },
            providerOptions: undefined,
        },
    ]);
});

test('normalizeModelMessages leaves modern multimodal messages and provider metadata unchanged', () => {
    const messages: ModelMessage[] = [
        {
            role: 'user',
            content: [
                { type: 'text', text: '  preserve whitespace  ' },
                { type: 'image', image: new Uint8Array([1, 2, 3]), mediaType: 'image/png' },
                { type: 'file', data: 'file-123', mediaType: 'application/pdf' },
            ],
        },
        {
            role: 'assistant',
            content: [
                {
                    type: 'reasoning',
                    text: 'Reasoning',
                    providerOptions: { anthropic: { signature: 'signed' } },
                },
                {
                    type: 'tool-call',
                    toolCallId: 'tool-1',
                    toolName: 'inspect',
                    input: 'a valid string input',
                    providerOptions: { google: { thoughtSignature: 'signed' } },
                },
            ],
        },
        {
            role: 'tool',
            providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'tool-1',
                    toolName: 'inspect',
                    output: {
                        type: 'content',
                        value: [
                            { type: 'text', text: 'Screenshot' },
                            { type: 'image-data', data: 'QUJD', mediaType: 'image/png' },
                        ],
                    },
                },
            ],
        },
    ];
    modelMessageSchema.array().parse(messages);
    const normalized = normalizeModelMessages(messages);
    normalized.forEach((message, index) => assert.equal(message, messages[index]));
    assert.equal(sanitizeIncompleteToolExchanges(normalized), normalized);
});

test('unknown history is retained and still rejected instead of silently losing context', () => {
    const message = { role: 'assistant', content: [{ type: 'unknown-provider-part', data: 42 }] };
    const normalized = normalizeModelMessages([message]);
    assert.equal(normalized[0], message);
    assert.equal(modelMessageSchema.array().safeParse(normalized).success, false);
});

test('incomplete parallel tool suffix is removed without dropping prior completed exchanges', () => {
    const completed = normalizeModelMessages([
        { role: 'user', content: 'Inspect records' },
        { type: 'function_call', callId: 'done', name: 'inspect', arguments: '{}' },
        { type: 'function_call_result', callId: 'done', output: 'Saved result' },
    ]);
    const partial: ModelMessage[] = [
        ...completed,
        {
            role: 'assistant',
            content: [
                { type: 'tool-call', toolCallId: 'a', toolName: 'inspect', input: {} },
                { type: 'tool-call', toolCallId: 'b', toolName: 'inspect', input: {} },
                {
                    type: 'tool-call',
                    toolCallId: 'remote',
                    toolName: 'search',
                    input: {},
                    providerExecuted: true,
                },
            ],
        },
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'a',
                    toolName: 'inspect',
                    output: { type: 'text', value: 'First result' },
                },
            ],
        },
    ];
    assert.deepEqual(sanitizeIncompleteToolExchanges(partial), completed);

    const finished: ModelMessage[] = [
        ...partial,
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'b',
                    toolName: 'inspect',
                    output: { type: 'text', value: 'Second result' },
                },
            ],
        },
    ];
    // Provider-executed calls do not require a local tool result.
    assert.equal(sanitizeIncompleteToolExchanges(finished), finished);
});
