import { DEFAULT_LLM_PROVIDER, DEFAULT_PROVIDER_BASE_URLS, INTERNAL_MODEL_OPTIONS, LLM_PROVIDERS, LLM_PROVIDER_OPTIONS, PROVIDER_MODEL_OPTIONS, } from './constants';
import { isRecord } from 'shared/utils';
function getInternalModelsForProvider(provider) {
    return INTERNAL_MODEL_OPTIONS.filter(model => model.provider === provider);
}
export * from './constants';
function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
export function isLlmProvider(value) {
    return typeof value === 'string' && LLM_PROVIDERS.includes(value);
}
export function normalizeLlmProvider(value) {
    return isLlmProvider(value) ? value : DEFAULT_LLM_PROVIDER;
}
export function getDefaultProviderConfig(provider) {
    return {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS[provider],
    };
}
export function createDefaultProviderConfigMap() {
    return LLM_PROVIDERS.reduce((configs, provider) => {
        configs[provider] = getDefaultProviderConfig(provider);
        return configs;
    }, {});
}
export function normalizeProviderConfig(provider, config) {
    const defaults = getDefaultProviderConfig(provider);
    const record = isRecord(config) ? config : {};
    const apiKey = normalizeString(record.apiKey);
    const baseUrl = normalizeString(record.baseUrl);
    return {
        apiKey: apiKey || null,
        baseUrl: baseUrl || defaults.baseUrl,
    };
}
export function normalizeProviderConfigMap(configs) {
    const record = isRecord(configs) ? configs : {};
    return LLM_PROVIDERS.reduce((normalizedConfigs, provider) => {
        normalizedConfigs[provider] = normalizeProviderConfig(provider, record[provider]);
        return normalizedConfigs;
    }, createDefaultProviderConfigMap());
}
export function getProviderModelOptions(provider) {
    return PROVIDER_MODEL_OPTIONS[provider] || [];
}
export function getProviderLabel(provider) {
    const normalized = normalizeLlmProvider(provider);
    return (LLM_PROVIDER_OPTIONS.find(option => option.value === normalized)?.label ||
        DEFAULT_LLM_PROVIDER);
}
export function getDefaultModelForProvider(provider) {
    return getProviderModelOptions(provider)[0]?.value || null;
}
export function normalizeModelSelection(model, options, fallbackValue) {
    const safeOptions = Array.isArray(options) ? options : [];
    const normalized = normalizeString(model);
    const fallback = fallbackValue ?? safeOptions[0]?.value ?? null;
    if (!normalized)
        return fallback;
    const lowered = normalized.toLowerCase();
    const exactValue = safeOptions.find(option => option.value === normalized);
    if (exactValue)
        return exactValue.value;
    const caseInsensitiveValue = safeOptions.find(option => option.value.toLowerCase() === lowered);
    if (caseInsensitiveValue)
        return caseInsensitiveValue.value;
    const labelMatch = safeOptions.find(option => option.label.toLowerCase() === lowered);
    if (labelMatch)
        return labelMatch.value;
    const aliasMatch = safeOptions.find(option => option.value.toLowerCase().startsWith(`${lowered}-`));
    if (aliasMatch)
        return aliasMatch.value;
    return fallback;
}
export function isInternalProviderBaseUrl(baseUrl) {
    return normalizeString(baseUrl).includes('eng-ai-model-gateway');
}
// Native API domain patterns for each non-OpenAI provider.
// When a provider is configured with a baseUrl that doesn't match its native
// domain, it's assumed to point at an OpenAI-compatible gateway (e.g. LiteLLM).
const NATIVE_PROVIDER_DOMAINS = {
    anthropic: 'api.anthropic.com',
    gemini: 'generativelanguage.googleapis.com',
    grok: 'api.x.ai',
    mistral: 'api.mistral.ai',
};
/**
 * Returns true when the provider is pointing at an OpenAI-compatible gateway
 * rather than its own native API.  This covers both the internal Salesforce
 * eng-ai-model-gateway and any external proxy (e.g. LiteLLM) that exposes an
 * OpenAI-compatible `/chat/completions` or `/responses` surface.
 */
export function isOpenAiCompatibleGateway(provider, baseUrl) {
    if (isInternalProviderBaseUrl(baseUrl))
        return true;
    const normalized = normalizeString(baseUrl).toLowerCase();
    if (!normalized)
        return false;
    const nativeDomain = NATIVE_PROVIDER_DOMAINS[normalizeLlmProvider(provider)];
    return !!nativeDomain && !normalized.includes(nativeDomain);
}
function getWorkbenchBaseUrl() {
    if (typeof process === 'undefined' ||
        !process ||
        typeof process.env !== 'object' ||
        typeof process.env.WORKBENCH_BASE_URL !== 'string') {
        return '';
    }
    return normalizeString(process.env.WORKBENCH_BASE_URL).replace(/\/+$/, '');
}
function resolveWorkbenchEndpoint(pathname) {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const baseUrl = getWorkbenchBaseUrl();
    if (!baseUrl) {
        throw new Error('fetchLlmModelsEndpoint: no WORKBENCH_BASE_URL configured');
    }
    return `${baseUrl}${normalizedPath}`;
}
function extractModels(availableModelsByProvider, provider) {
    const entry = availableModelsByProvider?.[provider];
    if (Array.isArray(entry)) {
        return entry;
    }
    return Array.isArray(entry?.models) ? entry.models : [];
}
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
export function getMaxOutputTokensForModel(model, options = [
    ...Object.values(PROVIDER_MODEL_OPTIONS).flat(),
    ...INTERNAL_MODEL_OPTIONS,
]) {
    const normalized = normalizeString(model);
    if (!normalized)
        return DEFAULT_MAX_OUTPUT_TOKENS;
    const match = options.find(o => o.value === normalized);
    return match?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
}
export function getProviderForModel(model, options = Object.values(PROVIDER_MODEL_OPTIONS).flat()) {
    const normalized = normalizeString(model);
    if (!normalized) {
        return DEFAULT_LLM_PROVIDER;
    }
    const lowered = normalized.toLowerCase();
    const exactValue = options.find(option => option.value === normalized);
    if (exactValue)
        return exactValue.provider;
    const caseInsensitiveValue = options.find(option => option.value.toLowerCase() === lowered);
    if (caseInsensitiveValue)
        return caseInsensitiveValue.provider;
    const labelMatch = options.find(option => option.label.toLowerCase() === lowered);
    if (labelMatch)
        return labelMatch.provider;
    const aliasMatch = options.find(option => option.value.toLowerCase().startsWith(`${lowered}-`));
    return aliasMatch?.provider || DEFAULT_LLM_PROVIDER;
}
export function buildAvailableAgentModelOptions({ availableModelsByProvider, providerConfigs, }) {
    const normalizedConfigs = normalizeProviderConfigMap(providerConfigs);
    const configuredProviders = LLM_PROVIDERS.filter(provider => !!normalizedConfigs[provider]?.apiKey);
    const shouldPrefixProviderLabel = configuredProviders.length > 1;
    return configuredProviders.flatMap(provider => {
        const config = normalizedConfigs[provider];
        const serverModels = extractModels(availableModelsByProvider, provider);
        const isProviderInternal = isInternalProviderBaseUrl(config.baseUrl);
        const models = serverModels.length > 0
            ? serverModels
            : isProviderInternal
                ? getInternalModelsForProvider(provider)
                : getProviderModelOptions(provider);
        return models.map(model => ({
            ...model,
            label: shouldPrefixProviderLabel
                ? `${getProviderLabel(provider)}: ${model.label}`
                : model.label,
        }));
    });
}
export function resolveAgentProviderBaseUrl(provider, baseUrl) {
    const normalizedProvider = normalizeLlmProvider(provider);
    const normalizedBaseUrl = normalizeString(baseUrl).replace(/\/+$/, '');
    const fallbackBaseUrl = DEFAULT_PROVIDER_BASE_URLS[normalizedProvider];
    const effectiveBaseUrl = normalizedBaseUrl || fallbackBaseUrl;
    if (normalizedProvider !== 'gemini') {
        return effectiveBaseUrl;
    }
    if (effectiveBaseUrl.includes('/openai')) {
        return effectiveBaseUrl;
    }
    if (effectiveBaseUrl.endsWith('/v1beta')) {
        return `${effectiveBaseUrl}/openai`;
    }
    if (effectiveBaseUrl.includes('generativelanguage.googleapis.com')) {
        return `${effectiveBaseUrl}/v1beta/openai`;
    }
    return effectiveBaseUrl;
}
export async function fetchLlmModelsEndpoint({ provider, providerConfigs, }) {
    const response = await fetch(resolveWorkbenchEndpoint('/api/llm/models'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            provider,
            providerConfigs: normalizeProviderConfigMap(providerConfigs),
        }),
    });
    if (!response.ok) {
        throw new Error(`Model catalog request failed with status ${response.status}.`);
    }
    return response.json();
}
//# sourceMappingURL=llm.js.map