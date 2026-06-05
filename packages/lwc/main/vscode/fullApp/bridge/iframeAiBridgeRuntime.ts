/* eslint-disable import/no-unresolved */
import {
    createProviderInstance,
    getReasoningConfigFromSelection,
    persistRefreshedOAuthCredentials,
    resolveProviderModelInstance,
    resolveProviderOptions,
} from 'agent/utils';
import { jsonSchema, streamText, tool as createAiSdkTool } from 'ai';
import {
    getAiProviderFromConfig,
    getLlmProviderConfigCacheKeys,
    loadExtensionConfigFromCache,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';
import {
    normalizeLlmProvider,
    normalizeModelSelection,
    getDefaultModelForProvider,
    getProviderModelOptions,
    buildAvailableAgentModelOptions,
    hasUsableProviderCredentials,
    resolveAgentProviderBaseUrl,
    isOpenAiCompatibleGateway,
    type OAuthCredentials,
} from 'shared/llm';

import type {
    IframeAiBridgeChunk,
    IframeAiBridgeMessage,
    IframeAiBridgeModelConfig,
    IframeAiBridgeModelInfo,
    IframeAiBridgeToolSchema,
} from './iframeAiBridgeContract';

const DEFAULT_MAX_STEPS = 1;

type RuntimeConfig = {
    provider?: string;
    apiKey?: string;
    modelId?: string;
    baseUrl?: string;
    systemPrompt?: string;
    reasoning?: string;
    authMode?: 'apiKey' | 'oauth';
    oauth?: OAuthCredentials | null;
};

type FullRuntimeConfig = RuntimeConfig & {
    providerConfigs?: ReturnType<typeof resolveLlmProviderConfigMap>;
};

async function readRuntimeConfig(): Promise<FullRuntimeConfig> {
    try {
        const cachedConfig = await loadExtensionConfigFromCache(getLlmProviderConfigCacheKeys());
        const providerConfigs = resolveLlmProviderConfigMap(cachedConfig);
        const provider = normalizeLlmProvider(getAiProviderFromConfig(cachedConfig));
        const providerConfig = providerConfigs[provider] || providerConfigs.openai;
        return {
            provider,
            apiKey: providerConfig?.apiKey || undefined,
            baseUrl: providerConfig?.baseUrl || undefined,
            authMode: providerConfig?.authMode,
            oauth: providerConfig?.oauth ?? null,
            providerConfigs,
        };
    } catch {
        return {};
    }
}

function buildSystemPrompt(systemPrompt: string | undefined): string {
    return (
        systemPrompt?.trim() ||
        'You are a helpful AI assistant operating inside a Salesforce development workbench.'
    );
}

async function* streamCompletionViaProvider(
    messages: IframeAiBridgeMessage[],
    modelConfig: IframeAiBridgeModelConfig,
    signal: AbortSignal
): AsyncGenerator<IframeAiBridgeChunk> {
    const storedConfig = await readRuntimeConfig();

    const provider = normalizeLlmProvider(
        String(modelConfig.provider || storedConfig.provider || 'openai')
    );
    const apiKey = String(modelConfig.apiKey || storedConfig.apiKey || '').trim();
    const rawBaseUrl = String(modelConfig.baseUrl || storedConfig.baseUrl || '').trim();
    const baseUrl = resolveAgentProviderBaseUrl(provider, rawBaseUrl) || undefined;
    const selectedModel = normalizeModelSelection(
        String(modelConfig.modelId || storedConfig.modelId || ''),
        getProviderModelOptions(provider),
        getDefaultModelForProvider(provider) || 'gpt-4o'
    );
    const reasoning = String(modelConfig.reasoning || storedConfig.reasoning || 'none');
    const authMode = storedConfig.authMode;
    const oauth = storedConfig.oauth ?? null;

    if (
        !hasUsableProviderCredentials({
            apiKey: apiKey || null,
            baseUrl: baseUrl ?? '',
            authMode,
            oauth,
        })
    ) {
        yield {
            type: 'error',
            code: 'ENOCONFIG',
            message:
                'AI bridge runtime is not configured. Set an API key or sign in to enable AI completions.',
        };
        yield { type: 'done' };
        return;
    }

    const isInternal = isOpenAiCompatibleGateway(provider, baseUrl);
    const reasoningConfig = getReasoningConfigFromSelection(reasoning);
    const providerInstance = createProviderInstance({
        provider,
        apiKey,
        baseUrl,
        isInternal,
        authMode,
        oauth,
        onTokenRefresh:
            authMode === 'oauth'
                ? credentials => {
                      persistRefreshedOAuthCredentials(provider, credentials).catch(() => {});
                  }
                : undefined,
    });
    const systemPrompt = buildSystemPrompt(
        String(modelConfig.systemPrompt || storedConfig.systemPrompt || '')
    );

    // Convert bridge tool schemas to AI SDK tool definitions (no execute — tool calls forwarded back to workbench)
    const rawTools = Array.isArray(modelConfig.tools)
        ? (modelConfig.tools as IframeAiBridgeToolSchema[])
        : [];
    const tools =
        rawTools.length > 0
            ? Object.fromEntries(
                  rawTools
                      .filter(t => !!t?.name)
                      .map(t => [
                          t.name,
                          createAiSdkTool({
                              description: t.description || '',
                              inputSchema: jsonSchema(
                                  (t.parameters && typeof t.parameters === 'object'
                                      ? t.parameters
                                      : {
                                            type: 'object',
                                            properties: {},
                                            additionalProperties: false,
                                        }) as Parameters<typeof jsonSchema>[0]
                              ),
                          }),
                      ])
              )
            : undefined;

    const result = streamText({
        model: resolveProviderModelInstance(providerInstance, {
            provider,
            modelId: selectedModel,
            isInternal,
        }),
        system: systemPrompt,
        messages: messages as Parameters<typeof streamText>[0]['messages'],
        tools,
        maxSteps: DEFAULT_MAX_STEPS,
        maxRetries: 0,
        abortSignal: signal,
        providerOptions: resolveProviderOptions({
            provider,
            reasoningConfig,
            isInternal,
        }),
    });

    try {
        for await (const part of result.fullStream) {
            if (signal.aborted) {
                yield { type: 'done' };
                return;
            }

            switch (part?.type) {
                case 'text-delta':
                    yield { type: 'text_delta', text: part.text || '' };
                    break;
                case 'reasoning-delta':
                    yield { type: 'reasoning_delta', text: part.text || '' };
                    break;
                case 'tool-call':
                    yield {
                        type: 'tool_call',
                        toolCallId: part.toolCallId,
                        toolName: part.toolName,
                        args: part.input ?? part.args ?? {},
                    };
                    break;
                case 'error':
                    yield {
                        type: 'error',
                        code: 'EAI',
                        message: String(part.error || 'Unknown AI error'),
                    };
                    yield { type: 'done' };
                    return;
                default:
                    break;
            }
        }

        // Yield the full AI SDK response messages so the VSCode agent can use them verbatim
        // for the next round's conversation history. This preserves provider-specific metadata
        // such as Gemini's thought_signature on reasoning parts, enabling correct multi-turn
        // tool use with thinking models without disabling the thinking feature.
        try {
            const response = await result.response;
            if (Array.isArray(response?.messages) && response.messages.length > 0) {
                yield { type: 'complete_messages', messages: response.messages };
            }
        } catch {
            // response metadata is best-effort — swallow errors
        }

        yield { type: 'done' };
    } catch (error) {
        if (signal.aborted) {
            yield { type: 'done' };
            return;
        }
        yield {
            type: 'error',
            code: 'EAI',
            message:
                error instanceof Error ? error.message : String(error ?? 'AI streaming failed'),
        };
        yield { type: 'done' };
    }
}

async function* buildConfigStream(): AsyncGenerator<IframeAiBridgeChunk> {
    const storedConfig = await readRuntimeConfig();
    const provider = normalizeLlmProvider(storedConfig.provider || 'openai');
    const providerConfigs = storedConfig.providerConfigs ?? {};
    const defaultModel = getDefaultModelForProvider(provider);

    const allModels = buildAvailableAgentModelOptions({ providerConfigs });
    const models: IframeAiBridgeModelInfo[] =
        allModels.length > 0
            ? allModels.map(m => ({
                  id: m.value,
                  label: m.label,
                  provider: m.provider,
                  isDefault: m.value === defaultModel,
              }))
            : getProviderModelOptions(provider).map(m => ({
                  id: m.value,
                  label: m.label,
                  provider,
                  isDefault: m.value === defaultModel,
              }));

    const isConfigured = hasUsableProviderCredentials({
        apiKey: storedConfig.apiKey ?? null,
        baseUrl: storedConfig.baseUrl ?? '',
        authMode: storedConfig.authMode,
        oauth: storedConfig.oauth ?? null,
    });
    yield { type: 'ai_config', provider, models, isConfigured };
    yield { type: 'done' };
}

export function createIframeAiBridgeRuntime() {
    return {
        streamComplete({
            messages,
            modelConfig,
        }: {
            messages: IframeAiBridgeMessage[];
            modelConfig: IframeAiBridgeModelConfig;
        }): AsyncGenerator<IframeAiBridgeChunk> {
            const abortController = new AbortController();
            const gen = streamCompletionViaProvider(messages, modelConfig, abortController.signal);
            return {
                [Symbol.asyncIterator]() {
                    return this;
                },
                async next() {
                    return gen.next();
                },
                async return(value?: unknown) {
                    abortController.abort();
                    return gen.return?.(value) ?? { value: undefined as unknown, done: true };
                },
                async throw(error?: unknown) {
                    abortController.abort();
                    return gen.throw?.(error) ?? { value: undefined as unknown, done: true };
                },
            };
        },
        getConfig(): AsyncGenerator<IframeAiBridgeChunk> {
            return buildConfigStream();
        },
    };
}
