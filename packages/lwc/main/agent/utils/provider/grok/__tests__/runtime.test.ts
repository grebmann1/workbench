import assert from 'node:assert/strict';
import { test } from 'node:test';
import { streamText } from 'ai';

import { grokRuntime } from '../runtime.ts';

test('Grok preserves reasoning across empty tool-call deltas and completes the answer', async t => {
    const modelId = 'grok-4.20-0309-reasoning';
    const deltas = [
        { role: 'assistant', content: '', reasoning_content: '', tool_calls: [] },
        { reasoning_content: 'Check the saved totals.', tool_calls: [] },
        { reasoning_content: ' The total is 42.', tool_calls: [] },
        { content: 'There are 42 records.', tool_calls: [] },
    ];
    const events = deltas.map(delta => ({
        id: 'synthetic-grok-response',
        object: 'chat.completion.chunk',
        created: 1,
        model: modelId,
        choices: [{ index: 0, delta, finish_reason: null }],
    }));
    const finish = {
        id: 'synthetic-grok-response',
        object: 'chat.completion.chunk',
        created: 1,
        model: modelId,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    };
    t.mock.method(
        globalThis,
        'fetch',
        async () =>
            new Response(
                [...events, finish].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') +
                    'data: [DONE]\n\n',
                { headers: { 'content-type': 'text/event-stream' } }
            )
    );

    const provider = grokRuntime.createInstance({
        apiKey: 'synthetic-test-key',
        baseUrl: 'https://provider.invalid/v1',
    });
    const result = streamText({
        model: grokRuntime.resolveModel(provider, { modelId }),
        prompt: 'Check the synthetic record totals.',
        maxRetries: 0,
        onError: () => {},
    });
    const errors: unknown[] = [];
    for await (const part of result.fullStream) {
        if (part.type === 'error') errors.push(part.error);
    }

    assert.deepEqual(errors, []);
    assert.equal(await result.reasoningText, 'Check the saved totals. The total is 42.');
    assert.equal(await result.text, 'There are 42 records.');
    assert.equal(await result.finishReason, 'stop');
});
