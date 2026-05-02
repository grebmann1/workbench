import assert from 'node:assert/strict';
import { test } from 'node:test';

import { grokRuntime } from '../runtime.ts';

test('grokRuntime.supportsReasoning: false (xAI SDK does not expose reasoning stream)', () => {
    assert.equal(grokRuntime.supportsReasoning(), false);
});

test('grokRuntime.resolveOptions: always returns undefined (no reasoning/option mapping today)', () => {
    assert.equal(grokRuntime.resolveOptions({}), undefined);
    assert.equal(
        grokRuntime.resolveOptions({
            reasoningConfig: { reasoningEffort: 'high', reasoningSummary: 'auto' },
        }),
        undefined
    );
});

test('grokRuntime.createInstance: returns a callable provider instance', () => {
    const instance = grokRuntime.createInstance({ apiKey: 'k' });
    assert.equal(typeof instance, 'function');
});

test('grokRuntime.resolveModel: delegates to instance() with the given model id', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = grokRuntime.resolveModel(fakeProvider, { modelId: 'grok-4.20-0309-reasoning' });
    assert.equal(called, 'grok-4.20-0309-reasoning');
    assert.deepEqual(model as any, { id: 'grok-4.20-0309-reasoning' });
});

test('grokRuntime: no formatRequest or streamingResponse hooks', () => {
    assert.equal(grokRuntime.formatRequest, undefined);
    assert.equal(grokRuntime.streamingResponse, undefined);
});
