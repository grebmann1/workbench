import { createXai } from '@ai-sdk/xai';
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

export const grokRuntime: ProviderRuntime = {
    createInstance({ apiKey, baseUrl, authMode, oauth }: CreateInstanceArgs): ProviderInstance {
        // OAuth (SuperGrok subscription) reuses the same endpoint; the access token simply
        // replaces the API key as the bearer.
        const bearer = authMode === 'oauth' ? oauth?.access || '' : apiKey || '';
        return createXai({
            apiKey: bearer,
            baseURL: resolveProviderRuntimeBaseUrl('grok', baseUrl),
            fetch: createSanitizedFetch(),
        });
    },

    resolveModel(instance: ProviderInstance, { modelId }: ResolveModelArgs): LanguageModelV3 {
        return instance(modelId);
    },

    resolveOptions(_args: ResolveOptionsArgs) {
        return undefined;
    },

    supportsReasoning() {
        return false;
    },
};
