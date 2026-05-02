import assert from 'node:assert/strict';
import { test } from 'node:test';

import { workbenchRuntime } from '../runtime.ts';

test('workbenchRuntime.supportsReasoning: false (free tier wraps gpt-4o family)', () => {
    assert.equal(workbenchRuntime.supportsReasoning(), false);
});

test('workbenchRuntime.resolveOptions: always returns undefined', () => {
    assert.equal(workbenchRuntime.resolveOptions({}), undefined);
    assert.equal(
        workbenchRuntime.resolveOptions({
            reasoningConfig: { reasoningEffort: 'high', reasoningSummary: 'auto' },
        }),
        undefined
    );
});

test('workbenchRuntime.createInstance: returns a callable provider instance', () => {
    const instance = workbenchRuntime.createInstance({});
    assert.equal(typeof instance, 'function');
});

test('workbenchRuntime.resolveModel: delegates to instance() with the given model id', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = workbenchRuntime.resolveModel(fakeProvider, { modelId: 'gpt-4o-mini' });
    assert.equal(called, 'gpt-4o-mini');
    assert.deepEqual(model as any, { id: 'gpt-4o-mini' });
});

test('workbenchRuntime: no formatRequest or streamingResponse hooks', () => {
    assert.equal(workbenchRuntime.formatRequest, undefined);
    assert.equal(workbenchRuntime.streamingResponse, undefined);
});
