import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openaiRuntime } from '../runtime.ts';

test('openaiRuntime.supportsReasoning: true (gpt-5* stream reasoning-deltas)', () => {
    assert.equal(openaiRuntime.supportsReasoning(), true);
});

test('openaiRuntime.resolveOptions: passes reasoningConfig through as openai options', () => {
    const cfg = { reasoningEffort: 'high', reasoningSummary: 'auto' };
    const out = openaiRuntime.resolveOptions({ reasoningConfig: cfg }) as any;
    assert.deepEqual(out, { openai: cfg });
});

test('openaiRuntime.resolveOptions: missing reasoningConfig returns undefined', () => {
    assert.equal(openaiRuntime.resolveOptions({}), undefined);
});

test('openaiRuntime.createInstance: returns a callable provider instance', () => {
    const instance = openaiRuntime.createInstance({ apiKey: 'k' });
    assert.equal(typeof instance, 'function');
});

test('openaiRuntime.resolveModel: invokes provider as a plain function with modelId', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = openaiRuntime.resolveModel(fakeProvider, { modelId: 'gpt-4o-mini' });
    assert.equal(called, 'gpt-4o-mini');
    assert.deepEqual(model as any, { id: 'gpt-4o-mini' });
});

test('openaiRuntime: no formatRequest or streamingResponse hooks (reasoning burst is gateway-side)', () => {
    // The `/responses` reasoning text-burst is upstream wire shape; we deliberately
    // don't rewrite requests or transform responses for openai. See the comment in
    // openai/runtime.ts::resolveOptions for why.
    assert.equal(openaiRuntime.formatRequest, undefined);
    assert.equal(openaiRuntime.streamingResponse, undefined);
});
