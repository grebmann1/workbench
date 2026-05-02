import assert from 'node:assert/strict';
import { test } from 'node:test';

import { internalRuntime } from '../runtime.ts';

test('internalRuntime.supportsReasoning: true (/responses carries reasoning deltas for gpt-5*)', () => {
    assert.equal(internalRuntime.supportsReasoning(), true);
});

test('internalRuntime.resolveOptions: passes reasoningConfig through as openai options', () => {
    const cfg = { reasoningEffort: 'medium', reasoningSummary: 'auto' };
    const out = internalRuntime.resolveOptions({ reasoningConfig: cfg }) as any;
    assert.deepEqual(out, { openai: cfg });
});

test('internalRuntime.resolveOptions: missing reasoningConfig → undefined', () => {
    assert.equal(internalRuntime.resolveOptions({}), undefined);
});

test('internalRuntime.createInstance: returns a callable provider instance', () => {
    const instance = internalRuntime.createInstance({ apiKey: 'k' });
    assert.equal(typeof instance, 'function');
});

test('internalRuntime.resolveModel: delegates to instance() with the given model id', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = internalRuntime.resolveModel(fakeProvider, { modelId: 'gpt-5-mini' });
    assert.equal(called, 'gpt-5-mini');
    assert.deepEqual(model as any, { id: 'gpt-5-mini' });
});

test('internalRuntime.createInstance: rewrites requests to /responses (OpenAI-compatible gateway)', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = (async (url: RequestInfo | URL) => {
        requestedUrl = String(url);
        return new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;
    try {
        const instance = internalRuntime.createInstance({
            apiKey: 'k',
            baseUrl:
                'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1',
        });
        const model = internalRuntime.resolveModel(instance, { modelId: 'gpt-5-mini' }) as any;
        // Any original URL under the OpenAI SDK should get rewritten to the
        // gateway's /responses endpoint on the same origin.
        await model.config.fetch(
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1/chat/completions',
            { method: 'POST', body: '{}' }
        );
        assert.equal(
            requestedUrl,
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/responses'
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});
