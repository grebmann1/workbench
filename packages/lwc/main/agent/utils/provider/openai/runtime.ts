import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
    CreateInstanceArgs,
    ProviderInstance,
    ProviderRuntime,
    ResolveModelArgs,
    ResolveOptionsArgs,
} from '../types';
import { createSanitizedFetch } from '../shared/fetch';
import { resolveProviderRuntimeBaseUrl } from '../shared/urls';

export const openaiRuntime: ProviderRuntime = {
    createInstance({ apiKey, baseUrl }: CreateInstanceArgs): ProviderInstance {
        return createOpenAI({
            apiKey: apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('openai', baseUrl),
            fetch: createSanitizedFetch(),
        });
    },

    resolveModel(instance: ProviderInstance, { modelId }: ResolveModelArgs): LanguageModelV3 {
        return instance(modelId);
    },

    resolveOptions({ reasoningConfig }: ResolveOptionsArgs) {
        // Reasoning on the OpenAI /responses endpoint streams reasoning-deltas
        // incrementally while the model thinks, then flushes final text as a
        // tight burst once reasoning ends. That wire shape is fine, but it
        // trips naive "text-delta spread" streaming checks — see the harness
        // `effectiveSpread` gate in tools/llm-provider-harness/runner.ts.
        // We don't try to re-chunk text client-side: no throttling we could
        // add would match the gateway's real timing, and it would add latency.
        return reasoningConfig == null ? undefined : { openai: reasoningConfig };
    },

    supportsReasoning() {
        return true;
    },
};
