import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { OAuthCredentials } from 'shared/llm';
import type { FormattedRequest } from './shared/fetch';

type ModelResolver = (modelId: string) => LanguageModelV3;

export type ProviderInstance = ModelResolver & {
    chat?: ModelResolver;
    responses?: ModelResolver;
    messages?: ModelResolver;
};

export type ProviderReasoningConfig = {
    reasoningEffort: string;
    reasoningSummary: string;
};

export type CreateInstanceArgs = {
    apiKey?: string;
    baseUrl?: string;
    isInternal?: boolean;
    /** When 'oauth', the runtime authenticates with `oauth` instead of `apiKey`. */
    authMode?: 'apiKey' | 'oauth';
    /** Subscription OAuth credentials, used when `authMode === 'oauth'`. */
    oauth?: OAuthCredentials | null;
    /** Called with the new credentials whenever the runtime refreshes an OAuth token, so the
     *  caller can persist them (refresh tokens may rotate). */
    onTokenRefresh?: (credentials: OAuthCredentials) => void;
};

export type ResolveModelArgs = {
    modelId: string;
    isInternal?: boolean;
    useResponsesApi?: boolean;
    /** Mirrors CreateInstanceArgs so model resolution can pick the same runtime
     *  (e.g. openai + oauth → the Codex/WHAM runtime, which is Responses-only). */
    authMode?: 'apiKey' | 'oauth';
};

export type ResolveOptionsArgs = {
    reasoningConfig?: ProviderReasoningConfig;
    isInternal?: boolean;
};

export type FormatRequest = (
    url: RequestInfo | URL,
    options?: RequestInit
) => Omit<FormattedRequest, 'transformResponse'>;

export type TransformResponse = (response: Response) => Promise<Response>;

export interface ProviderRuntime {
    createInstance(args: CreateInstanceArgs): ProviderInstance;
    resolveModel(instance: ProviderInstance, args: ResolveModelArgs): LanguageModelV3;
    resolveOptions(args: ResolveOptionsArgs): Record<string, unknown> | undefined;
    supportsReasoning(): boolean;
    /**
     * Optional per-runtime request/response hooks. When a runtime declares these,
     * `createInstance` wires them into `createSanitizedFetch` automatically.
     *  - formatRequest: URL/body rewrite before the network call.
     *  - streamingResponse: transform the raw Response before the SDK parser sees it.
     */
    formatRequest?(args: CreateInstanceArgs): FormatRequest | undefined;
    streamingResponse?(args: CreateInstanceArgs): TransformResponse | undefined;
}
