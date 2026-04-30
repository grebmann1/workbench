import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { createXai } from '@ai-sdk/xai';
import { DEFAULT_PROVIDER_BASE_URLS, normalizeLlmProvider } from 'shared/llm';

type ModelResolver = (modelId: string) => LanguageModelV3;
export type ProviderInstance = ModelResolver & {
    chat?: ModelResolver;
    responses?: ModelResolver;
    messages?: ModelResolver;
};
type FormattedRequest = {
    url: RequestInfo | URL;
    options?: RequestInit;
    transformResponse?: (response: Response) => Promise<Response>;
};
export type ProviderReasoningConfig = {
    reasoningEffort: string;
    reasoningSummary: string;
};

function normalizeBaseUrl(value: unknown) {
    return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function getModelFromRequestBody(body: unknown) {
    if (typeof body !== 'string') {
        return '';
    }
    try {
        const payload = JSON.parse(body);
        return typeof payload?.model === 'string' ? payload.model.trim() : '';
    } catch {
        return '';
    }
}

function toAnthropicBedrockBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
    if (typeof body !== 'string') {
        return body;
    }
    try {
        const payload = JSON.parse(body);
        if (!payload || typeof payload !== 'object') {
            return body;
        }
        const { model: _model, stream: _stream, ...bedrockPayload } = payload;
        return JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            ...bedrockPayload,
        });
    } catch {
        return body;
    }
}

function toSseEvent(event: string, data: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function toAnthropicStreamResponse(response: Response) {
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('text/event-stream')) {
        return response;
    }
    if (!contentType.includes('application/json')) {
        return response;
    }

    const payload = await response.json();
    const content = Array.isArray(payload?.content) ? payload.content : [];
    const usage = payload?.usage || {};
    const events: string[] = [
        toSseEvent('message_start', {
            type: 'message_start',
            message: {
                id: payload?.id ?? null,
                model: payload?.model ?? null,
                role: payload?.role ?? 'assistant',
                usage: {
                    input_tokens: usage.input_tokens ?? 0,
                    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
                    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
                },
            },
        }),
    ];

    content.forEach((part, index) => {
        if (part?.type === 'thinking') {
            events.push(
                toSseEvent('content_block_start', {
                    type: 'content_block_start',
                    index,
                    content_block: { type: 'thinking', thinking: '' },
                }),
                toSseEvent('content_block_delta', {
                    type: 'content_block_delta',
                    index,
                    delta: { type: 'thinking_delta', thinking: part.thinking || '' },
                })
            );
            if (part.signature) {
                events.push(
                    toSseEvent('content_block_delta', {
                        type: 'content_block_delta',
                        index,
                        delta: { type: 'signature_delta', signature: part.signature },
                    })
                );
            }
            events.push(toSseEvent('content_block_stop', { type: 'content_block_stop', index }));
            return;
        }

        if (part?.type === 'text') {
            events.push(
                toSseEvent('content_block_start', {
                    type: 'content_block_start',
                    index,
                    content_block: { type: 'text', text: '' },
                }),
                toSseEvent('content_block_delta', {
                    type: 'content_block_delta',
                    index,
                    delta: { type: 'text_delta', text: part.text || '' },
                }),
                toSseEvent('content_block_stop', { type: 'content_block_stop', index })
            );
        }
    });

    events.push(
        toSseEvent('message_delta', {
            type: 'message_delta',
            delta: {
                stop_reason: payload?.stop_reason ?? 'end_turn',
                stop_sequence: payload?.stop_sequence ?? null,
            },
            usage: {
                output_tokens: usage.output_tokens ?? 0,
            },
        }),
        toSseEvent('message_stop', { type: 'message_stop' })
    );

    const headers = new Headers(response.headers);
    headers.set('content-type', 'text/event-stream');
    return new Response(events.join(''), {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function createSanitizedFetch(
    formatRequest: (url: RequestInfo | URL, options?: RequestInit) => FormattedRequest = (
        url,
        options
    ) => ({
        url,
        options,
    })
) {
    return async (url, options) => {
        const formattedRequest = formatRequest(url, options);

        const response = await fetch(formattedRequest.url, {
            ...formattedRequest.options,
            credentials: 'omit',
            headers: {
                ...Object.fromEntries(
                    Object.entries(formattedRequest.options?.headers || {}).filter(
                        ([key]) => key !== 'cookie'
                    )
                ),
            },
        });
        return formattedRequest.transformResponse
            ? formattedRequest.transformResponse(response)
            : response;
    };
}

function toOpenAiResponsesRequest(url: RequestInfo | URL, options?: RequestInit) {
    const urlObj = new URL(url.toString());
    return { url: `${urlObj.origin}/responses`, options };
}

function toOpenAiChatCompletionsRequest(url: RequestInfo | URL, options?: RequestInit) {
    const urlObj = new URL(url.toString());
    return { url: `${urlObj.origin}/chat/completions`, options };
}

function toAnthropicBedrockRequest(url: RequestInfo | URL, options?: RequestInit) {
    const urlObj = new URL(url.toString());
    const nextOptions = {
        ...options,
        body: toAnthropicBedrockBody(options?.body),
    };
    if (urlObj.pathname.includes('/bedrock/model/')) {
        urlObj.pathname = urlObj.pathname.replace(/\/messages$/, '/invoke-with-response-stream');
        return {
            url: urlObj.toString(),
            options: nextOptions,
            transformResponse: toAnthropicStreamResponse,
        };
    }

    const bedrockPrefix = '/bedrock/';
    const bedrockIndex = urlObj.pathname.indexOf(bedrockPrefix);
    const model = getModelFromRequestBody(options?.body);
    if (bedrockIndex === -1 || !model) {
        return { url: urlObj.toString(), options: nextOptions };
    }

    const prefix = urlObj.pathname.slice(0, bedrockIndex);
    const endpoint = urlObj.pathname
        .slice(bedrockIndex + bedrockPrefix.length)
        .replace(/^messages$/, 'invoke-with-response-stream');
    urlObj.pathname = `${prefix}/bedrock/model/${model}/${endpoint}`;
    return {
        url: urlObj.toString(),
        options: nextOptions,
        transformResponse: toAnthropicStreamResponse,
    };
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

function resolveProviderRuntimeBaseUrl(
    provider: ReturnType<typeof normalizeLlmProvider>,
    baseUrl: unknown
) {
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

function isAnthropicBedrockGateway(provider: unknown, baseUrl: unknown) {
    return (
        normalizeLlmProvider(provider) === 'anthropic' &&
        normalizeBaseUrl(baseUrl).endsWith('/bedrock')
    );
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
    const settings = {
        apiKey: apiKey || '',
        baseURL: resolveProviderRuntimeBaseUrl(normalizedProvider, baseUrl),
        fetch: createSanitizedFetch(),
    };

    // For now it's mainly targeting internal Anthropic Bedrock gateway.
    if (isAnthropicBedrockGateway(normalizedProvider, baseUrl)) {
        return createAnthropic({
            ...settings,
            fetch: createSanitizedFetch(toAnthropicBedrockRequest),
        });
    }

    if (isInternal && normalizedProvider === 'gemini') {
        return createGoogleGenerativeAI({
            apiKey: apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('gemini', baseUrl),
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
            fetch: createSanitizedFetch(),
        });
    }

    // Internal /v1 gateway is OpenAI-compatible for the providers it proxies,
    // so use the OpenAI SDK and route requests to its /responses endpoint.
    if (isInternal) {
        return createOpenAI({
            apiKey: apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('openai', baseUrl),
            fetch: createSanitizedFetch(toOpenAiResponsesRequest),
        });
    }

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
        useResponsesApi = false,
    }: {
        provider: unknown;
        modelId: string;
        isInternal?: boolean;
        /** When true, use the OpenAI Responses API (.responses()) instead of
         *  chat completions (.chat()).  Required for gateways (e.g. LiteLLM)
         *  that route to OpenAI's /v1/responses endpoint, which expects tools
         *  with a flat `name` field rather than nested under `function.name`. */
        useResponsesApi?: boolean;
    }
) {
    const normalizedProvider = normalizeLlmProvider(provider);

    // In internal gateway mode, the provider instance is the OpenAI SDK regardless
    // of the logical provider, so route every call through .chat(modelId).
    /* if (isInternal) {
        return providerInstance.responses(modelId);
    } */

    if (normalizedProvider === 'openai') {
        return providerInstance(modelId);
    }

    if (normalizedProvider === 'mistral' && typeof providerInstance.chat === 'function') {
        return providerInstance.chat(modelId);
    }

    if (
        isInternal &&
        normalizedProvider === 'gemini' &&
        typeof providerInstance.chat === 'function'
    ) {
        return providerInstance.chat(modelId);
    }

    return providerInstance(modelId);
}

// Maps reasoning effort labels to Anthropic thinking token budgets.
const ANTHROPIC_THINKING_BUDGETS: Record<string, number> = {
    minimal: 1024,
    low: 4096,
    medium: 8000,
    high: 16000,
    xhigh: 32000,
};

// Maps reasoning effort labels to Google thinkingLevel values.
// 'xhigh' is not a valid Google level, so we fall back to 'high'.
const GEMINI_THINKING_LEVEL_MAP: Record<string, 'minimal' | 'low' | 'medium' | 'high'> = {
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'high',
};

export function supportsReasoningProvider(provider: unknown) {
    return normalizeLlmProvider(provider) === 'openai';
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
    const normalizedProvider = normalizeLlmProvider(provider);

    // Gateway mode (isInternal=true): all providers go through the OpenAI SDK,
    // so pass reasoning in OpenAI format and let the gateway (e.g. LiteLLM)
    // translate it for the downstream provider.
    /* if (isInternal) {
        return reasoningConfig != null ? { openai: reasoningConfig } : undefined;
    } */

    // Native Gemini SDK: map reasoning effort to thinkingLevel, or disable
    // thinking explicitly when effort is none (Gemini has thinking on by default).
    if (normalizedProvider === 'gemini') {
        const level =
            reasoningConfig?.reasoningEffort != null
                ? GEMINI_THINKING_LEVEL_MAP[reasoningConfig.reasoningEffort]
                : null;
        return level != null
            ? { google: { thinkingConfig: { thinkingLevel: level } } }
            : { google: { thinkingConfig: { thinkingBudget: 0 } } };
    }

    // Native Anthropic SDK: map reasoning effort to a thinking budget.
    if (normalizedProvider === 'anthropic' && reasoningConfig != null) {
        const budget = ANTHROPIC_THINKING_BUDGETS[reasoningConfig.reasoningEffort];
        if (budget != null) {
            return { anthropic: { thinking: { type: 'enabled', budgetTokens: budget } } };
        }
    }

    return !supportsReasoningProvider(provider) || reasoningConfig == null
        ? undefined
        : { openai: reasoningConfig };
}
