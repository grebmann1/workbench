import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    supportsReasoningProvider,
    resolveProviderOptions,
    createProviderInstance,
    resolveProviderModelInstance,
} from '../providerRuntime.ts';

test('supportsReasoningProvider: true for openai, false for others', () => {
    assert.equal(supportsReasoningProvider('openai'), true);
    assert.equal(supportsReasoningProvider('anthropic'), false);
    assert.equal(supportsReasoningProvider('gemini'), false);
    assert.equal(supportsReasoningProvider('grok'), false);
});

test('resolveProviderOptions: gemini maps reasoning effort to thinkingLevel', () => {
    const out = resolveProviderOptions({
        provider: 'gemini',
        reasoningConfig: { reasoningEffort: 'high', reasoningSummary: 'auto' },
    }) as any;
    assert.equal(out.google.thinkingConfig.thinkingLevel, 'high');
});

test('resolveProviderOptions: gemini xhigh falls back to high', () => {
    const out = resolveProviderOptions({
        provider: 'gemini',
        reasoningConfig: { reasoningEffort: 'xhigh', reasoningSummary: 'auto' },
    }) as any;
    assert.equal(out.google.thinkingConfig.thinkingLevel, 'high');
});

test('resolveProviderOptions: gemini without reasoningConfig sets thinkingBudget: 0', () => {
    const out = resolveProviderOptions({ provider: 'gemini' }) as any;
    assert.equal(out.google.thinkingConfig.thinkingBudget, 0);
});

test('resolveProviderOptions: anthropic medium maps to 8000-token budget', () => {
    const out = resolveProviderOptions({
        provider: 'anthropic',
        reasoningConfig: { reasoningEffort: 'medium', reasoningSummary: 'auto' },
    }) as any;
    assert.equal(out.anthropic.thinking.type, 'enabled');
    assert.equal(out.anthropic.thinking.budgetTokens, 8000);
});

test('resolveProviderOptions: anthropic minimal → 1024, low → 4096, high → 16000, xhigh → 32000', () => {
    const budget = (effort: string) =>
        (
            resolveProviderOptions({
                provider: 'anthropic',
                reasoningConfig: { reasoningEffort: effort, reasoningSummary: 'auto' },
            }) as any
        ).anthropic.thinking.budgetTokens;
    assert.equal(budget('minimal'), 1024);
    assert.equal(budget('low'), 4096);
    assert.equal(budget('high'), 16000);
    assert.equal(budget('xhigh'), 32000);
});

test('resolveProviderOptions: openai passes reasoningConfig through as openai options', () => {
    const cfg = { reasoningEffort: 'high', reasoningSummary: 'auto' };
    const out = resolveProviderOptions({ provider: 'openai', reasoningConfig: cfg }) as any;
    assert.equal(out.openai, cfg);
});

test('resolveProviderOptions: unsupported provider with no reasoning → undefined', () => {
    assert.equal(resolveProviderOptions({ provider: 'grok' }), undefined);
});

test('createProviderInstance: returns callable model resolver for openai', () => {
    const instance = createProviderInstance({
        provider: 'openai',
        apiKey: 'k',
    });
    assert.equal(typeof instance, 'function');
});

test('createProviderInstance: returns callable for anthropic', () => {
    const instance = createProviderInstance({ provider: 'anthropic', apiKey: 'k' });
    assert.equal(typeof instance, 'function');
});

test('createProviderInstance: returns callable for gemini', () => {
    const instance = createProviderInstance({ provider: 'gemini', apiKey: 'k' });
    assert.equal(typeof instance, 'function');
});

test('createProviderInstance: isInternal forces OpenAI SDK', () => {
    const instance = createProviderInstance({
        provider: 'anthropic',
        apiKey: 'k',
        isInternal: true,
    });
    assert.equal(typeof instance, 'function');
});

test('resolveProviderModelInstance: openai invokes provider as function', () => {
    let called: string | null = null;
    const fakeProvider: any = (id: string) => {
        called = id;
        return { id };
    };
    const model = resolveProviderModelInstance(fakeProvider, {
        provider: 'openai',
        modelId: 'gpt-4',
    });
    assert.equal(called, 'gpt-4');
    assert.deepEqual(model, { id: 'gpt-4' });
});

test('resolveProviderModelInstance: mistral uses .chat when available', () => {
    let viaChat = false;
    const fakeProvider: any = Object.assign((id: string) => ({ id, via: 'call' }), {
        chat: (id: string) => {
            viaChat = true;
            return { id, via: 'chat' };
        },
    });
    const model = resolveProviderModelInstance(fakeProvider, {
        provider: 'mistral',
        modelId: 'mistral-large',
    }) as any;
    assert.equal(viaChat, true);
    assert.equal(model.via, 'chat');
});
