import { test } from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../llmModels.ts';

const { normalizeProviderConfigMap, getStaticProviderCatalog, getOpenAiCatalog, buildCatalogs } =
    __testables;

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

test('getOpenAiCatalog: apiKey with public baseUrl → ok + defaultModel set', async () => {
    const out = await getOpenAiCatalog({
        apiKey: 'sk-123',
        baseUrl: 'https://api.openai.com/v1',
    });
    assert.equal(out.status, 'ok');
    assert.ok(out.defaultModel);
});

test('buildCatalogs: returns catalog for every supported provider', async () => {
    const configs = normalizeProviderConfigMap({});
    const out = await buildCatalogs(configs);
    assert.ok(out.openai);
    assert.ok(out.anthropic);
    assert.ok(out.gemini);
    assert.ok(out.mistral);
    assert.ok(out.grok);
});
