import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CONFIG_OBJECT,
    CACHE_CONFIG,
    CACHE_ORG_DATA_TYPES,
    CACHE_DOCUMENTS,
    CACHE_SESSION_CONFIG,
    CACHE_ANALYTICS_CONFIG,
    getLlmProviderConfigCacheKeys,
    getDefaultLlmProviderConfigMap,
    getLegacyLlmProviderConfigMap,
    resolveLlmProviderConfigMap,
    buildProviderConfigCacheRecord,
    getAiProviderFromConfig,
} from '../cacheManager.ts';
import {
    DEFAULT_PROVIDER_BASE_URLS,
    LLM_PROVIDERS,
    DEFAULT_LLM_PROVIDER,
} from 'shared/llm';

test('CONFIG_OBJECT: defaults to defaultValue until value is set', () => {
    const obj = new CONFIG_OBJECT<number>('some_key', 42);
    assert.equal(obj.key, 'some_key');
    assert.equal(obj.defaultValue, 42);
    assert.equal(obj.value, 42);
    obj.value = 7;
    assert.equal(obj.value, 7);
});

test('CONFIG_OBJECT: null/undefined value falls back to default', () => {
    const obj = new CONFIG_OBJECT<string | null>('nullable_key', 'fallback');
    assert.equal(obj.value, 'fallback');
    obj.value = null;
    assert.equal(obj.value, 'fallback');
});

test('CACHE_CONFIG: known public keys have expected string values', () => {
    assert.equal(CACHE_CONFIG.AI_PROVIDER.key, 'ai_provider');
    assert.equal(CACHE_CONFIG.AI_PROVIDER.defaultValue, 'openai');
    assert.equal(CACHE_CONFIG.PROVIDER_CONFIGS.key, 'llm_provider_configs');
    assert.equal(CACHE_CONFIG.OPENAI_URL.defaultValue, 'https://api.openai.com/v1');
    assert.equal(CACHE_CONFIG.ANTHROPIC_URL.defaultValue, 'https://api.anthropic.com/v1');
    assert.equal(CACHE_CONFIG.GEMINI_URL.defaultValue, 'https://generativelanguage.googleapis.com');
    assert.equal(CACHE_CONFIG.MISTRAL_URL.defaultValue, 'https://api.mistral.ai/v1');
    assert.equal(CACHE_CONFIG.GROK_URL.defaultValue, 'https://api.x.ai/v1');
});

test('CACHE_CONFIG: key values are all unique strings', () => {
    const keys = Object.values(CACHE_CONFIG).map(c => c.key);
    const unique = new Set(keys);
    assert.equal(unique.size, keys.length, 'duplicate keys detected');
});

test('CACHE_ORG_DATA_TYPES / CACHE_DOCUMENTS / session / analytics: shape sanity', () => {
    assert.equal(CACHE_ORG_DATA_TYPES.DESCRIBE, 'Describe');
    assert.equal(CACHE_ORG_DATA_TYPES.CONNECTIONS, 'connections');
    assert.equal(CACHE_DOCUMENTS.QUERYFILES, 'QUERYFILES');
    assert.equal(CACHE_SESSION_CONFIG.CLIENT_ID.key, 'client_id');
    assert.equal(CACHE_ANALYTICS_CONFIG.CLIENT_STORAGE_KEY.key, 'analytics_client_id');
});

test('getLlmProviderConfigCacheKeys: returns all provider + canonical keys', () => {
    const keys = getLlmProviderConfigCacheKeys();
    assert.ok(keys.includes('llm_provider_configs'));
    assert.ok(keys.includes('ai_provider'));
    assert.ok(keys.includes('openai_key'));
    assert.ok(keys.includes('openai_url'));
    assert.ok(keys.includes('anthropic_key'));
    assert.ok(keys.includes('gemini_key'));
    assert.ok(keys.includes('mistral_key'));
    assert.ok(keys.includes('grok_key'));
    const unique = new Set(keys);
    assert.equal(unique.size, keys.length);
});

test('getDefaultLlmProviderConfigMap: returns defaults for each provider', () => {
    const map = getDefaultLlmProviderConfigMap();
    for (const provider of LLM_PROVIDERS) {
        assert.equal(map[provider].apiKey, null);
        assert.equal(map[provider].baseUrl, DEFAULT_PROVIDER_BASE_URLS[provider]);
    }
});

test('getLegacyLlmProviderConfigMap: reads legacy *_key / *_url flat config', () => {
    const legacy = getLegacyLlmProviderConfigMap({
        openai_key: 'sk-open',
        openai_url: 'https://proxy.test/v1',
        anthropic_key: 'sk-ant',
    });
    assert.equal(legacy.openai.apiKey, 'sk-open');
    assert.equal(legacy.openai.baseUrl, 'https://proxy.test/v1');
    assert.equal(legacy.anthropic.apiKey, 'sk-ant');
    // Anthropic url not provided → default
    assert.equal(legacy.anthropic.baseUrl, DEFAULT_PROVIDER_BASE_URLS.anthropic);
    // Gemini not provided → defaults
    assert.equal(legacy.gemini.apiKey, null);
});

test('getLegacyLlmProviderConfigMap: empty / non-object → all defaults', () => {
    const map = getLegacyLlmProviderConfigMap();
    for (const provider of LLM_PROVIDERS) {
        assert.equal(map[provider].apiKey, null);
        assert.equal(map[provider].baseUrl, DEFAULT_PROVIDER_BASE_URLS[provider]);
    }
});

test('resolveLlmProviderConfigMap: prefers canonical llm_provider_configs', () => {
    const canonical = {
        openai: { apiKey: 'sk-canon', baseUrl: 'https://canon.test/v1' },
        anthropic: { apiKey: null, baseUrl: DEFAULT_PROVIDER_BASE_URLS.anthropic },
    };
    const map = resolveLlmProviderConfigMap({
        llm_provider_configs: canonical,
        openai_key: 'sk-legacy',
        openai_url: 'https://legacy.test/v1',
    });
    assert.equal(map.openai.apiKey, 'sk-canon');
    assert.equal(map.openai.baseUrl, 'https://canon.test/v1');
});

test('resolveLlmProviderConfigMap: falls back to legacy when canonical missing', () => {
    const map = resolveLlmProviderConfigMap({
        openai_key: 'sk-legacy',
        openai_url: 'https://legacy.test/v1',
    });
    assert.equal(map.openai.apiKey, 'sk-legacy');
    assert.equal(map.openai.baseUrl, 'https://legacy.test/v1');
});

test('resolveLlmProviderConfigMap: canonical null value still falls through to legacy', () => {
    const map = resolveLlmProviderConfigMap({
        llm_provider_configs: null,
        openai_key: 'sk-legacy',
    });
    assert.equal(map.openai.apiKey, 'sk-legacy');
});

test('buildProviderConfigCacheRecord: emits canonical + legacy flat keys', () => {
    const defaults = getDefaultLlmProviderConfigMap();
    defaults.openai = { apiKey: 'sk-a', baseUrl: 'https://proxy/v1' };
    defaults.anthropic = { apiKey: 'sk-b', baseUrl: DEFAULT_PROVIDER_BASE_URLS.anthropic };
    const record = buildProviderConfigCacheRecord(defaults);
    assert.equal(record.openai_key, 'sk-a');
    assert.equal(record.openai_url, 'https://proxy/v1');
    assert.equal(record.anthropic_key, 'sk-b');
    assert.equal(record.anthropic_url, DEFAULT_PROVIDER_BASE_URLS.anthropic);
    assert.ok(record.llm_provider_configs && typeof record.llm_provider_configs === 'object');
    const canonical = record.llm_provider_configs as Record<string, unknown>;
    assert.deepEqual(canonical.openai, { apiKey: 'sk-a', baseUrl: 'https://proxy/v1' });
});

test('getAiProviderFromConfig: picks stored provider if valid, else default', () => {
    assert.equal(getAiProviderFromConfig({ ai_provider: 'anthropic' }), 'anthropic');
    assert.equal(getAiProviderFromConfig({ ai_provider: 'nonsense' }), DEFAULT_LLM_PROVIDER);
    assert.equal(getAiProviderFromConfig({}), DEFAULT_LLM_PROVIDER);
});
