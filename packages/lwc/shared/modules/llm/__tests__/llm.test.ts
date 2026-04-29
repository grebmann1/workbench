import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    isLlmProvider,
    normalizeLlmProvider,
    getDefaultProviderConfig,
    createDefaultProviderConfigMap,
    normalizeProviderConfig,
    normalizeProviderConfigMap,
    getProviderModelOptions,
    getProviderLabel,
    getDefaultModelForProvider,
    normalizeModelSelection,
    isInternalProviderBaseUrl,
    isOpenAiCompatibleGateway,
    getMaxOutputTokensForModel,
    getProviderForModel,
    buildAvailableAgentModelOptions,
    resolveAgentProviderBaseUrl,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_PROVIDER_BASE_URLS,
    LLM_PROVIDERS,
    OPENAI_MODEL_OPTIONS,
    ANTHROPIC_MODEL_OPTIONS,
} from '../llm.ts';

test('isLlmProvider: accepts known providers, rejects anything else', () => {
    assert.equal(isLlmProvider('openai'), true);
    assert.equal(isLlmProvider('anthropic'), true);
    assert.equal(isLlmProvider('gemini'), true);
    assert.equal(isLlmProvider('mistral'), true);
    assert.equal(isLlmProvider('grok'), true);
    assert.equal(isLlmProvider('workbench'), true);
    assert.equal(isLlmProvider('bogus'), false);
    assert.equal(isLlmProvider(''), false);
    assert.equal(isLlmProvider(null), false);
    assert.equal(isLlmProvider(undefined), false);
    assert.equal(isLlmProvider(42), false);
});

test('normalizeLlmProvider: unknown input falls back to default', () => {
    assert.equal(normalizeLlmProvider('anthropic'), 'anthropic');
    assert.equal(normalizeLlmProvider('OPENAI'), DEFAULT_LLM_PROVIDER);
    assert.equal(normalizeLlmProvider(null), DEFAULT_LLM_PROVIDER);
    assert.equal(normalizeLlmProvider({}), DEFAULT_LLM_PROVIDER);
});

test('getDefaultProviderConfig: null apiKey and provider-specific baseUrl', () => {
    for (const provider of LLM_PROVIDERS) {
        const config = getDefaultProviderConfig(provider);
        assert.equal(config.apiKey, null);
        assert.equal(config.baseUrl, DEFAULT_PROVIDER_BASE_URLS[provider]);
    }
});

test('createDefaultProviderConfigMap: covers every provider with defaults', () => {
    const map = createDefaultProviderConfigMap();
    for (const provider of LLM_PROVIDERS) {
        assert.ok(map[provider], `missing entry for ${provider}`);
        assert.equal(map[provider].apiKey, null);
        assert.equal(map[provider].baseUrl, DEFAULT_PROVIDER_BASE_URLS[provider]);
    }
});

test('normalizeProviderConfig: trims strings, null apiKey on empty, fallback baseUrl', () => {
    const config = normalizeProviderConfig('openai', {
        apiKey: '  sk-test  ',
        baseUrl: '  https://example.com/v1  ',
    });
    assert.equal(config.apiKey, 'sk-test');
    assert.equal(config.baseUrl, 'https://example.com/v1');

    const empty = normalizeProviderConfig('anthropic', { apiKey: '', baseUrl: '' });
    assert.equal(empty.apiKey, null);
    assert.equal(empty.baseUrl, DEFAULT_PROVIDER_BASE_URLS.anthropic);
});

test('normalizeProviderConfig: non-object input yields defaults', () => {
    const config = normalizeProviderConfig('gemini', null);
    assert.equal(config.apiKey, null);
    assert.equal(config.baseUrl, DEFAULT_PROVIDER_BASE_URLS.gemini);
});

test('normalizeProviderConfigMap: fills missing providers with defaults, retains overrides', () => {
    const partial = { openai: { apiKey: 'sk-abc', baseUrl: 'https://proxy.test/v1' } };
    const map = normalizeProviderConfigMap(partial);
    assert.equal(map.openai.apiKey, 'sk-abc');
    assert.equal(map.openai.baseUrl, 'https://proxy.test/v1');
    assert.equal(map.anthropic.apiKey, null);
    assert.equal(map.anthropic.baseUrl, DEFAULT_PROVIDER_BASE_URLS.anthropic);
});

test('normalizeProviderConfigMap: garbage input → all defaults', () => {
    const map = normalizeProviderConfigMap('not-an-object');
    for (const provider of LLM_PROVIDERS) {
        assert.equal(map[provider].apiKey, null);
        assert.equal(map[provider].baseUrl, DEFAULT_PROVIDER_BASE_URLS[provider]);
    }
});

test('getProviderModelOptions: returns array for each provider', () => {
    for (const provider of LLM_PROVIDERS) {
        const options = getProviderModelOptions(provider);
        assert.ok(Array.isArray(options));
        assert.ok(options.length > 0);
        for (const option of options) {
            assert.equal(option.provider, provider);
        }
    }
});

test('getProviderLabel: known providers map to human labels, unknown falls back', () => {
    assert.equal(getProviderLabel('openai'), 'OpenAI');
    assert.equal(getProviderLabel('anthropic'), 'Anthropic');
    assert.equal(getProviderLabel('workbench'), 'Workbench (Free Tier)');
    assert.equal(getProviderLabel('bogus'), 'OpenAI');
});

test('getDefaultModelForProvider: returns first model value for provider', () => {
    assert.equal(getDefaultModelForProvider('openai'), OPENAI_MODEL_OPTIONS[0].value);
    assert.equal(getDefaultModelForProvider('anthropic'), ANTHROPIC_MODEL_OPTIONS[0].value);
});

test('normalizeModelSelection: exact match wins', () => {
    const picked = normalizeModelSelection('gpt-5-mini', OPENAI_MODEL_OPTIONS);
    assert.equal(picked, 'gpt-5-mini');
});

test('normalizeModelSelection: case-insensitive match on value', () => {
    const picked = normalizeModelSelection('GPT-5-MINI', OPENAI_MODEL_OPTIONS);
    assert.equal(picked, 'gpt-5-mini');
});

test('normalizeModelSelection: label match is accepted', () => {
    const picked = normalizeModelSelection('claude-opus-4-6', ANTHROPIC_MODEL_OPTIONS);
    assert.equal(picked, 'claude-opus-4-6');
});

test('normalizeModelSelection: alias prefix match resolves to full value', () => {
    const picked = normalizeModelSelection('gpt-5', [
        { label: 'gpt-5', value: 'gpt-5-2025-08-07', provider: 'openai' },
    ]);
    assert.equal(picked, 'gpt-5-2025-08-07');
});

test('normalizeModelSelection: empty input returns fallback or first option', () => {
    assert.equal(normalizeModelSelection('', OPENAI_MODEL_OPTIONS), OPENAI_MODEL_OPTIONS[0].value);
    assert.equal(normalizeModelSelection('', OPENAI_MODEL_OPTIONS, 'custom'), 'custom');
    assert.equal(normalizeModelSelection('', []), null);
});

test('normalizeModelSelection: unknown value falls back', () => {
    assert.equal(
        normalizeModelSelection('totally-unknown-model', OPENAI_MODEL_OPTIONS, 'fb'),
        'fb'
    );
});

test('normalizeModelSelection: non-array options safe', () => {
    // @ts-expect-error intentional bad input
    const picked = normalizeModelSelection('anything', null, 'fb');
    assert.equal(picked, 'fb');
});

test('isInternalProviderBaseUrl: detects eng-ai-model-gateway substring', () => {
    assert.equal(
        isInternalProviderBaseUrl('https://eng-ai-model-gateway.internal.salesforce.com/v1'),
        true
    );
    assert.equal(isInternalProviderBaseUrl('https://api.openai.com/v1'), false);
    assert.equal(isInternalProviderBaseUrl(''), false);
    assert.equal(isInternalProviderBaseUrl(null), false);
});

test('isOpenAiCompatibleGateway: internal gateway always true', () => {
    assert.equal(
        isOpenAiCompatibleGateway('anthropic', 'https://eng-ai-model-gateway.foo/v1'),
        true
    );
});

test('isOpenAiCompatibleGateway: native domain → false', () => {
    assert.equal(isOpenAiCompatibleGateway('anthropic', 'https://api.anthropic.com/v1'), false);
    assert.equal(
        isOpenAiCompatibleGateway('gemini', 'https://generativelanguage.googleapis.com/v1beta'),
        false
    );
    assert.equal(isOpenAiCompatibleGateway('grok', 'https://api.x.ai/v1'), false);
    assert.equal(isOpenAiCompatibleGateway('mistral', 'https://api.mistral.ai/v1'), false);
});

test('isOpenAiCompatibleGateway: non-native domain for tracked providers → true', () => {
    assert.equal(isOpenAiCompatibleGateway('anthropic', 'https://proxy.litellm/v1'), true);
    assert.equal(isOpenAiCompatibleGateway('gemini', 'https://proxy.example/openai/v1'), true);
});

test('isOpenAiCompatibleGateway: empty baseUrl → false', () => {
    assert.equal(isOpenAiCompatibleGateway('anthropic', ''), false);
});

test('isOpenAiCompatibleGateway: openai provider with arbitrary url → false (not tracked)', () => {
    assert.equal(isOpenAiCompatibleGateway('openai', 'https://api.openai.com/v1'), false);
    assert.equal(isOpenAiCompatibleGateway('openai', 'https://proxy.example/v1'), false);
});

test('getMaxOutputTokensForModel: known model returns configured limit', () => {
    assert.equal(getMaxOutputTokensForModel('gpt-5-mini'), 16000);
});

test('getMaxOutputTokensForModel: unknown model returns default 8192', () => {
    assert.equal(getMaxOutputTokensForModel('no-such-model'), 8192);
    assert.equal(getMaxOutputTokensForModel(''), 8192);
    assert.equal(getMaxOutputTokensForModel(null), 8192);
});

test('getProviderForModel: exact value match returns provider', () => {
    assert.equal(getProviderForModel('claude-opus-4-6'), 'anthropic');
    assert.equal(getProviderForModel('gpt-5-mini'), 'openai');
});

test('getProviderForModel: unknown model returns default provider', () => {
    assert.equal(getProviderForModel('unknown-thing'), DEFAULT_LLM_PROVIDER);
    assert.equal(getProviderForModel(''), DEFAULT_LLM_PROVIDER);
});

test('resolveAgentProviderBaseUrl: non-gemini passes through', () => {
    assert.equal(
        resolveAgentProviderBaseUrl('openai', 'https://api.openai.com/v1'),
        'https://api.openai.com/v1'
    );
    assert.equal(
        resolveAgentProviderBaseUrl('openai', 'https://api.openai.com/v1/'),
        'https://api.openai.com/v1'
    );
});

test('resolveAgentProviderBaseUrl: empty baseUrl uses provider default', () => {
    assert.equal(resolveAgentProviderBaseUrl('openai', ''), DEFAULT_PROVIDER_BASE_URLS.openai);
});

test('resolveAgentProviderBaseUrl: gemini /v1beta appends /openai', () => {
    assert.equal(
        resolveAgentProviderBaseUrl('gemini', 'https://generativelanguage.googleapis.com/v1beta'),
        'https://generativelanguage.googleapis.com/v1beta/openai'
    );
});

test('resolveAgentProviderBaseUrl: gemini bare google host appends /v1beta/openai', () => {
    assert.equal(
        resolveAgentProviderBaseUrl('gemini', 'https://generativelanguage.googleapis.com'),
        'https://generativelanguage.googleapis.com/v1beta/openai'
    );
});

test('resolveAgentProviderBaseUrl: gemini url already containing /openai is untouched', () => {
    assert.equal(
        resolveAgentProviderBaseUrl('gemini', 'https://proxy.example/openai/v1'),
        'https://proxy.example/openai/v1'
    );
});

test('buildAvailableAgentModelOptions: providers without apiKey are excluded', () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = { apiKey: 'sk-a', baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai };
    const options = buildAvailableAgentModelOptions({ providerConfigs: configs });
    assert.ok(options.length > 0);
    for (const option of options) {
        assert.equal(option.provider, 'openai');
    }
    // No provider label prefix when only one provider is configured.
    assert.ok(options.every(o => !o.label.includes(': ')));
});

test('buildAvailableAgentModelOptions: multiple providers prefix labels', () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = { apiKey: 'sk-a', baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai };
    configs.anthropic = { apiKey: 'sk-b', baseUrl: DEFAULT_PROVIDER_BASE_URLS.anthropic };
    const options = buildAvailableAgentModelOptions({ providerConfigs: configs });
    assert.ok(options.some(o => o.label.startsWith('OpenAI: ')));
    assert.ok(options.some(o => o.label.startsWith('Anthropic: ')));
});

test('buildAvailableAgentModelOptions: server-provided catalog overrides defaults', () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = { apiKey: 'sk-a', baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai };
    const serverModels = [
        { label: 'custom-model', value: 'custom-model', provider: 'openai' as const },
    ];
    const options = buildAvailableAgentModelOptions({
        providerConfigs: configs,
        availableModelsByProvider: { openai: serverModels },
    });
    assert.equal(options.length, 1);
    assert.equal(options[0].value, 'custom-model');
});

test('buildAvailableAgentModelOptions: accepts { models } catalog shape', () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = { apiKey: 'sk-a', baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai };
    const options = buildAvailableAgentModelOptions({
        providerConfigs: configs,
        availableModelsByProvider: {
            openai: {
                models: [{ label: 'wrapped', value: 'wrapped', provider: 'openai' }],
            },
        },
    });
    assert.equal(options.length, 1);
    assert.equal(options[0].value, 'wrapped');
});
