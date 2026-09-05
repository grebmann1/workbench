import type { Application, NextFunction, Request, Response } from 'express';

type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'mistral' | 'grok';
type LlmModelOption = {
    label: string;
    value: string;
    provider: LlmProvider;
};
type LlmProviderConfig = {
    apiKey: string | null;
    baseUrl: string;
};
type LlmProviderConfigMap = Record<LlmProvider, LlmProviderConfig>;
type LlmProviderCatalog = {
    provider: LlmProvider;
    status: 'ok' | 'missing_key' | 'invalid_config' | 'upstream_error' | 'unsupported_provider';
    models: LlmModelOption[];
    defaultModel: string | null;
    error?: string | null;
};

const DEFAULT_LLM_PROVIDER: LlmProvider = 'openai';
const LLM_PROVIDERS: LlmProvider[] = ['openai', 'anthropic', 'gemini', 'mistral', 'grok'];
const DEFAULT_PROVIDER_BASE_URLS: Record<LlmProvider, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    mistral: 'https://api.mistral.ai/v1',
    grok: 'https://api.x.ai/v1',
};
const ANTHROPIC_API_VERSION = '2023-06-01';
const NON_CHAT_MODEL_PATTERN =
    /embedding|whisper|tts|dall-e|image|moderation|realtime|transcribe|computer-use/i;
const DATED_MODEL_SUFFIX_PATTERN = /-\d{8}$/;
const NATIVE_PROVIDER_DOMAINS: Partial<Record<LlmProvider, string>> = {
    anthropic: 'api.anthropic.com',
    gemini: 'generativelanguage.googleapis.com',
    grok: 'api.x.ai',
    mistral: 'api.mistral.ai',
};
const OPENAI_MODEL_OPTIONS: LlmModelOption[] = [
    { label: 'gpt-5-mini', value: 'gpt-5-mini', provider: 'openai' },
    { label: 'gpt-5', value: 'gpt-5-2025-08-07', provider: 'openai' },
    { label: 'gpt-5-codex', value: 'gpt-5-codex', provider: 'openai' },
    { label: 'gpt-5.3-codex', value: 'gpt-5.3-codex', provider: 'openai' },
    { label: 'gpt-5-nano', value: 'gpt-5-nano-2025-08-07', provider: 'openai' },
    { label: 'gpt-5.4', value: 'gpt-5.4', provider: 'openai' },
    { label: 'gpt-5.4-mini', value: 'gpt-5.4-mini', provider: 'openai' },
    { label: 'gpt-5.4-nano', value: 'gpt-5.4-nano', provider: 'openai' },
];
const ANTHROPIC_MODEL_OPTIONS: LlmModelOption[] = [
    { label: 'claude-opus-4-6', value: 'claude-opus-4-6', provider: 'anthropic' },
    { label: 'claude-sonnet-4-6', value: 'claude-sonnet-4-6', provider: 'anthropic' },
    {
        label: 'claude-haiku-4-5-20251001',
        value: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
    },
];
const GEMINI_MODEL_OPTIONS: LlmModelOption[] = [
    { label: 'gemini-3-flash-preview', value: 'gemini-3-flash-preview', provider: 'gemini' },
    {
        label: 'gemini-3.1-flash-lite-preview',
        value: 'gemini-3.1-flash-lite-preview',
        provider: 'gemini',
    },
    {
        label: 'gemini-3.1-pro-preview',
        value: 'gemini-3.1-pro-preview',
        provider: 'gemini',
    },
];
const MISTRAL_MODEL_OPTIONS: LlmModelOption[] = [
    { label: 'mistral-small-2603', value: 'mistral-small-2603', provider: 'mistral' },
    { label: 'mistral-large-2512', value: 'mistral-large-2512', provider: 'mistral' },
    { label: 'devstral-2512', value: 'devstral-2512', provider: 'mistral' },
    { label: 'mistral-medium-2508', value: 'mistral-medium-2508', provider: 'mistral' },
];
const GROK_MODEL_OPTIONS: LlmModelOption[] = [
    {
        label: 'grok-4.20-0309-reasoning',
        value: 'grok-4.20-0309-reasoning',
        provider: 'grok',
    },
    {
        label: 'grok-4.20-multi-agent-0309',
        value: 'grok-4.20-multi-agent-0309',
        provider: 'grok',
    },
    {
        label: 'grok-4-1-fast-reasoning',
        value: 'grok-4-1-fast-reasoning',
        provider: 'grok',
    },
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeLlmProvider(value: unknown): LlmProvider {
    return typeof value === 'string' && LLM_PROVIDERS.includes(value as LlmProvider)
        ? (value as LlmProvider)
        : DEFAULT_LLM_PROVIDER;
}

function normalizeProviderConfigMap(configs: unknown): LlmProviderConfigMap {
    const record = isRecord(configs) ? configs : {};
    return LLM_PROVIDERS.reduce((normalized, provider) => {
        const current = isRecord(record[provider]) ? record[provider] : {};
        normalized[provider] = {
            apiKey: normalizeString(current.apiKey) || null,
            baseUrl: normalizeString(current.baseUrl) || DEFAULT_PROVIDER_BASE_URLS[provider],
        };
        return normalized;
    }, {} as LlmProviderConfigMap);
}

function getProviderModelOptions(provider: LlmProvider) {
    switch (provider) {
        case 'openai':
            return OPENAI_MODEL_OPTIONS;
        case 'anthropic':
            return ANTHROPIC_MODEL_OPTIONS;
        case 'gemini':
            return GEMINI_MODEL_OPTIONS;
        case 'mistral':
            return MISTRAL_MODEL_OPTIONS;
        case 'grok':
            return GROK_MODEL_OPTIONS;
        default:
            return [];
    }
}

function getDefaultModelForProvider(provider: LlmProvider) {
    return getProviderModelOptions(provider)[0]?.value || null;
}

function isInternalProviderBaseUrl(baseUrl: unknown) {
    return normalizeString(baseUrl).includes('eng-ai-model-gateway');
}

function isOpenAiCompatibleGateway(provider: LlmProvider, baseUrl: unknown) {
    if (isInternalProviderBaseUrl(baseUrl)) return true;
    const normalized = normalizeString(baseUrl).toLowerCase();
    if (!normalized) return false;
    const nativeDomain = NATIVE_PROVIDER_DOMAINS[provider];
    return !!nativeDomain && !normalized.includes(nativeDomain);
}

type LlmModelsRequestBody = {
    provider?: string;
    providerConfigs?: LlmProviderConfigMap;
};

function toBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
}

function overlayStaticMetadata(models: LlmModelOption[], provider: LlmProvider): LlmModelOption[] {
    const known = new Map(getProviderModelOptions(provider).map(model => [model.value, model]));
    return models.map(model => {
        const match = known.get(model.value);
        return match ? { ...model, label: match.label || model.label } : model;
    });
}

function inferProviderFromModelId(modelId: string): LlmProvider | null {
    const id = modelId.toLowerCase();
    if (!id) return null;
    if (id.includes('claude') || id.includes('anthropic')) return 'anthropic';
    if (id.includes('gemini')) return 'gemini';
    if (id.includes('grok')) return 'grok';
    if (/(^|[^a-z])(mistral|codestral|pixtral|ministral|devstral|magistral)/.test(id)) {
        return 'mistral';
    }
    if (
        id.startsWith('gpt-') ||
        id.startsWith('chatgpt') ||
        id.startsWith('openai') ||
        id.startsWith('ft:') ||
        id.includes('davinci') ||
        id.includes('babbage') ||
        /(?:^|[^a-z])(o1|o3|o4)(?:-|$)/.test(id)
    ) {
        return 'openai';
    }
    return null;
}

function refineLiveModels(models: LlmModelOption[], provider: LlmProvider): LlmModelOption[] {
    const chatModels = models.filter(model => {
        if (NON_CHAT_MODEL_PATTERN.test(model.value)) return false;
        const inferred = inferProviderFromModelId(model.value);
        return inferred === null || inferred === provider;
    });
    const ids = new Set(chatModels.map(model => model.value));
    const withoutDatedPins = chatModels.filter(model => {
        if (!DATED_MODEL_SUFFIX_PATTERN.test(model.value)) return true;
        const alias = model.value.replace(DATED_MODEL_SUFFIX_PATTERN, '');
        return !ids.has(alias);
    });
    return overlayStaticMetadata(withoutDatedPins, provider);
}

function parseOpenAiShapedCatalog(data: unknown, provider: LlmProvider): LlmModelOption[] {
    if (!isRecord(data)) return [];
    const rawList = Array.isArray(data.models)
        ? data.models
        : Array.isArray(data.data)
          ? data.data
          : [];
    const options: LlmModelOption[] = [];
    const seen = new Set<string>();
    for (const entry of rawList) {
        if (!isRecord(entry)) continue;
        const id =
            typeof entry.slug === 'string'
                ? entry.slug
                : typeof entry.id === 'string'
                  ? entry.id
                  : '';
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const label =
            typeof entry.display_name === 'string' && entry.display_name.trim()
                ? entry.display_name.trim()
                : id;
        options.push({ label, value: id, provider });
    }
    return options;
}

function parseGeminiCatalog(data: unknown, provider: LlmProvider): LlmModelOption[] {
    if (!isRecord(data) || !Array.isArray(data.models)) return [];
    const options: LlmModelOption[] = [];
    const seen = new Set<string>();
    for (const entry of data.models) {
        if (!isRecord(entry)) continue;
        const methods = Array.isArray(entry.supportedGenerationMethods)
            ? entry.supportedGenerationMethods
            : [];
        if (methods.length > 0 && !methods.includes('generateContent')) continue;
        const rawName =
            typeof entry.name === 'string'
                ? entry.name
                : typeof entry.id === 'string'
                  ? entry.id
                  : '';
        const id = rawName.replace(/^models\//, '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const label =
            typeof entry.displayName === 'string' && entry.displayName.trim()
                ? entry.displayName.trim()
                : id;
        options.push({ label, value: id, provider });
    }
    return options;
}

function resolveGeminiNativeModelsUrl(baseUrl: string): string {
    const root = toBaseUrl(baseUrl);
    if (root.endsWith('/v1beta')) return `${root}/models`;
    if (root.includes('generativelanguage.googleapis.com')) return `${root}/v1beta/models`;
    return `${root}/models`;
}

async function fetchJsonCatalog(
    url: string,
    headers: Record<string, string>,
    fetchImpl: typeof fetch
): Promise<unknown> {
    const response = await fetchImpl(url, { method: 'GET', headers });
    if (!response.ok) {
        throw new Error(`Model catalog request to ${url} failed with status ${response.status}.`);
    }
    return response.json();
}

async function fetchLiveModels(
    provider: LlmProvider,
    config: LlmProviderConfig,
    fetchImpl: typeof fetch
): Promise<LlmModelOption[]> {
    const apiKey = config.apiKey;
    if (!apiKey) return [];
    const root = toBaseUrl(config.baseUrl || DEFAULT_PROVIDER_BASE_URLS[provider]);
    const openAiCompatible =
        provider === 'openai' ||
        provider === 'mistral' ||
        isOpenAiCompatibleGateway(provider, config.baseUrl);

    if (provider === 'gemini' && !openAiCompatible) {
        const url = `${resolveGeminiNativeModelsUrl(config.baseUrl)}?key=${encodeURIComponent(apiKey)}`;
        const data = await fetchJsonCatalog(url, { Accept: 'application/json' }, fetchImpl);
        return refineLiveModels(parseGeminiCatalog(data, provider), provider);
    }
    if (provider === 'anthropic' && !openAiCompatible) {
        const data = await fetchJsonCatalog(
            `${root}/models`,
            {
                Accept: 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_API_VERSION,
            },
            fetchImpl
        );
        return refineLiveModels(parseOpenAiShapedCatalog(data, provider), provider);
    }
    if (provider === 'grok' && !openAiCompatible) {
        const data = await fetchJsonCatalog(
            `${root}/language-models`,
            {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
            },
            fetchImpl
        );
        return refineLiveModels(parseOpenAiShapedCatalog(data, provider), provider);
    }
    const data = await fetchJsonCatalog(
        `${root}/models`,
        {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
        },
        fetchImpl
    );
    let models = parseOpenAiShapedCatalog(data, provider);
    if (provider === 'gemini' && models.length === 0) {
        models = parseGeminiCatalog(data, provider);
    }
    return refineLiveModels(models, provider);
}

function getStaticProviderCatalog(
    provider: LlmProvider,
    config: LlmProviderConfig
): LlmProviderCatalog {
    if (isInternalProviderBaseUrl(config.baseUrl)) {
        return {
            provider,
            status: config.apiKey ? 'ok' : 'missing_key',
            models: [],
            defaultModel: null,
            error: config.apiKey ? null : `${provider} API key is required to load models.`,
        };
    }

    const models = getProviderModelOptions(provider);
    return {
        provider,
        status: !config.baseUrl ? 'invalid_config' : config.apiKey ? 'ok' : 'missing_key',
        models,
        defaultModel: getDefaultModelForProvider(provider),
        error: !config.baseUrl
            ? `${provider} base URL is required.`
            : config.apiKey
              ? null
              : `${provider} API key is required to load models.`,
    };
}

function fallbackCatalog(
    provider: LlmProvider,
    config: LlmProviderConfig,
    status: LlmProviderCatalog['status'],
    error: string | null
): LlmProviderCatalog {
    const isInternal = isInternalProviderBaseUrl(config.baseUrl);
    const models = isInternal ? [] : getProviderModelOptions(provider);
    return {
        provider,
        status,
        models,
        defaultModel: models[0]?.value || null,
        error,
    };
}

async function getProviderCatalog(
    provider: LlmProvider,
    config: LlmProviderConfig,
    fetchImpl: typeof fetch = fetch
): Promise<LlmProviderCatalog> {
    if (!config.baseUrl) {
        return {
            provider,
            status: 'invalid_config',
            models: [],
            defaultModel: null,
            error: `${provider} base URL is required.`,
        };
    }
    if (!config.apiKey) {
        return getStaticProviderCatalog(provider, config);
    }

    try {
        const liveModels = await fetchLiveModels(provider, config, fetchImpl);
        if (liveModels.length > 0) {
            return {
                provider,
                status: 'ok',
                models: liveModels,
                defaultModel: liveModels[0]?.value || null,
                error: null,
            };
        }
        return fallbackCatalog(provider, config, 'ok', null);
    } catch (error) {
        return fallbackCatalog(
            provider,
            config,
            'upstream_error',
            error instanceof Error ? error.message : `Unable to load ${provider} models.`
        );
    }
}

async function getOpenAiCatalog(
    config: LlmProviderConfigMap['openai'],
    fetchImpl: typeof fetch = fetch
): Promise<LlmProviderCatalog> {
    return getProviderCatalog('openai', config, fetchImpl);
}

async function buildCatalogs(
    providerConfigs: LlmProviderConfigMap,
    fetchImpl: typeof fetch = fetch
) {
    const catalogs = {} as Record<LlmProvider, LlmProviderCatalog>;
    await Promise.all(
        LLM_PROVIDERS.map(async provider => {
            catalogs[provider] = await getProviderCatalog(
                provider,
                providerConfigs[provider],
                fetchImpl
            );
        })
    );
    return catalogs;
}

export default function llmModels(app: Application, path = '/api/llm/models') {
    app.post(path, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const body = (req.body || {}) as LlmModelsRequestBody;
            const activeProvider = normalizeLlmProvider(body.provider || DEFAULT_LLM_PROVIDER);
            const providerConfigs = normalizeProviderConfigMap(body.providerConfigs);
            const catalogs = await buildCatalogs(providerConfigs);
            res.json({
                provider: activeProvider,
                catalog: catalogs[activeProvider],
                catalogs,
            });
        } catch (error) {
            next(error);
        }
    });
}

export const __testables = {
    buildCatalogs,
    getOpenAiCatalog,
    getProviderCatalog,
    getStaticProviderCatalog,
    normalizeProviderConfigMap,
};
