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
    inferProviderFromModelId,
    fetchCodexModels,
    fetchXaiModels,
    fetchSubscriptionModels,
    fetchApiKeyProviderModels,
    refineLiveModelOptions,
    toNonEmptyProviderCatalogs,
    resolveCodexClientVersion,
    CODEX_MODELS_CLIENT_VERSION,
    hasUsableProviderCredentials,
    normalizeOAuthCredentials,
    resolveAgentProviderBaseUrl,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_PROVIDER_BASE_URLS,
    INTERNAL_MODEL_OPTIONS,
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

test('normalizeProviderConfig: preserves useResponsesApi, authMode and oauth', () => {
    const config = normalizeProviderConfig('openai', {
        apiKey: '',
        baseUrl: '',
        useResponsesApi: true,
        authMode: 'oauth',
        oauth: {
            access: 'tok',
            refresh: 'ref',
            expires: 123,
            accountId: 'acct',
            tokenEndpoint: 'https://auth.x.ai/oauth2/token',
        },
    });
    assert.equal(config.apiKey, null);
    assert.equal(config.useResponsesApi, true);
    assert.equal(config.authMode, 'oauth');
    assert.equal(config.oauth?.access, 'tok');
    assert.equal(config.oauth?.refresh, 'ref');
    assert.equal(config.oauth?.expires, 123);
    assert.equal(config.oauth?.accountId, 'acct');
    assert.equal(config.oauth?.tokenEndpoint, 'https://auth.x.ai/oauth2/token');
});

test('normalizeProviderConfig: drops invalid authMode and access-less oauth', () => {
    const config = normalizeProviderConfig('openai', {
        apiKey: 'sk',
        baseUrl: 'https://x/v1',
        authMode: 'bogus',
        oauth: { refresh: 'ref', expires: 1 },
    });
    assert.equal(config.authMode, undefined);
    assert.equal(config.oauth, undefined);
});

test('normalizeProviderConfigMap: is idempotent on oauth credentials', () => {
    const input = {
        openai: {
            apiKey: null,
            baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
            authMode: 'oauth' as const,
            oauth: { access: 'a', refresh: 'b', expires: 999, accountId: 'acct' },
        },
    };
    // Normalizing an already-normalized map must not drop the oauth blob. The
    // full save→load round-trip through buildProviderConfigCacheRecord /
    // resolveLlmProviderConfigMap is covered in cacheManager.test.ts.
    const twice = normalizeProviderConfigMap(normalizeProviderConfigMap(input));
    assert.equal(twice.openai.authMode, 'oauth');
    assert.equal(twice.openai.oauth?.access, 'a');
    assert.equal(twice.openai.oauth?.accountId, 'acct');
});

test('normalizeOAuthCredentials: requires an access token', () => {
    assert.equal(normalizeOAuthCredentials({ refresh: 'r', expires: 1 }), null);
    assert.equal(normalizeOAuthCredentials(null), null);
    const ok = normalizeOAuthCredentials({ access: '  tok  ', refresh: 'r', expires: 5 });
    assert.equal(ok?.access, 'tok');
    assert.equal(ok?.tokenType, undefined);
});

test('hasUsableProviderCredentials: oauth mode needs an access token, apiKey mode needs a key', () => {
    assert.equal(hasUsableProviderCredentials(undefined), false);
    assert.equal(hasUsableProviderCredentials({ apiKey: 'sk', baseUrl: 'x' }), true);
    assert.equal(
        hasUsableProviderCredentials({ apiKey: null, baseUrl: 'x', authMode: 'oauth' }),
        false
    );
    assert.equal(
        hasUsableProviderCredentials({
            apiKey: null,
            baseUrl: 'x',
            authMode: 'oauth',
            oauth: { access: 'tok', refresh: 'r', expires: 1 },
        }),
        true
    );
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
    assert.equal(
        isInternalProviderBaseUrl(
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock'
        ),
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

test('buildAvailableAgentModelOptions: internal Anthropic config surfaces Bedrock models', () => {
    const configs = createDefaultProviderConfigMap();
    configs.anthropic = {
        apiKey: 'sk-b',
        baseUrl:
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock',
    };
    const options = buildAvailableAgentModelOptions({ providerConfigs: configs });
    const anthropicInternalModels = INTERNAL_MODEL_OPTIONS.filter(
        model => model.provider === 'anthropic'
    );

    assert.ok(anthropicInternalModels.length > 0);
    assert.equal(options.length, anthropicInternalModels.length);
    for (const option of options) {
        assert.ok(option.value.startsWith('us.anthropic.'));
    }
});

test('buildAvailableAgentModelOptions: internal Gemini config uses Gemini internal models', () => {
    const configs = createDefaultProviderConfigMap();
    configs.gemini = {
        apiKey: 'sk-g',
        baseUrl:
            'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1beta',
    };
    const geminiInternalModels = INTERNAL_MODEL_OPTIONS.filter(
        model => model.provider === 'gemini'
    );
    const options = buildAvailableAgentModelOptions({ providerConfigs: configs });

    assert.ok(geminiInternalModels.length > 0);
    assert.deepEqual(
        options.map(option => option.value),
        geminiInternalModels.map(model => model.value)
    );
    assert.ok(options.every(option => option.provider === 'gemini'));
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

test('buildAvailableAgentModelOptions: Codex OAuth is empty without a catalog, surfaces customModel', () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
        authMode: 'oauth',
        oauth: { access: 'tok', refresh: 'r', expires: 1 },
    };
    // No hardcoded Codex models: with no live catalog and no manual model, the picker is empty.
    assert.deepEqual(buildAvailableAgentModelOptions({ providerConfigs: configs }), []);

    // The user-typed customModel is surfaced as a selectable option.
    configs.openai = { ...configs.openai, customModel: 'gpt-7-codex' };
    const withCustom = buildAvailableAgentModelOptions({ providerConfigs: configs });
    assert.deepEqual(
        withCustom.map(o => o.value),
        ['gpt-7-codex']
    );
    assert.equal(withCustom[0].provider, 'openai');
});

test('buildAvailableAgentModelOptions: Codex OAuth uses the live WHAM catalog when present', () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
        authMode: 'oauth',
        oauth: { access: 'tok', refresh: 'r', expires: 1 },
    };
    // For OAuth, the live WHAM list lands in the dedicated subscriptionModelsByProvider slot
    // (NOT availableModelsByProvider), so the picker should surface exactly that.
    const options = buildAvailableAgentModelOptions({
        providerConfigs: configs,
        subscriptionModelsByProvider: {
            openai: [{ label: 'gpt-5.9-codex', value: 'gpt-5.9-codex', provider: 'openai' }],
        },
    });
    assert.deepEqual(
        options.map(o => o.value),
        ['gpt-5.9-codex']
    );
});

test('buildAvailableAgentModelOptions: OAuth ignores the server catalog slot, reads only subscription', () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
        authMode: 'oauth',
        oauth: { access: 'tok', refresh: 'r', expires: 1 },
    };
    // A stale value in availableModelsByProvider.openai must NOT leak into an OAuth picker —
    // the two slots are isolated.
    const options = buildAvailableAgentModelOptions({
        providerConfigs: configs,
        availableModelsByProvider: {
            openai: [{ label: 'stale', value: 'stale', provider: 'openai' }],
        },
        subscriptionModelsByProvider: {
            openai: [{ label: 'gpt-live', value: 'gpt-live', provider: 'openai' }],
        },
    });
    assert.deepEqual(
        options.map(o => o.value),
        ['gpt-live']
    );
});

test('buildAvailableAgentModelOptions: union of server (api-key) and subscription (oauth) providers', () => {
    const configs = createDefaultProviderConfigMap();
    configs.anthropic = { apiKey: 'sk-a', baseUrl: DEFAULT_PROVIDER_BASE_URLS.anthropic };
    configs.openai = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
        authMode: 'oauth',
        oauth: { access: 'tok', refresh: 'r', expires: 1 },
    };
    const options = buildAvailableAgentModelOptions({
        providerConfigs: configs,
        availableModelsByProvider: {
            anthropic: [{ label: 'claude-x', value: 'claude-x', provider: 'anthropic' }],
        },
        subscriptionModelsByProvider: {
            openai: [{ label: 'gpt-live', value: 'gpt-live', provider: 'openai' }],
        },
    });
    const values = options.map(o => o.value);
    assert.ok(values.includes('claude-x'));
    assert.ok(values.includes('gpt-live'));
});

test('buildAvailableAgentModelOptions: after disconnect (apiKey mode) a stale subscription slot is ignored', () => {
    // Post-disconnect openai is back in API-key mode. Even if the subscription slot still holds
    // the old Codex models (before the refetch clears it), the gate is off so they must NOT leak;
    // openai resolves to its API-key/server/static catalog instead — the user is never stuck on a
    // Codex model.
    const configs = createDefaultProviderConfigMap();
    configs.openai = {
        apiKey: 'sk-openai',
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
        authMode: 'apiKey',
    };
    // Use a sentinel that exists ONLY in the subscription slot (not in the static OpenAI catalog)
    // so we can prove the slot is ignored rather than coincidentally matching a static entry.
    const options = buildAvailableAgentModelOptions({
        providerConfigs: configs,
        subscriptionModelsByProvider: {
            openai: [{ label: 'codex-private-x', value: 'codex-private-x', provider: 'openai' }],
        },
    });
    const values = options.map(o => o.value);
    assert.ok(
        !values.includes('codex-private-x'),
        'stale subscription-only model must not leak after disconnect'
    );
    // Falls back to the static OpenAI catalog (no server models passed).
    assert.deepEqual(
        values,
        OPENAI_MODEL_OPTIONS.map(m => m.value)
    );
});

test('fetchCodexModels: maps WHAM models[].slug to options with auth headers', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const mockFetch = (async (url: string | URL, options?: RequestInit) => {
        calls.push({
            url: String(url),
            headers: (options?.headers ?? {}) as Record<string, string>,
        });
        return {
            ok: true,
            json: async () => ({
                models: [{ slug: 'gpt-5.1-codex' }, { slug: 'gpt-5.1-codex-mini' }],
            }),
        } as Response;
    }) as unknown as typeof fetch;
    const models = await fetchCodexModels(
        { access: 'tok', refresh: 'r', expires: 1, accountId: 'acct' },
        '0.137.0',
        mockFetch
    );
    assert.deepEqual(
        models.map(m => m.value),
        ['gpt-5.1-codex', 'gpt-5.1-codex-mini']
    );
    assert.equal(models[0].provider, 'openai');
    assert.match(calls[0].url, /backend-api\/wham\/models\?client_version=0\.137\.0/);
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');
    assert.equal(calls[0].headers['ChatGPT-Account-Id'], 'acct');
});

test('fetchCodexModels: falls back to data[].id and is empty without an access token', async () => {
    const mockFetch = (async () =>
        ({
            ok: true,
            json: async () => ({ data: [{ id: 'm1' }] }),
        }) as Response) as unknown as typeof fetch;
    const fromData = await fetchCodexModels(
        { access: 'tok', refresh: 'r', expires: 1 },
        '1.0.0',
        mockFetch
    );
    assert.deepEqual(
        fromData.map(m => m.value),
        ['m1']
    );
    assert.deepEqual(
        await fetchCodexModels({ access: '', refresh: '', expires: 0 }, '1.0.0', mockFetch),
        []
    );
});

test('fetchXaiModels: maps /v1/language-models models[].id with a bearer, dedupes', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const mockFetch = (async (url: string | URL, options?: RequestInit) => {
        calls.push({
            url: String(url),
            headers: (options?.headers ?? {}) as Record<string, string>,
        });
        return {
            ok: true,
            json: async () => ({
                models: [
                    { id: 'grok-4.1-fast-reasoning' },
                    { id: 'grok-code-fast-1' },
                    { id: 'grok-4.1-fast-reasoning' }, // duplicate id is dropped
                ],
            }),
        } as Response;
    }) as unknown as typeof fetch;
    const models = await fetchXaiModels(
        { access: 'xtok', refresh: 'r', expires: 1 },
        DEFAULT_PROVIDER_BASE_URLS.grok,
        mockFetch
    );
    assert.deepEqual(
        models.map(m => m.value),
        ['grok-4.1-fast-reasoning', 'grok-code-fast-1']
    );
    assert.equal(models[0].provider, 'grok');
    assert.match(calls[0].url, /api\.x\.ai\/v1\/language-models$/);
    assert.equal(calls[0].headers.Authorization, 'Bearer xtok');
});

test('fetchXaiModels: falls back to data[].id and is empty without an access token', async () => {
    const mockFetch = (async () =>
        ({
            ok: true,
            json: async () => ({ data: [{ id: 'grok-x' }] }),
        }) as Response) as unknown as typeof fetch;
    const fromData = await fetchXaiModels(
        { access: 'xtok', refresh: 'r', expires: 1 },
        DEFAULT_PROVIDER_BASE_URLS.grok,
        mockFetch
    );
    assert.deepEqual(
        fromData.map(m => m.value),
        ['grok-x']
    );
    assert.deepEqual(
        await fetchXaiModels({ access: '', refresh: '', expires: 0 }, '', mockFetch),
        []
    );
});

test('buildAvailableAgentModelOptions: xAI OAuth uses the live catalog, no hardcoded fallback', () => {
    const configs = createDefaultProviderConfigMap();
    configs.grok = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.grok,
        authMode: 'oauth',
        oauth: { access: 'xtok', refresh: 'r', expires: 1 },
    };
    // No live catalog → empty (NOT the static GROK_MODEL_OPTIONS), surfaces customModel instead.
    assert.deepEqual(buildAvailableAgentModelOptions({ providerConfigs: configs }), []);
    configs.grok = { ...configs.grok, customModel: 'grok-custom' };
    assert.deepEqual(
        buildAvailableAgentModelOptions({ providerConfigs: configs }).map(o => o.value),
        ['grok-custom']
    );

    // With a live catalog (in the dedicated subscription slot), the picker surfaces that list.
    const withCatalog = buildAvailableAgentModelOptions({
        providerConfigs: configs,
        subscriptionModelsByProvider: {
            grok: [{ label: 'grok-4.3-latest', value: 'grok-4.3-latest', provider: 'grok' }],
        },
    });
    assert.deepEqual(
        withCatalog.map(o => o.value),
        ['grok-4.3-latest', 'grok-custom']
    );
});

test('fetchSubscriptionModels: fetches Codex + xAI for connected OAuth providers', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
        authMode: 'oauth',
        oauth: { access: 'tok', refresh: 'r', expires: 1 },
    };
    configs.grok = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.grok,
        authMode: 'oauth',
        oauth: { access: 'xtok', refresh: 'r', expires: 1 },
    };
    const mockFetch = (async (url: string | URL) => {
        const u = String(url);
        if (/registry\.npmjs\.org/.test(u)) {
            return { ok: true, json: async () => ({ version: '0.140.0' }) } as Response;
        }
        if (/wham\/models/.test(u)) {
            return {
                ok: true,
                json: async () => ({ models: [{ slug: 'gpt-codex' }] }),
            } as Response;
        }
        if (/language-models/.test(u)) {
            return { ok: true, json: async () => ({ models: [{ id: 'grok-live' }] }) } as Response;
        }
        throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;

    const result = await fetchSubscriptionModels(configs, mockFetch);
    assert.deepEqual(
        result.openai.map(m => m.value),
        ['gpt-codex']
    );
    assert.deepEqual(
        result.grok.map(m => m.value),
        ['grok-live']
    );
});

test('fetchSubscriptionModels: degrades to [] when a provider fetch fails, never throws', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai,
        authMode: 'oauth',
        oauth: { access: 'tok', refresh: 'r', expires: 1 },
    };
    configs.grok = {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.grok,
        authMode: 'oauth',
        oauth: { access: 'xtok', refresh: 'r', expires: 1 },
    };
    const mockFetch = (async (url: string | URL) => {
        const u = String(url);
        if (/registry\.npmjs\.org/.test(u)) {
            return { ok: true, json: async () => ({ version: '0.140.0' }) } as Response;
        }
        if (/wham\/models/.test(u)) {
            return { ok: false, status: 500, json: async () => ({}) } as Response;
        }
        if (/language-models/.test(u)) {
            return { ok: true, json: async () => ({ models: [{ id: 'grok-live' }] }) } as Response;
        }
        throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;

    const result = await fetchSubscriptionModels(configs, mockFetch);
    assert.deepEqual(result.openai, []); // WHAM 500 → empty, no throw
    assert.deepEqual(
        result.grok.map(m => m.value),
        ['grok-live']
    );
});

test('fetchSubscriptionModels: no OAuth providers → empty, makes no fetch calls', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = { apiKey: 'sk-a', baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai };
    let calls = 0;
    const mockFetch = (async () => {
        calls += 1;
        return { ok: true, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    const result = await fetchSubscriptionModels(configs, mockFetch);
    assert.deepEqual(result, { openai: [], grok: [] });
    assert.equal(calls, 0);
});

test('resolveCodexClientVersion: uses latest npm version, falls back to the pinned default', async () => {
    const ok = (async (url: string | URL) => {
        assert.match(String(url), /registry\.npmjs\.org\/@openai\/codex\/latest/);
        return { ok: true, json: async () => ({ version: '0.140.0' }) } as Response;
    }) as unknown as typeof fetch;
    assert.equal(await resolveCodexClientVersion(ok), '0.140.0');

    const offline = (async () => {
        throw new Error('offline');
    }) as unknown as typeof fetch;
    assert.equal(await resolveCodexClientVersion(offline), CODEX_MODELS_CLIENT_VERSION);
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

test('refineLiveModelOptions: drops non-chat ids and dated pins when an alias exists', () => {
    const refined = refineLiveModelOptions(
        [
            { label: 'gpt-5.4', value: 'gpt-5.4', provider: 'openai' },
            { label: 'gpt-5.4-20260305', value: 'gpt-5.4-20260305', provider: 'openai' },
            { label: 'whisper-1', value: 'whisper-1', provider: 'openai' },
            {
                label: 'text-embedding-3-large',
                value: 'text-embedding-3-large',
                provider: 'openai',
            },
            { label: 'gpt-5-mini', value: 'gpt-5-mini', provider: 'openai' },
        ],
        'openai'
    );
    assert.deepEqual(
        refined.map(model => model.value),
        ['gpt-5.4', 'gpt-5-mini']
    );
    const mini = refined.find(model => model.value === 'gpt-5-mini');
    assert.equal(mini?.maxOutputTokens, 16000);
    assert.equal(mini?.label, 'gpt-5-mini');
});

test('refineLiveModelOptions: keeps a dated pin when no alias is present', () => {
    const refined = refineLiveModelOptions(
        [{ label: 'gpt-5.4-20260305', value: 'gpt-5.4-20260305', provider: 'openai' }],
        'openai'
    );
    assert.deepEqual(
        refined.map(model => model.value),
        ['gpt-5.4-20260305']
    );
    assert.equal(refined[0].maxOutputTokens, 16000);
});

test('inferProviderFromModelId: maps common gateway ids to a provider family', () => {
    assert.equal(inferProviderFromModelId('claude-haiku-4-5-20251001'), 'anthropic');
    assert.equal(inferProviderFromModelId('us.anthropic.claude-sonnet-4-6'), 'anthropic');
    assert.equal(inferProviderFromModelId('gemini-3-flash-preview'), 'gemini');
    assert.equal(inferProviderFromModelId('grok-4.6'), 'grok');
    assert.equal(inferProviderFromModelId('mistral-large-2512'), 'mistral');
    assert.equal(inferProviderFromModelId('gpt-5.6-sol'), 'openai');
    assert.equal(inferProviderFromModelId('gpt-5.5-bedrock'), 'openai');
    assert.equal(inferProviderFromModelId('custom-proxy-slug'), null);
});

test('refineLiveModelOptions: mixed gateway dump keeps only the requesting provider', () => {
    const dump = [
        { label: 'gpt-5.6-sol', value: 'gpt-5.6-sol', provider: 'openai' as const },
        {
            label: 'claude-haiku-4-5-20251001',
            value: 'claude-haiku-4-5-20251001',
            provider: 'openai' as const,
        },
        { label: 'gemini-2.0-flash', value: 'gemini-2.0-flash', provider: 'openai' as const },
        { label: 'grok-4.6', value: 'grok-4.6', provider: 'openai' as const },
        { label: 'my-gateway-custom', value: 'my-gateway-custom', provider: 'openai' as const },
    ];
    assert.deepEqual(
        refineLiveModelOptions(dump, 'openai').map(model => model.value),
        ['gpt-5.6-sol', 'my-gateway-custom']
    );
    assert.deepEqual(
        refineLiveModelOptions(dump, 'anthropic').map(model => model.value),
        ['claude-haiku-4-5-20251001', 'my-gateway-custom']
    );
});

test('toNonEmptyProviderCatalogs: omits empty providers', () => {
    const catalogs = toNonEmptyProviderCatalogs({
        openai: [{ label: 'live', value: 'live', provider: 'openai' }],
        anthropic: [],
    });
    assert.equal(catalogs.openai?.models[0].value, 'live');
    assert.equal(catalogs.openai?.status, 'ok');
    assert.equal(catalogs.anthropic, undefined);
});

function jsonResponse(body: unknown, ok = true): Response {
    return {
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
    } as Response;
}

test('fetchApiKeyProviderModels: maps OpenAI {data:[{id}]} and skips OAuth / workbench', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = { apiKey: 'sk-openai', baseUrl: DEFAULT_PROVIDER_BASE_URLS.openai };
    configs.anthropic = {
        apiKey: 'sk-ant',
        baseUrl: DEFAULT_PROVIDER_BASE_URLS.anthropic,
        authMode: 'oauth',
        oauth: { access: 'tok', refresh: 'r', expires: 1 },
    };
    configs.workbench = { apiKey: 'free', baseUrl: DEFAULT_PROVIDER_BASE_URLS.workbench };
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const mockFetch = (async (url: string | URL, options?: RequestInit) => {
        calls.push({
            url: String(url),
            headers: (options?.headers ?? {}) as Record<string, string>,
        });
        return jsonResponse({
            data: [{ id: 'gpt-5.4' }, { id: 'whisper-1' }, { id: 'gpt-5.4-20260305' }],
        });
    }) as unknown as typeof fetch;

    const result = await fetchApiKeyProviderModels(configs, mockFetch);
    assert.deepEqual(
        result.openai?.map(model => model.value),
        ['gpt-5.4']
    );
    assert.equal(result.anthropic, undefined);
    assert.equal(result.workbench, undefined);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.openai\.com\/v1\/models$/);
    assert.equal(calls[0].headers.Authorization, 'Bearer sk-openai');
});

test('fetchApiKeyProviderModels: Anthropic uses x-api-key and display_name', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.anthropic = { apiKey: 'sk-ant', baseUrl: DEFAULT_PROVIDER_BASE_URLS.anthropic };
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const mockFetch = (async (url: string | URL, options?: RequestInit) => {
        calls.push({
            url: String(url),
            headers: (options?.headers ?? {}) as Record<string, string>,
        });
        return jsonResponse({
            data: [{ id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' }],
        });
    }) as unknown as typeof fetch;

    const result = await fetchApiKeyProviderModels(configs, mockFetch);
    assert.equal(result.anthropic?.[0].value, 'claude-sonnet-4-6');
    assert.equal(result.anthropic?.[0].label, 'claude-sonnet-4-6');
    assert.match(calls[0].url, /api\.anthropic\.com\/v1\/models$/);
    assert.equal(calls[0].headers['x-api-key'], 'sk-ant');
    assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
});

test('fetchApiKeyProviderModels: Gemini native list strips models/ and generateContent-only', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.gemini = { apiKey: 'gem-key', baseUrl: DEFAULT_PROVIDER_BASE_URLS.gemini };
    const calls: string[] = [];
    const mockFetch = (async (url: string | URL) => {
        calls.push(String(url));
        return jsonResponse({
            models: [
                {
                    name: 'models/gemini-3-flash-preview',
                    displayName: 'Gemini 3 Flash',
                    supportedGenerationMethods: ['generateContent'],
                },
                {
                    name: 'models/embedding-001',
                    supportedGenerationMethods: ['embedContent'],
                },
            ],
        });
    }) as unknown as typeof fetch;

    const result = await fetchApiKeyProviderModels(configs, mockFetch);
    assert.deepEqual(
        result.gemini?.map(model => model.value),
        ['gemini-3-flash-preview']
    );
    assert.match(calls[0], /generativelanguage\.googleapis\.com\/v1beta\/models\?key=gem-key$/);
});

test('fetchApiKeyProviderModels: Grok API-key uses /language-models', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.grok = { apiKey: 'xai-key', baseUrl: DEFAULT_PROVIDER_BASE_URLS.grok };
    const calls: string[] = [];
    const mockFetch = (async (url: string | URL) => {
        calls.push(String(url));
        return jsonResponse({ models: [{ id: 'grok-4-1-fast-reasoning' }] });
    }) as unknown as typeof fetch;

    const result = await fetchApiKeyProviderModels(configs, mockFetch);
    assert.equal(result.grok?.[0].value, 'grok-4-1-fast-reasoning');
    assert.match(calls[0], /api\.x\.ai\/v1\/language-models$/);
});

test('fetchApiKeyProviderModels: failed fetch is omitted so the static seed remains', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.mistral = { apiKey: 'm-key', baseUrl: DEFAULT_PROVIDER_BASE_URLS.mistral };
    const mockFetch = (async () => jsonResponse({}, false)) as unknown as typeof fetch;
    const result = await fetchApiKeyProviderModels(configs, mockFetch);
    assert.deepEqual(result, {});
    const fallback = buildAvailableAgentModelOptions({ providerConfigs: configs });
    assert.ok(fallback.some(model => model.provider === 'mistral'));
});
