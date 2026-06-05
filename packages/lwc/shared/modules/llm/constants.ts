export const LLM_PROVIDERS = [
    'openai',
    'anthropic',
    'gemini',
    'mistral',
    'grok',
    'workbench',
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** Credentials obtained from a provider's subscription OAuth login. Stored on the
 *  per-provider config alongside (and mutually exclusive with) an API key. The
 *  storage trust model is identical to the existing `apiKey` field. */
export type OAuthCredentials = {
    /** OAuth access token; used as the bearer for provider API calls. */
    access: string;
    /** OAuth refresh token; used to mint a fresh access token. */
    refresh: string;
    /** Access-token expiry as epoch milliseconds. */
    expires: number;
    /** Codex only: the `ChatGPT-Account-Id` header value, decoded from the JWT. */
    accountId?: string;
    /** xAI only: the token endpoint resolved from OIDC discovery (for refresh). */
    tokenEndpoint?: string;
    /** Token type from the token response; defaults to `Bearer`. */
    tokenType?: string;
};

export type LlmProviderConfig = {
    apiKey: string | null;
    baseUrl: string;
    /** When true, use the OpenAI Responses API (/v1/responses) instead of
     *  chat completions (/v1/chat/completions).  Enable this when the gateway
     *  (e.g. LiteLLM) routes to OpenAI's Responses API endpoint, which
     *  requires tools with a flat `name` field rather than nested `function.name`. */
    useResponsesApi?: boolean;
    /** How this provider authenticates. `apiKey` (default) uses `apiKey`;
     *  `oauth` uses the `oauth` credentials below (subscription sign-in). */
    authMode?: 'apiKey' | 'oauth';
    /** Subscription OAuth credentials, when `authMode === 'oauth'`. */
    oauth?: OAuthCredentials | null;
    /** A user-typed model slug, surfaced as a selectable option. The escape hatch for
     *  Codex/OAuth, where the available models change per account/plan and over time — so the
     *  picker shows the live `/models` list and lets the user type anything it's missing. */
    customModel?: string;
};

export type LlmProviderConfigMap = Record<LlmProvider, LlmProviderConfig>;

export type LlmModelOption = {
    label: string;
    value: string;
    provider: LlmProvider;
    maxOutputTokens?: number;
};

export type LlmCatalogStatus =
    | 'ok'
    | 'missing_key'
    | 'invalid_config'
    | 'upstream_error'
    | 'unsupported_provider';

export type LlmProviderCatalog = {
    provider: LlmProvider;
    status: LlmCatalogStatus;
    models: LlmModelOption[];
    defaultModel: string | null;
    error?: string | null;
};

export type LlmModelsEndpointResponse = {
    provider: LlmProvider;
    catalog: LlmProviderCatalog;
    catalogs: Record<LlmProvider, LlmProviderCatalog>;
};

export const DEFAULT_LLM_PROVIDER = 'openai' satisfies LlmProvider;

export const DEFAULT_PROVIDER_BASE_URLS = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    mistral: 'https://api.mistral.ai/v1',
    grok: 'https://api.x.ai/v1',
    workbench: '/openai/v1',
} satisfies Record<LlmProvider, string>;

/** OpenAI ChatGPT (Codex) subscription backend, used when the `openai` provider is in
 *  OAuth mode. This is the WHAM endpoint the Codex CLI talks to — Responses-API only,
 *  with `store:false` and a `ChatGPT-Account-Id` header. Kept as a single constant so a
 *  future provider-side change is a one-line edit (see roadmap compatibility note). */
export const CODEX_WHAM_BASE_URL = 'https://chatgpt.com/backend-api/wham';

/** `client_version` query param required by the WHAM `/models` endpoint. WHAM gates the model
 *  list by client version — an old value (e.g. 0.0.1) returns an empty list — so this tracks a
 *  current Codex CLI version. Isolated here so it's a one-line bump when OpenAI moves forward. */
export const CODEX_MODELS_CLIENT_VERSION = '0.137.0';

export const INTERNAL_PROVIDER_BASE_URLS = {
    openai: 'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1',
    anthropic:
        'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/bedrock',
    gemini: 'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1beta',
} satisfies Partial<Record<LlmProvider, string>>;

export const LLM_PROVIDER_OPTIONS = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Anthropic', value: 'anthropic' },
    { label: 'Gemini', value: 'gemini' },
    { label: 'Mistral', value: 'mistral' },
    { label: 'xAI Grok', value: 'grok' },
    { label: 'Workbench (Free Tier)', value: 'workbench' },
] satisfies Array<{ label: string; value: LlmProvider }>;

export const OPENAI_MODEL_OPTIONS: LlmModelOption[] = [
    { label: 'gpt-5-mini', value: 'gpt-5-mini', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5', value: 'gpt-5-2025-08-07', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5-codex', value: 'gpt-5-codex', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5.3-codex', value: 'gpt-5.3-codex', provider: 'openai', maxOutputTokens: 16000 },
    {
        label: 'gpt-5-nano',
        value: 'gpt-5-nano-2025-08-07',
        provider: 'openai',
        maxOutputTokens: 16000,
    },
    { label: 'gpt-5.4', value: 'gpt-5.4', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5.4-mini', value: 'gpt-5.4-mini', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5.4-nano', value: 'gpt-5.4-nano', provider: 'openai', maxOutputTokens: 16000 },
];

// Codex (OAuth) models are NOT hardcoded — the available set is per-account/plan and changes
// often, so the picker is sourced from the live WHAM `/models` fetch (see fetchCodexModels),
// with a user-typed `customModel` as the manual fallback.

export const INTERNAL_MODEL_OPTIONS: LlmModelOption[] = [
    { label: 'gpt-4o', value: 'gpt-4o', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-4o-mini', value: 'gpt-4o-mini', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5', value: 'gpt-5', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5-mini', value: 'gpt-5-mini', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5.2-codex', value: 'gpt-5.2-codex', provider: 'openai', maxOutputTokens: 16000 },
    { label: 'gpt-5.3-codex', value: 'gpt-5.3-codex', provider: 'openai', maxOutputTokens: 16000 },
    {
        label: 'opus-4.7',
        value: 'us.anthropic.claude-opus-4-7',
        provider: 'anthropic',
        maxOutputTokens: 16000,
    },
    {
        label: 'sonnet-4.6',
        value: 'us.anthropic.claude-sonnet-4-6',
        provider: 'anthropic',
        maxOutputTokens: 16000,
    },
    {
        label: 'haiku-4.5',
        value: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        provider: 'anthropic',
        maxOutputTokens: 8192,
    },
    {
        label: 'gemini-3-pro-preview',
        value: 'gemini-3-pro-preview',
        provider: 'gemini',
        maxOutputTokens: 16000,
    },
    {
        label: 'gemini-3-flash-preview',
        value: 'gemini-3-flash-preview',
        provider: 'gemini',
        maxOutputTokens: 16000,
    },
    {
        label: 'gemini-3.1-pro-preview',
        value: 'gemini-3.1-pro-preview',
        provider: 'gemini',
        maxOutputTokens: 16000,
    },
];

export const ANTHROPIC_MODEL_OPTIONS: LlmModelOption[] = [
    {
        label: 'claude-opus-4-6',
        value: 'claude-opus-4-6',
        provider: 'anthropic',
        maxOutputTokens: 16000,
    },
    {
        label: 'claude-sonnet-4-6',
        value: 'claude-sonnet-4-6',
        provider: 'anthropic',
        maxOutputTokens: 16000,
    },
    {
        label: 'claude-haiku-4-5-20251001',
        value: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        maxOutputTokens: 8192,
    },
];

export const GEMINI_MODEL_OPTIONS: LlmModelOption[] = [
    {
        label: 'gemini-3-flash-preview',
        value: 'gemini-3-flash-preview',
        provider: 'gemini',
        maxOutputTokens: 16000,
    },
    {
        label: 'gemini-3.1-flash-lite-preview',
        value: 'gemini-3.1-flash-lite-preview',
        provider: 'gemini',
        maxOutputTokens: 16000,
    },
    {
        label: 'gemini-3.1-pro-preview',
        value: 'gemini-3.1-pro-preview',
        provider: 'gemini',
        maxOutputTokens: 16000,
    },
];

export const MISTRAL_MODEL_OPTIONS: LlmModelOption[] = [
    {
        label: 'mistral-small-2603',
        value: 'mistral-small-2603',
        provider: 'mistral',
        maxOutputTokens: 16000,
    },
    {
        label: 'mistral-large-2512',
        value: 'mistral-large-2512',
        provider: 'mistral',
        maxOutputTokens: 16000,
    },
    { label: 'devstral-2512', value: 'devstral-2512', provider: 'mistral', maxOutputTokens: 16000 },
    {
        label: 'mistral-medium-2508',
        value: 'mistral-medium-2508',
        provider: 'mistral',
        maxOutputTokens: 16000,
    },
];

export const WORKBENCH_MODEL_OPTIONS: LlmModelOption[] = [
    {
        label: 'gpt-4o-mini (Free Tier)',
        value: 'gpt-4o-mini',
        provider: 'workbench',
        maxOutputTokens: 16000,
    },
    { label: 'gpt-4o (Free Tier)', value: 'gpt-4o', provider: 'workbench', maxOutputTokens: 16000 },
];

export const GROK_MODEL_OPTIONS: LlmModelOption[] = [
    {
        label: 'grok-4.20-0309-reasoning',
        value: 'grok-4.20-0309-reasoning',
        provider: 'grok',
        maxOutputTokens: 16000,
    },
    {
        label: 'grok-4.20-multi-agent-0309',
        value: 'grok-4.20-multi-agent-0309',
        provider: 'grok',
        maxOutputTokens: 16000,
    },
    {
        label: 'grok-4-1-fast-reasoning',
        value: 'grok-4-1-fast-reasoning',
        provider: 'grok',
        maxOutputTokens: 16000,
    },
];

export const PROVIDER_MODEL_OPTIONS: Record<LlmProvider, LlmModelOption[]> = {
    openai: OPENAI_MODEL_OPTIONS,
    anthropic: ANTHROPIC_MODEL_OPTIONS,
    gemini: GEMINI_MODEL_OPTIONS,
    mistral: MISTRAL_MODEL_OPTIONS,
    grok: GROK_MODEL_OPTIONS,
    workbench: WORKBENCH_MODEL_OPTIONS,
};
