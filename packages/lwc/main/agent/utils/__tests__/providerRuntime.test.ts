import assert from 'node:assert/strict';
import { test } from 'node:test';

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

test('createProviderInstance: internal Anthropic Bedrock uses Anthropic message format', () => {
    const instance = createProviderInstance({
        provider: 'anthropic',
        apiKey: 'k',
        baseUrl:
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock',
        isInternal: true,
    });
    const model = resolveProviderModelInstance(instance, {
        provider: 'anthropic',
        modelId: 'us.anthropic.claude-sonnet-4-6',
        isInternal: true,
    }) as any;

    assert.equal(model.provider, 'anthropic.messages');
});

test('createProviderInstance: internal Anthropic Bedrock targets streaming endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedBody = '';
    globalThis.fetch = (async (url: RequestInfo | URL, options?: RequestInit) => {
        requestedUrl = String(url);
        requestedBody = String(options?.body || '');
        return new Response(
            JSON.stringify({
                model: 'claude-sonnet-4-6',
                id: 'msg_bdrk_01',
                type: 'message',
                role: 'assistant',
                content: [
                    {
                        type: 'thinking',
                        thinking: 'The user is just saying hello.',
                        signature: 'sig',
                    },
                    {
                        type: 'text',
                        text: 'Hello! How can I help you today?',
                    },
                ],
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: {
                    input_tokens: 10,
                    output_tokens: 7,
                },
            }),
            {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }
        );
    }) as typeof fetch;
    try {
        const instance = createProviderInstance({
            provider: 'anthropic',
            apiKey: 'k',
            baseUrl:
                'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock',
            isInternal: true,
        });
        const model = resolveProviderModelInstance(instance, {
            provider: 'anthropic',
            modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
            isInternal: true,
        }) as any;

        const response = await model.config.fetch(
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock/messages',
            {
                method: 'POST',
                body: JSON.stringify({
                    model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
                    stream: true,
                }),
            }
        );

        const parsedBody = JSON.parse(requestedBody);
        const responseText = await response.text();
        assert.equal(
            requestedUrl,
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock/model/us.anthropic.claude-haiku-4-5-20251001-v1:0/invoke-with-response-stream'
        );
        assert.equal(parsedBody.anthropic_version, 'bedrock-2023-05-31');
        assert.equal('model' in parsedBody, false);
        assert.equal('stream' in parsedBody, false);
        assert.equal(response.headers.get('content-type'), 'text/event-stream');
        assert.match(responseText, /"type":"message_start"/);
        assert.match(responseText, /"type":"thinking_delta"/);
        assert.match(
            responseText,
            /"type":"text_delta","text":"Hello! How can I help you today\?"/
        );
        assert.match(responseText, /"type":"message_stop"/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createProviderInstance: internal Gemini uses native streamGenerateContent endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = (async (url: RequestInfo | URL) => {
        requestedUrl = String(url);
        return new Response('data: {"candidates":[]}\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
        });
    }) as typeof fetch;
    try {
        const instance = createProviderInstance({
            provider: 'gemini',
            apiKey: 'k',
            baseUrl:
                'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1beta',
            isInternal: true,
        });
        const model = resolveProviderModelInstance(instance, {
            provider: 'gemini',
            modelId: 'gemini-3-flash-preview',
            isInternal: true,
        }) as any;

        assert.equal(model.provider, 'google.generative-ai');
        await model.config.fetch(
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse',
            { method: 'POST' }
        );

        assert.equal(
            requestedUrl,
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse'
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
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
