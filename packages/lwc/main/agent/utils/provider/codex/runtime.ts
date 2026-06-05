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

/** Pull the system prompt out of the Responses `input` array (the AI SDK puts it there as a
 *  system/developer item) so it can be sent as WHAM's required top-level `instructions`. */
function extractInstructionsFromInput(input: unknown): { instructions: string; rest: unknown } {
    if (!Array.isArray(input)) return { instructions: '', rest: input };
    const parts: string[] = [];
    const rest: unknown[] = [];
    for (const item of input) {
        const role =
            item && typeof item === 'object' ? (item as { role?: unknown }).role : undefined;
        if (role === 'system' || role === 'developer') {
            const content = (item as { content?: unknown }).content;
            if (typeof content === 'string') {
                parts.push(content);
            } else if (Array.isArray(content)) {
                for (const part of content) {
                    const text =
                        part && typeof part === 'object'
                            ? (part as { text?: unknown }).text
                            : undefined;
                    if (typeof text === 'string') parts.push(text);
                }
            }
        } else {
            rest.push(item);
        }
    }
    return { instructions: parts.join('\n\n'), rest };
}

/** WHAM (a) is stateless and requires `store:false`, and (b) requires a top-level
 *  `instructions` (system prompt) — but the AI SDK puts the system message inside `input` as a
 *  system/developer item. Inject `store:false` and lift the system message into `instructions`.
 *  Non-JSON bodies (e.g. the GET /models request) pass through untouched. Exported for tests. */
export function codexFormatRequest(url: RequestInfo | URL, options?: RequestInit): FormattedRequest {
    const body = options?.body;
    if (typeof body !== 'string') return { url, options };
    let payload: Record<string, unknown>;
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object') return { url, options };
        payload = parsed as Record<string, unknown>;
    } catch {
        return { url, options };
    }
    let changed = false;
    if (payload.store === undefined) {
        payload.store = false;
        changed = true;
    }
    if (!payload.instructions) {
        const { instructions, rest } = extractInstructionsFromInput(payload.input);
        payload.instructions = instructions || 'You are a helpful assistant.';
        if (instructions) payload.input = rest;
        changed = true;
    }
    // WHAM rejects `max_output_tokens` ("Unsupported parameter") — the model uses its own cap.
    if (payload.max_output_tokens !== undefined) {
        delete payload.max_output_tokens;
        changed = true;
    }
    return changed ? { url, options: { ...options, body: JSON.stringify(payload) } } : { url, options };
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
