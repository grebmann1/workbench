import assert from 'node:assert/strict';
import { test } from 'node:test';

import { geminiRuntime } from '../runtime.ts';

test('geminiRuntime.supportsReasoning: false (thoughts surfaced via thinkingConfig, not the generic flag)', () => {
    assert.equal(geminiRuntime.supportsReasoning(), false);
});

test('geminiRuntime.resolveOptions: missing reasoningConfig → thinkingBudget: 0', () => {
    const out = geminiRuntime.resolveOptions({}) as any;
    assert.deepEqual(out, { google: { thinkingConfig: { thinkingBudget: 0 } } });
});

test('geminiRuntime.resolveOptions: valid effort → thinkingLevel + includeThoughts', () => {
    const out = geminiRuntime.resolveOptions({
        reasoningConfig: { reasoningEffort: 'medium', reasoningSummary: 'auto' },
    }) as any;
    assert.deepEqual(out, {
        google: { thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true } },
    });
});

test('geminiRuntime.resolveOptions: xhigh falls back to high (no xhigh on Google)', () => {
    const out = geminiRuntime.resolveOptions({
        reasoningConfig: { reasoningEffort: 'xhigh', reasoningSummary: 'auto' },
    }) as any;
    assert.equal(out.google.thinkingConfig.thinkingLevel, 'high');
    assert.equal(out.google.thinkingConfig.includeThoughts, true);
});

test('geminiRuntime.resolveOptions: all documented efforts map 1:1 (minimal, low, medium, high)', () => {
    const level = (effort: string) =>
        (
            geminiRuntime.resolveOptions({
                reasoningConfig: { reasoningEffort: effort, reasoningSummary: 'auto' },
            }) as any
        ).google.thinkingConfig.thinkingLevel;
    assert.equal(level('minimal'), 'minimal');
    assert.equal(level('low'), 'low');
    assert.equal(level('medium'), 'medium');
    assert.equal(level('high'), 'high');
});

test('geminiRuntime.resolveOptions: unknown effort → thinkingLevel undefined, no includeThoughts (falls through to budget:0 branch via nullish map)', () => {
    // `GEMINI_THINKING_LEVEL_MAP['bogus']` returns undefined, which the runtime
    // treats as "no level" and emits the thinkingBudget:0 shape.
    const out = geminiRuntime.resolveOptions({
        reasoningConfig: { reasoningEffort: 'bogus', reasoningSummary: 'auto' },
    }) as any;
    assert.deepEqual(out, { google: { thinkingConfig: { thinkingBudget: 0 } } });
});

test('geminiRuntime.resolveModel: uses instance() when instance.chat is absent', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = geminiRuntime.resolveModel(fakeProvider, { modelId: 'gemini-3-flash-preview' });
    assert.equal(called, 'gemini-3-flash-preview');
    assert.deepEqual(model as any, { id: 'gemini-3-flash-preview' });
});

test('geminiRuntime.resolveModel: isInternal + instance.chat → uses .chat (gateway shape)', () => {
    let viaChat = false;
    const fakeProvider: any = Object.assign((id: string) => ({ id, via: 'call' }), {
        chat: (id: string) => {
            viaChat = true;
            return { id, via: 'chat' };
        },
    });
    const model = geminiRuntime.resolveModel(fakeProvider, {
        modelId: 'gemini-3-pro-preview',
        isInternal: true,
    }) as any;
    assert.equal(viaChat, true);
    assert.equal(model.via, 'chat');
});

test('geminiRuntime.resolveModel: isInternal without instance.chat falls back to instance()', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    geminiRuntime.resolveModel(fakeProvider, {
        modelId: 'gemini-3-flash-preview',
        isInternal: true,
    });
    assert.equal(called, 'gemini-3-flash-preview');
});

test('geminiRuntime: no formatRequest or streamingResponse hooks (native SDK handles /v1beta directly)', () => {
    assert.equal(geminiRuntime.formatRequest, undefined);
    assert.equal(geminiRuntime.streamingResponse, undefined);
});
