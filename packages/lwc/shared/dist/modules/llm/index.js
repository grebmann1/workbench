import { DEFAULT_LLM_PROVIDER, DEFAULT_PROVIDER_BASE_URLS, INTERNAL_OPENAI_MODEL_OPTIONS, LLM_PROVIDERS, LLM_PROVIDER_OPTIONS, OPENAI_MODEL_OPTIONS, PROVIDER_MODEL_OPTIONS, } from './constants';
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
    const record = config && typeof config === 'object' ? config : {};
    const apiKey = normalizeString(record.apiKey);
    const baseUrl = normalizeString(record.baseUrl);
    return {
        apiKey: apiKey || null,
        baseUrl: baseUrl || defaults.baseUrl,
    };
}
export function normalizeProviderConfigMap(configs) {
    const record = configs && typeof configs === 'object' ? configs : {};
    return LLM_PROVIDERS.reduce((normalizedConfigs, provider) => {
        normalizedConfigs[provider] = normalizeProviderConfig(provider, record[provider]);
        return normalizedConfigs;
    }, createDefaultProviderConfigMap());
}
export function getProviderOptions() {
    return LLM_PROVIDER_OPTIONS;
}
export function getProviderModelOptions(provider) {
    return PROVIDER_MODEL_OPTIONS[provider] || [];
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
export function resolveOpenAiCompatibleModels(isInternal = false) {
    return isInternal ? INTERNAL_OPENAI_MODEL_OPTIONS : OPENAI_MODEL_OPTIONS;
}
export async function fetchLlmModelsEndpoint({ provider, providerConfigs, }) {
    const response = await fetch('/api/llm/models', {
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
//# sourceMappingURL=index.js.map