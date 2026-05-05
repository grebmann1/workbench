import type { LanguageModelV3 } from '@ai-sdk/provider';
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
};

export type ResolveModelArgs = {
    modelId: string;
    isInternal?: boolean;
    useResponsesApi?: boolean;
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
