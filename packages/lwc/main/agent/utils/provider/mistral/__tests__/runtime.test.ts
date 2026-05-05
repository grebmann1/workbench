import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mistralRuntime } from '../runtime.ts';

test('mistralRuntime.supportsReasoning: false', () => {
    assert.equal(mistralRuntime.supportsReasoning(), false);
});

test('mistralRuntime.resolveOptions: always returns undefined', () => {
    assert.equal(mistralRuntime.resolveOptions({}), undefined);
    assert.equal(
        mistralRuntime.resolveOptions({
            reasoningConfig: { reasoningEffort: 'medium', reasoningSummary: 'auto' },
        }),
        undefined
    );
});

test('mistralRuntime.createInstance: returns a callable provider instance', () => {
    const instance = mistralRuntime.createInstance({ apiKey: 'k' });
    assert.equal(typeof instance, 'function');
});

test('mistralRuntime.resolveModel: uses .chat when available (OpenAI-SDK shape for Mistral API)', () => {
    let viaChat = false;
    const fakeProvider: any = Object.assign((id: string) => ({ id, via: 'call' }), {
        chat: (id: string) => {
            viaChat = true;
            return { id, via: 'chat' };
        },
    });
    const model = mistralRuntime.resolveModel(fakeProvider, { modelId: 'mistral-large-2512' });
    assert.equal(viaChat, true);
    assert.equal((model as any).via, 'chat');
});

test('mistralRuntime.resolveModel: falls back to instance() when .chat is missing', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = mistralRuntime.resolveModel(fakeProvider, { modelId: 'mistral-small-2603' });
    assert.equal(called, 'mistral-small-2603');
    assert.deepEqual(model as any, { id: 'mistral-small-2603' });
});

test('mistralRuntime: no formatRequest or streamingResponse hooks', () => {
    assert.equal(mistralRuntime.formatRequest, undefined);
    assert.equal(mistralRuntime.streamingResponse, undefined);
});
