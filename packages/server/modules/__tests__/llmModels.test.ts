import assert from 'node:assert/strict';
import { test } from 'node:test';

import { __testables } from '../llmModels.ts';

const {
    normalizeProviderConfigMap,
    getStaticProviderCatalog,
    getOpenAiCatalog,
    getProviderCatalog,
    buildCatalogs,
} = __testables;

function jsonFetch(body: unknown, ok = true) {
    return (async () =>
        ({
            ok,
            status: ok ? 200 : 502,
            json: async () => body,
        }) as Response) as unknown as typeof fetch;
}

function jsonFetchByUrl(handler: (url: string) => { ok?: boolean; body: unknown }) {
    return (async (url: string | URL) => {
        const result = handler(String(url));
        return {
            ok: result.ok !== false,
            status: result.ok === false ? 502 : 200,
            json: async () => result.body,
        } as Response;
    }) as unknown as typeof fetch;
}

test('normalizeProviderConfigMap: default baseUrls and null apiKey when empty', () => {
    const out = normalizeProviderConfigMap({});
    assert.equal(out.openai.apiKey, null);
    assert.equal(out.openai.baseUrl, 'https://api.openai.com/v1');
    assert.equal(out.anthropic.baseUrl, 'https://api.anthropic.com/v1');
    assert.equal(out.gemini.baseUrl, 'https://generativelanguage.googleapis.com');
    assert.equal(out.mistral.baseUrl, 'https://api.mistral.ai/v1');
    assert.equal(out.grok.baseUrl, 'https://api.x.ai/v1');
});

test('normalizeProviderConfigMap: preserves user-supplied apiKey/baseUrl', () => {
    const out = normalizeProviderConfigMap({
        openai: { apiKey: '  sk-123 ', baseUrl: 'https://my.openai/v1' },
    });
    assert.equal(out.openai.apiKey, 'sk-123');
    assert.equal(out.openai.baseUrl, 'https://my.openai/v1');
});

test('normalizeProviderConfigMap: non-object input still returns complete shape', () => {
    const out = normalizeProviderConfigMap(null);
    assert.ok(out.openai);
    assert.ok(out.anthropic);
    assert.ok(out.gemini);
    assert.ok(out.mistral);
    assert.ok(out.grok);
});

test('getStaticProviderCatalog: missing baseUrl → invalid_config', () => {
    const out = getStaticProviderCatalog('anthropic', { apiKey: null, baseUrl: '' });
    assert.equal(out.status, 'invalid_config');
    assert.match(out.error || '', /base URL/);
});

test('getStaticProviderCatalog: baseUrl but no apiKey → missing_key', () => {
    const out = getStaticProviderCatalog('anthropic', {
        apiKey: null,
        baseUrl: 'https://api.anthropic.com/v1',
    });
    assert.equal(out.status, 'missing_key');
    assert.match(out.error || '', /API key/);
    assert.ok(out.models.length > 0);
});

test('getStaticProviderCatalog: internal gateway baseUrl suppresses static models', () => {
    const out = getStaticProviderCatalog('anthropic', {
        apiKey: null,
        baseUrl: 'https://eng-ai-model-gateway.example.com',
    });
    assert.equal(out.models.length, 0);
    assert.equal(out.status, 'missing_key');
});

test('getOpenAiCatalog: missing baseUrl → invalid_config', async () => {
    const out = await getOpenAiCatalog({ apiKey: null, baseUrl: '' });
    assert.equal(out.status, 'invalid_config');
});

test('getOpenAiCatalog: no apiKey with public baseUrl → missing_key, static models', async () => {
    const out = await getOpenAiCatalog({
        apiKey: null,
        baseUrl: 'https://api.openai.com/v1',
    });
    assert.equal(out.status, 'missing_key');
    assert.ok(out.models.length > 0);
});

test('getOpenAiCatalog: mixed gateway dump drops non-OpenAI ids', async () => {
    const out = await getOpenAiCatalog(
        {
            apiKey: 'sk-123',
            baseUrl: 'https://api.openai.com/v1',
        },
        jsonFetch({
            data: [
                { id: 'gpt-5.6-sol' },
                { id: 'claude-haiku-4-5-20251001' },
                { id: 'gemini-2.0-flash' },
            ],
        })
    );
    assert.deepEqual(
        out.models.map(model => model.value),
        ['gpt-5.6-sol']
    );
});

test('getOpenAiCatalog: apiKey with public baseUrl uses the live catalog', async () => {
    const out = await getOpenAiCatalog(
        {
            apiKey: 'sk-123',
            baseUrl: 'https://api.openai.com/v1',
        },
        jsonFetch({ data: [{ id: 'gpt-live' }, { id: 'whisper-1' }] })
    );
    assert.equal(out.status, 'ok');
    assert.deepEqual(
        out.models.map(model => model.value),
        ['gpt-live']
    );
    assert.equal(out.defaultModel, 'gpt-live');
});

test('getOpenAiCatalog: upstream error falls back to static models', async () => {
    const out = await getOpenAiCatalog(
        {
            apiKey: 'sk-123',
            baseUrl: 'https://api.openai.com/v1',
        },
        jsonFetch({}, false)
    );
    assert.equal(out.status, 'upstream_error');
    assert.ok(out.models.length > 0);
    assert.ok(out.models.some(model => model.value === 'gpt-5-mini'));
});

test('getProviderCatalog: Anthropic live list with a key', async () => {
    const out = await getProviderCatalog(
        'anthropic',
        { apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com/v1' },
        jsonFetch({ data: [{ id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6' }] })
    );
    assert.equal(out.status, 'ok');
    assert.equal(out.models[0].value, 'claude-opus-4-6');
});

test('getProviderCatalog: Gemini live list filters embed-only models', async () => {
    const out = await getProviderCatalog(
        'gemini',
        { apiKey: 'gem', baseUrl: 'https://generativelanguage.googleapis.com' },
        jsonFetch({
            models: [
                {
                    name: 'models/gemini-3.1-pro-preview',
                    supportedGenerationMethods: ['generateContent'],
                },
                {
                    name: 'models/embedding-001',
                    supportedGenerationMethods: ['embedContent'],
                },
            ],
        })
    );
    assert.deepEqual(
        out.models.map(model => model.value),
        ['gemini-3.1-pro-preview']
    );
});

test('getProviderCatalog: Mistral and Grok live lists', async () => {
    const mistral = await getProviderCatalog(
        'mistral',
        { apiKey: 'm', baseUrl: 'https://api.mistral.ai/v1' },
        jsonFetch({ data: [{ id: 'mistral-large-live' }] })
    );
    assert.equal(mistral.models[0].value, 'mistral-large-live');

    const grok = await getProviderCatalog(
        'grok',
        { apiKey: 'x', baseUrl: 'https://api.x.ai/v1' },
        jsonFetch({ models: [{ id: 'grok-4-live' }] })
    );
    assert.equal(grok.models[0].value, 'grok-4-live');
});

test('getProviderCatalog: no key still returns static models + missing_key', async () => {
    const out = await getProviderCatalog('anthropic', {
        apiKey: null,
        baseUrl: 'https://api.anthropic.com/v1',
    });
    assert.equal(out.status, 'missing_key');
    assert.ok(out.models.some(model => model.value === 'claude-sonnet-4-6'));
});

test('getProviderCatalog: empty live list falls back to static', async () => {
    const out = await getProviderCatalog(
        'openai',
        { apiKey: 'sk', baseUrl: 'https://api.openai.com/v1' },
        jsonFetch({ data: [{ id: 'whisper-1' }] })
    );
    assert.equal(out.status, 'ok');
    assert.ok(out.models.some(model => model.value === 'gpt-5-mini'));
});

test('getProviderCatalog: internal gateway error does not leak the public static list', async () => {
    const out = await getProviderCatalog(
        'anthropic',
        {
            apiKey: 'sk',
            baseUrl: 'https://eng-ai-model-gateway.example.com/bedrock',
        },
        jsonFetch({}, false)
    );
    assert.equal(out.status, 'upstream_error');
    assert.equal(out.models.length, 0);
});

test('buildCatalogs: returns catalog for every supported provider', async () => {
    const configs = normalizeProviderConfigMap({});
    const out = await buildCatalogs(configs, jsonFetch({ data: [] }));
    assert.ok(out.openai);
    assert.ok(out.anthropic);
    assert.ok(out.gemini);
    assert.ok(out.mistral);
    assert.ok(out.grok);
});

test('buildCatalogs: live-fetches configured providers independently', async () => {
    const configs = normalizeProviderConfigMap({
        openai: { apiKey: 'sk-o', baseUrl: 'https://api.openai.com/v1' },
        anthropic: { apiKey: 'sk-a', baseUrl: 'https://api.anthropic.com/v1' },
    });
    const out = await buildCatalogs(
        configs,
        jsonFetchByUrl(url => {
            if (url.includes('api.openai.com')) {
                return { body: { data: [{ id: 'gpt-live' }] } };
            }
            if (url.includes('api.anthropic.com')) {
                return { body: { data: [{ id: 'claude-live' }] } };
            }
            return { ok: false, body: {} };
        })
    );
    assert.equal(out.openai.models[0].value, 'gpt-live');
    assert.equal(out.anthropic.models[0].value, 'claude-live');
    assert.equal(out.mistral.status, 'missing_key');
});
