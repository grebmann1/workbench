import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anthropicRuntime } from '../runtime.ts';

const BEDROCK_URL =
    'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock';
const PUBLIC_URL = 'https://api.anthropic.com';

test('anthropicRuntime.supportsReasoning: false (legacy agent-UI flag; Bedrock path still streams reasoning)', () => {
    assert.equal(anthropicRuntime.supportsReasoning(), false);
});

test('anthropicRuntime.resolveOptions: missing reasoningConfig → undefined', () => {
    assert.equal(anthropicRuntime.resolveOptions({}), undefined);
});

test('anthropicRuntime.resolveOptions: unknown effort → undefined (no thinking payload)', () => {
    const out = anthropicRuntime.resolveOptions({
        reasoningConfig: { reasoningEffort: 'ludicrous', reasoningSummary: 'auto' },
    });
    assert.equal(out, undefined);
});

test('anthropicRuntime.resolveOptions: effort → thinking budget map', () => {
    const budget = (effort: string) =>
        (
            anthropicRuntime.resolveOptions({
                reasoningConfig: { reasoningEffort: effort, reasoningSummary: 'auto' },
            }) as any
        ).anthropic.thinking.budgetTokens;
    assert.equal(budget('minimal'), 1024);
    assert.equal(budget('low'), 4096);
    assert.equal(budget('medium'), 8000);
    assert.equal(budget('high'), 16000);
    assert.equal(budget('xhigh'), 32000);
});

test('anthropicRuntime.resolveOptions: always emits type:"enabled" (classic shape — adaptive is not yet supported)', () => {
    const out = anthropicRuntime.resolveOptions({
        reasoningConfig: { reasoningEffort: 'medium', reasoningSummary: 'auto' },
    }) as any;
    assert.equal(out.anthropic.thinking.type, 'enabled');
});

test('anthropicRuntime.formatRequest: returns a rewriter for Bedrock baseUrl', () => {
    const hook = anthropicRuntime.formatRequest?.({ baseUrl: BEDROCK_URL });
    assert.equal(typeof hook, 'function');
});

test('anthropicRuntime.formatRequest: returns undefined for non-Bedrock baseUrl', () => {
    assert.equal(anthropicRuntime.formatRequest?.({ baseUrl: PUBLIC_URL }), undefined);
});

test('anthropicRuntime.streamingResponse: returns a transformer for Bedrock baseUrl', () => {
    const hook = anthropicRuntime.streamingResponse?.({ baseUrl: BEDROCK_URL });
    assert.equal(typeof hook, 'function');
});

test('anthropicRuntime.streamingResponse: returns undefined for non-Bedrock baseUrl', () => {
    assert.equal(anthropicRuntime.streamingResponse?.({ baseUrl: PUBLIC_URL }), undefined);
});

test('anthropicRuntime.resolveModel: delegates to instance() with the given model id', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = anthropicRuntime.resolveModel(fakeProvider, {
        modelId: 'us.anthropic.claude-sonnet-4-6',
    });
    assert.equal(called, 'us.anthropic.claude-sonnet-4-6');
    assert.deepEqual(model as any, { id: 'us.anthropic.claude-sonnet-4-6' });
});
