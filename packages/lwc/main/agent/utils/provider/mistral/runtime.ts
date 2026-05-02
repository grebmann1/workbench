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

export const mistralRuntime: ProviderRuntime = {
    createInstance({ apiKey, baseUrl }: CreateInstanceArgs): ProviderInstance {
        return createOpenAI({
            apiKey: apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('mistral', baseUrl),
            fetch: createSanitizedFetch(),
        });
    },

    resolveModel(instance: ProviderInstance, { modelId }: ResolveModelArgs): LanguageModelV3 {
        if (typeof instance.chat === 'function') {
            return instance.chat(modelId);
        }
        return instance(modelId);
    },

    resolveOptions(_args: ResolveOptionsArgs) {
        return undefined;
    },

    supportsReasoning() {
        return false;
    },
};
