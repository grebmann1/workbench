import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    supportsReasoningProvider,
    resolveProviderOptions,
    createProviderInstance,
    resolveProviderModelInstance,
} from '../providerRuntime.ts';
import { codexFormatRequest } from '../provider/codex/runtime.ts';

const OAUTH_CREDS = {
    access: 'tok',
    refresh: 'ref',
    expires: 4_102_444_800_000, // year 2100, comfortably unexpired
    accountId: 'acct-123',
};

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

test('createProviderInstance: openai + oauth selects the Codex (WHAM) runtime', () => {
    const instance = createProviderInstance({
        provider: 'openai',
        authMode: 'oauth',
        oauth: OAUTH_CREDS,
    });
    assert.equal(typeof instance, 'function');
});

test('resolveProviderModelInstance: openai + oauth resolves a Responses-API model', () => {
    const instance = createProviderInstance({
        provider: 'openai',
        authMode: 'oauth',
        oauth: OAUTH_CREDS,
    });
    const model = resolveProviderModelInstance(instance, {
        provider: 'openai',
        modelId: 'gpt-5.1-codex',
        authMode: 'oauth',
    }) as any;
    assert.equal(model.provider, 'openai.responses');
});

test('resolveProviderModelInstance: codex default callable resolves Responses without authMode', () => {
    // Mirrors the context-compaction path, which resolves the summary model without passing
    // authMode — the codex instance's default callable must still route to the Responses API.
    const instance = createProviderInstance({
        provider: 'openai',
        authMode: 'oauth',
        oauth: OAUTH_CREDS,
    });
    const model = resolveProviderModelInstance(instance, {
        provider: 'openai',
        modelId: 'gpt-5.1-codex',
    }) as any;
    assert.equal(model.provider, 'openai.responses');
});

test('createProviderInstance: grok + oauth returns a callable (bearer = access token)', () => {
    const instance = createProviderInstance({
        provider: 'grok',
        authMode: 'oauth',
        oauth: OAUTH_CREDS,
    });
    assert.equal(typeof instance, 'function');
});

test('codexFormatRequest: injects store:false and lifts the system message into instructions', () => {
    // WHAM requires top-level `instructions`; the SDK puts the system prompt in `input`.
    const out = codexFormatRequest('https://chatgpt.com/backend-api/wham/responses', {
        method: 'POST',
        body: JSON.stringify({
            model: 'gpt-5.1-codex',
            input: [
                { role: 'system', content: [{ type: 'input_text', text: 'You are Codex.' }] },
                { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
            ],
        }),
    });
    const body = JSON.parse(out.options?.body as string);
    assert.equal(body.store, false);
    assert.equal(body.instructions, 'You are Codex.');
    assert.equal(body.input.length, 1);
    assert.equal(body.input[0].role, 'user');

    // No system message → instructions defaulted so WHAM doesn't reject the request.
    const noSystem = JSON.parse(
        codexFormatRequest('x', {
            body: JSON.stringify({ input: [{ role: 'user', content: 'hi' }] }),
        }).options?.body as string
    );
    assert.ok(noSystem.instructions);

    // Existing store/instructions preserved; non-JSON / no body pass through.
    const kept = JSON.parse(
        codexFormatRequest('x', { body: JSON.stringify({ store: true, instructions: 'keep' }) })
            .options?.body as string
    );
    assert.equal(kept.store, true);
    assert.equal(kept.instructions, 'keep');
    assert.equal(codexFormatRequest('x', { method: 'GET' }).options?.body, undefined);
    assert.equal(codexFormatRequest('x', { body: 'not-json' }).options?.body, 'not-json');
});

test('createProviderInstance: internal Anthropic Bedrock targets /invoke-with-response-stream on streaming requests', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestedBody = '';
    globalThis.fetch = (async (url: RequestInfo | URL, options?: RequestInit) => {
        requestedUrl = String(url);
        requestedBody = String(options?.body || '');
        // Emulate the gateway's AWS eventstream content-type response header.
        return new Response(new Uint8Array(0), {
            status: 200,
            headers: { 'content-type': 'application/vnd.amazon.eventstream' },
        });
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
        assert.equal(
            requestedUrl,
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock/model/us.anthropic.claude-haiku-4-5-20251001-v1:0/invoke-with-response-stream'
        );
        assert.equal(parsedBody.anthropic_version, 'bedrock-2023-05-31');
        assert.equal('model' in parsedBody, false);
        assert.equal('stream' in parsedBody, false);
        // Eventstream responses are rewritten to SSE so the SDK parser can read them.
        assert.equal(response.headers.get('content-type'), 'text/event-stream');
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

test('createProviderInstance: internal Anthropic Bedrock targets /invoke when not streaming', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = (async (url: RequestInfo | URL) => {
        requestedUrl = String(url);
        return new Response(
            JSON.stringify({
                model: 'claude-haiku-4-5',
                id: 'msg_bdrk_02',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'ok' }],
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
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

        await model.config.fetch(
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock/messages',
            {
                method: 'POST',
                body: JSON.stringify({
                    model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
                }),
            }
        );

        assert.equal(
            requestedUrl,
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock/model/us.anthropic.claude-haiku-4-5-20251001-v1:0/invoke'
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createProviderInstance: internal Anthropic Bedrock passes /invoke JSON through unchanged', async () => {
    const originalFetch = globalThis.fetch;
    const invokeJson = JSON.stringify({
        model: 'claude-haiku-4-5',
        id: 'msg_bdrk_03',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Calling tool...' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 5 },
    });
    globalThis.fetch = (async () =>
        new Response(invokeJson, {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })) as typeof fetch;
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
                }),
            }
        );
        assert.equal(response.headers.get('content-type'), 'application/json');
        assert.equal(await response.text(), invokeJson);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('createProviderInstance: internal Anthropic Bedrock decodes eventstream frames to SSE', async () => {
    const { createEventstreamToSseTransformer } =
        await import('../provider/anthropic/eventstream.ts');

    // Build a single AWS eventstream frame wrapping an Anthropic message_start event.
    const innerJson = JSON.stringify({
        type: 'message_start',
        message: { id: 'msg_test', model: 'claude-haiku', role: 'assistant', usage: {} },
    });
    const base64 =
        typeof btoa === 'function'
            ? btoa(innerJson)
            : Buffer.from(innerJson, 'utf-8').toString('base64');
    const payload = new TextEncoder().encode(JSON.stringify({ bytes: base64 }));
    const headers = new Uint8Array(0);
    const totalLen = 12 + headers.length + payload.length + 4;
    const frame = new Uint8Array(totalLen);
    const view = new DataView(frame.buffer);
    view.setUint32(0, totalLen, false);
    view.setUint32(4, headers.length, false);
    view.setUint32(8, 0, false); // prelude CRC (unvalidated)
    frame.set(payload, 12 + headers.length);
    view.setUint32(totalLen - 4, 0, false); // message CRC (unvalidated)

    const upstream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(frame);
            controller.close();
        },
    });
    const out = upstream.pipeThrough(createEventstreamToSseTransformer());
    const sseText = await new Response(out).text();
    assert.match(sseText, /^event: message_start\n/);
    assert.match(sseText, /"type":"message_start"/);
    assert.match(sseText, /"id":"msg_test"/);
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
