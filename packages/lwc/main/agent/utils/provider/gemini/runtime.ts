import { createGoogleGenerativeAI } from '@ai-sdk/google';
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

// Maps reasoning effort labels to Google thinkingLevel values.
// 'xhigh' is not a valid Google level, so we fall back to 'high'.
const GEMINI_THINKING_LEVEL_MAP: Record<string, 'minimal' | 'low' | 'medium' | 'high'> = {
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'high',
};

export const geminiRuntime: ProviderRuntime = {
    createInstance({ apiKey, baseUrl, isInternal = false }: CreateInstanceArgs): ProviderInstance {
        const baseURL = resolveProviderRuntimeBaseUrl('gemini', baseUrl);
        if (isInternal) {
            return createGoogleGenerativeAI({
                apiKey: apiKey || '',
                baseURL,
                headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
                fetch: createSanitizedFetch(),
            });
        }
        return createGoogleGenerativeAI({
            apiKey: apiKey || '',
            baseURL,
            fetch: createSanitizedFetch(),
        });
    },

    resolveModel(
        instance: ProviderInstance,
        { modelId, isInternal = false }: ResolveModelArgs
    ): LanguageModelV3 {
        if (isInternal && typeof instance.chat === 'function') {
            return instance.chat(modelId);
        }
        return instance(modelId);
    },

    resolveOptions({ reasoningConfig }: ResolveOptionsArgs) {
        const level =
            reasoningConfig?.reasoningEffort != null
                ? GEMINI_THINKING_LEVEL_MAP[reasoningConfig.reasoningEffort]
                : null;
        // includeThoughts surfaces Gemini's thought summaries as reasoning-delta
        // chunks on the ai-sdk fullStream. Without it, the model may still
        // "think" internally but we won't see any reasoning chunks downstream.
        //
        // KNOWN GAP: some preview models (observed: gemini-3-pro-preview via the
        // internal /v1beta gateway) never emit `thought: true` parts even with
        // this flag set — the model clearly thought (providerMetadata.google
        // .usageMetadata.thoughtsTokenCount > 0) but no reasoning-delta chunks
        // arrive. The harness uses that thoughtsTokenCount as a fallback signal.
        // If/when Google fixes the stream, nothing here needs to change.
        return level != null
            ? { google: { thinkingConfig: { thinkingLevel: level, includeThoughts: true } } }
            : { google: { thinkingConfig: { thinkingBudget: 0 } } };
    },

    supportsReasoning() {
        return false;
    },
};
