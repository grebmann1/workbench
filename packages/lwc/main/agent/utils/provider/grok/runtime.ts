import { createXai } from '@ai-sdk/xai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
    CreateInstanceArgs,
    ProviderInstance,
    ProviderRuntime,
    ResolveModelArgs,
    ResolveOptionsArgs,
} from '../types';
import { XAI_OAUTH } from 'shared/oauth';
import { createSanitizedFetch } from '../shared/fetch';
import { createOAuthFetch } from '../shared/oauthFetch';
import { resolveProviderRuntimeBaseUrl } from '../shared/urls';

export const grokRuntime: ProviderRuntime = {
    createInstance({ apiKey, baseUrl, authMode, oauth, onTokenRefresh }: CreateInstanceArgs): ProviderInstance {
        // OAuth (SuperGrok subscription) reuses the same endpoint; the access token replaces
        // the API key as the bearer, and createOAuthFetch keeps it fresh.
        const isOAuth = authMode === 'oauth' && !!oauth;
        return createXai({
            apiKey: isOAuth ? oauth?.access || '' : apiKey || '',
            baseURL: resolveProviderRuntimeBaseUrl('grok', baseUrl),
            fetch:
                isOAuth && oauth
                    ? createOAuthFetch({ provider: XAI_OAUTH, credentials: oauth, onTokenRefresh })
                    : createSanitizedFetch(),
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
