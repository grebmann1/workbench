import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
    CreateInstanceArgs,
    FormatRequest,
    ProviderInstance,
    ProviderRuntime,
    ResolveModelArgs,
    ResolveOptionsArgs,
    TransformResponse,
} from '../types';
import { createSanitizedFetch } from '../shared/fetch';
import { resolveProviderRuntimeBaseUrl } from '../shared/urls';
import {
    isAnthropicBedrockGateway,
    toAnthropicBedrockRequest,
    toAnthropicBedrockResponse,
} from './bedrock';

// Maps reasoning effort labels to Anthropic thinking token budgets.
const ANTHROPIC_THINKING_BUDGETS: Record<string, number> = {
    minimal: 1024,
    low: 4096,
    medium: 8000,
    high: 16000,
    xhigh: 32000,
};

export const anthropicRuntime: ProviderRuntime = {
    createInstance(args: CreateInstanceArgs): ProviderInstance {
        return createAnthropic({
            apiKey: args.apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('anthropic', args.baseUrl),
            fetch: createSanitizedFetch({
                formatRequest: anthropicRuntime.formatRequest?.(args),
                transformResponse: anthropicRuntime.streamingResponse?.(args),
            }),
        });
    },

    formatRequest({ baseUrl }: CreateInstanceArgs): FormatRequest | undefined {
        return isAnthropicBedrockGateway('anthropic', baseUrl)
            ? toAnthropicBedrockRequest
            : undefined;
    },

    streamingResponse({ baseUrl }: CreateInstanceArgs): TransformResponse | undefined {
        return isAnthropicBedrockGateway('anthropic', baseUrl)
            ? toAnthropicBedrockResponse
            : undefined;
    },

    resolveModel(instance: ProviderInstance, { modelId }: ResolveModelArgs): LanguageModelV3 {
        return instance(modelId);
    },

    resolveOptions({ reasoningConfig }: ResolveOptionsArgs) {
        if (reasoningConfig == null) return undefined;
        const budget = ANTHROPIC_THINKING_BUDGETS[reasoningConfig.reasoningEffort];
        if (budget == null) return undefined;
        // KNOWN GAP: Opus-4-7 on Bedrock rejects this payload ("thinking.type.enabled
        // is not supported for this model. Use thinking.type.adaptive and
        // output_config.effort"). Haiku-4-5 and Sonnet-4-6 still accept it, so we
        // keep the classic shape here; adaptive thinking would need both SDK uplift
        // (@ai-sdk/anthropic currently only emits type:'enabled') and a Bedrock
        // request rewriter.
        return { anthropic: { thinking: { type: 'enabled', budgetTokens: budget } } };
    },

    // `supportsReasoning` returns false for legacy agent-UI reasons, NOT
    // because the wire path can't carry reasoning. Both the direct Anthropic
    // API and the Bedrock gateway stream thinking blocks as reasoning-delta
    // chunks when `thinking: { type: 'enabled', budgetTokens }` is set — see
    // resolveOptions above and the Bedrock transformer in ./bedrock.ts.
    supportsReasoning() {
        return false;
    },
};
