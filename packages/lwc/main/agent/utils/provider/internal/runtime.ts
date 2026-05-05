import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
    CreateInstanceArgs,
    ProviderInstance,
    ProviderRuntime,
    ResolveModelArgs,
    ResolveOptionsArgs,
} from '../types';
import { createSanitizedFetch, type FormattedRequest } from '../shared/fetch';
import { resolveProviderRuntimeBaseUrl } from '../shared/urls';
import type { FormatRequest } from '../types';

const toOpenAiResponsesRequest: FormatRequest = (url, options) => {
    const urlObj = new URL(url.toString());
    return { url: `${urlObj.origin}/responses`, options } satisfies FormattedRequest;
};

/**
 * Internal Salesforce gateway runtime.
 *
 * The internal `/v1` gateway is OpenAI-compatible for the providers it proxies
 * (currently openai models; gemini goes through its own runtime), so we use the
 * OpenAI SDK and rewrite requests to target `/responses`.
 */
export const internalRuntime: ProviderRuntime = {
    createInstance({ apiKey, baseUrl }: CreateInstanceArgs): ProviderInstance {
        return createOpenAI({
            apiKey: apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('openai', baseUrl),
            fetch: createSanitizedFetch({ formatRequest: toOpenAiResponsesRequest }),
        });
    },

    resolveModel(instance: ProviderInstance, { modelId }: ResolveModelArgs): LanguageModelV3 {
        return instance(modelId);
    },

    resolveOptions({ reasoningConfig }: ResolveOptionsArgs) {
        // Gateway mode: all providers go through the OpenAI SDK, so pass reasoning in
        // OpenAI format and let the gateway translate for the downstream provider.
        return reasoningConfig == null ? undefined : { openai: reasoningConfig };
    },

    supportsReasoning() {
        return true;
    },
};
