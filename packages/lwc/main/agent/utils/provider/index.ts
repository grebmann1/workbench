import { normalizeLlmProvider, type LlmProvider } from 'shared/llm';
import type {
    ProviderInstance,
    ProviderReasoningConfig,
    ProviderRuntime,
    ResolveModelArgs,
    ResolveOptionsArgs,
} from './types';
import { isAnthropicBedrockGateway } from './anthropic/bedrock';
import { anthropicRuntime } from './anthropic/runtime';
import { openaiRuntime } from './openai/runtime';
import { geminiRuntime } from './gemini/runtime';
import { grokRuntime } from './grok/runtime';
import { mistralRuntime } from './mistral/runtime';
import { workbenchRuntime } from './workbench/runtime';
import { internalRuntime } from './internal/runtime';

export type { ProviderInstance, ProviderReasoningConfig } from './types';

const PROVIDER_RUNTIMES: Record<LlmProvider, ProviderRuntime> = {
    openai: openaiRuntime,
    anthropic: anthropicRuntime,
    gemini: geminiRuntime,
    grok: grokRuntime,
    mistral: mistralRuntime,
    workbench: workbenchRuntime,
};

/**
 * Runtime that owns instance creation + model resolution for the given request.
 *
 * Precedence mirrors the original monolithic router exactly:
 *   1. Anthropic + baseUrl ending in `/bedrock` → anthropic runtime (bedrock path).
 *   2. isInternal + gemini → gemini runtime (native Google SDK, internal mode).
 *   3. isInternal → internal runtime (OpenAI SDK routed to `/responses`).
 *   4. Otherwise → the provider's native runtime.
 */
function selectInstanceRuntime({
    provider,
    baseUrl,
    isInternal,
}: {
    provider: LlmProvider;
    baseUrl?: string;
    isInternal?: boolean;
}): ProviderRuntime {
    if (isAnthropicBedrockGateway(provider, baseUrl)) {
        return anthropicRuntime;
    }
    if (isInternal && provider === 'gemini') {
        return geminiRuntime;
    }
    if (isInternal) {
        return internalRuntime;
    }
    return PROVIDER_RUNTIMES[provider];
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
    const runtime = selectInstanceRuntime({
        provider: normalizedProvider,
        baseUrl,
        isInternal,
    });
    return runtime.createInstance({ apiKey, baseUrl, isInternal });
}

export function resolveProviderModelInstance(
    providerInstance: ProviderInstance,
    {
        provider,
        modelId,
        isInternal = false,
        useResponsesApi = false,
    }: ResolveModelArgs & { provider: unknown }
) {
    const normalizedProvider = normalizeLlmProvider(provider);
    // Note: runtime selection here doesn't re-check baseUrl, since the caller already
    // used it to build `providerInstance`. We only need provider + isInternal to pick
    // the right call shape (.chat() vs direct call vs .responses()).
    const runtime = selectInstanceRuntime({
        provider: normalizedProvider,
        isInternal,
    });
    return runtime.resolveModel(providerInstance, { modelId, isInternal, useResponsesApi });
}

export function supportsReasoningProvider(provider: unknown) {
    return PROVIDER_RUNTIMES[normalizeLlmProvider(provider)].supportsReasoning();
}

export function resolveProviderOptions({
    provider,
    reasoningConfig,
    isInternal = false,
}: ResolveOptionsArgs & { provider: unknown }) {
    // Dispatch by logical provider only — options shape is an attribute of the
    // target provider's SDK, not the transport. (Internal gateway uses the OpenAI
    // SDK, but only openai models flow through the gateway today, so the openai
    // runtime's options shape is what the gateway actually receives.)
    const runtime = PROVIDER_RUNTIMES[normalizeLlmProvider(provider)];
    return runtime.resolveOptions({ reasoningConfig, isInternal });
}
