import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { DEFAULT_PROVIDER_BASE_URLS, normalizeLlmProvider } from 'shared/llm';

type ModelResolver = (modelId: string) => LanguageModelV3;
export type ProviderInstance = ModelResolver & {
    chat?: ModelResolver;
    responses?: ModelResolver;
    messages?: ModelResolver;
};
export type ProviderReasoningConfig = {
    reasoningEffort: string;
    reasoningSummary: string;
};

function normalizeBaseUrl(value: unknown) {
    return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function createSanitizedFetch() {
    return (url, options) =>
        fetch(url, {
            ...options,
            credentials: 'omit',
            headers: {
                ...Object.fromEntries(
                    Object.entries(options?.headers || {}).filter(([key]) => key !== 'cookie')
                ),
            },
        });
}

function resolveGoogleBaseUrl(baseUrl: unknown) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const effectiveBaseUrl = normalizedBaseUrl || DEFAULT_PROVIDER_BASE_URLS.gemini;
    const withoutOpenAiSuffix = effectiveBaseUrl.replace(/\/openai$/, '');

    if (/\/v\d+(beta)?$/.test(withoutOpenAiSuffix)) {
        return withoutOpenAiSuffix;
    }

    if (withoutOpenAiSuffix.includes('generativelanguage.googleapis.com')) {
        return `${withoutOpenAiSuffix}/v1beta`;
    }

    return withoutOpenAiSuffix;
}

function resolveProviderRuntimeBaseUrl(provider: ReturnType<typeof normalizeLlmProvider>, baseUrl: unknown) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (provider === 'gemini') {
        return resolveGoogleBaseUrl(normalizedBaseUrl);
    }
    const effectiveUrl = normalizedBaseUrl || DEFAULT_PROVIDER_BASE_URLS[provider];
    // Resolve relative URLs (e.g. /openai/v1) to absolute using the page origin
    if (effectiveUrl && effectiveUrl.startsWith('/') && typeof window !== 'undefined') {
        return `${window.location.origin}${effectiveUrl}`;
    }
    return effectiveUrl;
}

export function createProviderInstance({
    provider,
    apiKey,
    baseUrl,
    isInternal = false,
}: {
    provider: unknown;
    apiKey?: string;
    baseUrl?: string;
    isInternal?: boolean;
}): ProviderInstance {
    const normalizedProvider = normalizeLlmProvider(provider);

    // Internal gateway is OpenAI-compatible for every provider it proxies,
    // so always use the OpenAI SDK pointed at the gateway URL.
    if (isInternal) {
        return createOpenAI({
            apiKey: apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('openai', baseUrl),
            fetch: createSanitizedFetch(),
        });
    }

    const settings = {
        apiKey: apiKey || '',
        baseURL: resolveProviderRuntimeBaseUrl(normalizedProvider, baseUrl),
        fetch: createSanitizedFetch(),
    };

    switch (normalizedProvider) {
        case 'anthropic':
            return createAnthropic(settings);
        case 'gemini':
            return createGoogleGenerativeAI(settings);
        case 'grok':
            return createXai(settings);
        case 'workbench':
        case 'mistral':
        case 'openai':
        default:
            return createOpenAI(settings);
    }
}

export function resolveProviderModelInstance(
    providerInstance: ProviderInstance,
    {
        provider,
        modelId,
        isInternal = false,
    }: {
        provider: unknown;
        modelId: string;
        isInternal?: boolean;
    }
) {
    const normalizedProvider = normalizeLlmProvider(provider);

    // In internal gateway mode, the provider instance is the OpenAI SDK regardless
    // of the logical provider, so route every call through .chat(modelId).
    if (isInternal && typeof providerInstance.chat === 'function') {
        return providerInstance.chat(modelId);
    }

    if (normalizedProvider === 'openai') {
        return providerInstance(modelId);
    }

    if (normalizedProvider === 'mistral' && typeof providerInstance.chat === 'function') {
        return providerInstance.chat(modelId);
    }

    return providerInstance(modelId);
}

export function supportsReasoningProvider(provider: unknown, isInternal = false) {
    return normalizeLlmProvider(provider) === 'openai' && !isInternal;
}

export function resolveProviderOptions({
    provider,
    reasoningConfig,
    isInternal = false,
}: {
    provider: unknown;
    reasoningConfig?: ProviderReasoningConfig;
    isInternal?: boolean;
}) {
    return !supportsReasoningProvider(provider, isInternal) || reasoningConfig == null
        ? undefined
        : { openai: reasoningConfig };
}
