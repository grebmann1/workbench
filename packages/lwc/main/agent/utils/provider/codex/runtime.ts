import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { CODEX_WHAM_BASE_URL } from 'shared/llm';
import { CODEX_OAUTH } from 'shared/oauth';
import type {
    CreateInstanceArgs,
    ProviderInstance,
    ProviderRuntime,
    ResolveModelArgs,
    ResolveOptionsArgs,
} from '../types';
import { createSanitizedFetch, type FormattedRequest } from '../shared/fetch';
import { createOAuthFetch } from '../shared/oauthFetch';

// Codex (ChatGPT subscription) runtime. Selected when the `openai` provider is in OAuth
// mode; targets the WHAM backend, which is Responses-API only and requires `store:false`.
// Codex is an auth-mode on `openai`, not a separate provider — keeping it as its own runtime
// (like the internal/bedrock runtimes) isolates the WHAM specifics from the standard openai
// API path.

/** WHAM is stateless and rejects requests unless `store:false` is sent — inject it into
 *  every JSON request body that doesn't already set it. Non-JSON bodies (e.g. the GET
 *  /models request) pass through untouched. Exported for unit testing. */
export function codexFormatRequest(url: RequestInfo | URL, options?: RequestInit): FormattedRequest {
    const body = options?.body;
    if (typeof body === 'string') {
        try {
            const payload = JSON.parse(body);
            if (payload && typeof payload === 'object' && payload.store === undefined) {
                payload.store = false;
                return { url, options: { ...options, body: JSON.stringify(payload) } };
            }
        } catch {
            // Leave the body untouched when it isn't JSON.
        }
    }
    return { url, options };
}

export const codexRuntime: ProviderRuntime = {
    createInstance({ oauth, onTokenRefresh }: CreateInstanceArgs): ProviderInstance {
        const headers: Record<string, string> = {};
        // ChatGPT-Account-Id selects the subscription account; decoded from the JWT at login.
        if (oauth?.accountId) {
            headers['ChatGPT-Account-Id'] = oauth.accountId;
        }
        const provider = createOpenAI({
            // The access token seeds the bearer; createOAuthFetch keeps it fresh + injects
            // the current token on every request and on a 401.
            apiKey: oauth?.access || '',
            baseURL: CODEX_WHAM_BASE_URL,
            headers,
            fetch: oauth
                ? createOAuthFetch({
                      provider: CODEX_OAUTH,
                      credentials: oauth,
                      onTokenRefresh,
                      formatRequest: codexFormatRequest,
                  })
                : createSanitizedFetch({ formatRequest: codexFormatRequest }),
        });
        // WHAM is Responses-API only — make the *default* callable resolve Responses models so
        // every consumer routes correctly even when it doesn't pass authMode (e.g. context
        // compaction resolves the summary model without it).
        const instance = ((modelId: string) => provider.responses(modelId)) as ProviderInstance;
        instance.responses = (modelId: string) => provider.responses(modelId);
        instance.chat = (modelId: string) => provider.chat(modelId);
        return instance;
    },

    resolveModel(instance: ProviderInstance, { modelId }: ResolveModelArgs): LanguageModelV3 {
        return (instance.responses ?? instance)(modelId);
    },

    resolveOptions({ reasoningConfig }: ResolveOptionsArgs) {
        return reasoningConfig == null ? undefined : { openai: reasoningConfig };
    },

    supportsReasoning() {
        return true;
    },
};
