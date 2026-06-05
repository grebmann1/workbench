import { isRecord } from 'shared/utils';

import {
    CODEX_MODELS_CLIENT_VERSION,
    CODEX_WHAM_BASE_URL,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_PROVIDER_BASE_URLS,
    INTERNAL_MODEL_OPTIONS,
    LLM_PROVIDERS,
    LLM_PROVIDER_OPTIONS,
    OPENAI_MODEL_OPTIONS,
    PROVIDER_MODEL_OPTIONS,
    type LlmModelOption,
    type LlmProvider,
    type LlmModelsEndpointResponse,
    type LlmProviderCatalog,
    type LlmProviderConfig,
    type LlmProviderConfigMap,
    type OAuthCredentials,
} from './constants';

function getInternalModelsForProvider(provider: LlmProvider) {
    return INTERNAL_MODEL_OPTIONS.filter(model => model.provider === provider);
}

export * from './constants';

function normalizeString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export function isLlmProvider(value: unknown): value is LlmProvider {
    return typeof value === 'string' && (LLM_PROVIDERS as readonly string[]).includes(value);
}

export function normalizeLlmProvider(value: unknown): LlmProvider {
    return isLlmProvider(value) ? value : DEFAULT_LLM_PROVIDER;
}

export function getDefaultProviderConfig(provider: LlmProvider): LlmProviderConfig {
    return {
        apiKey: null,
        baseUrl: DEFAULT_PROVIDER_BASE_URLS[provider],
    };
}

export function createDefaultProviderConfigMap(): LlmProviderConfigMap {
    return LLM_PROVIDERS.reduce((configs, provider) => {
        configs[provider] = getDefaultProviderConfig(provider);
        return configs;
    }, {} as LlmProviderConfigMap);
}

function normalizeAuthMode(value: unknown): LlmProviderConfig['authMode'] {
    return value === 'oauth' ? 'oauth' : value === 'apiKey' ? 'apiKey' : undefined;
}

/** Validates and preserves an OAuth credential blob. Returns null when there is no usable
 *  access token, so a malformed/partial blob is dropped rather than stored. */
export function normalizeOAuthCredentials(value: unknown): OAuthCredentials | null {
    if (!isRecord(value)) return null;
    const access = normalizeString(value.access);
    if (!access) return null;
    const expires =
        typeof value.expires === 'number' && Number.isFinite(value.expires) ? value.expires : 0;
    const credentials: OAuthCredentials = {
        access,
        refresh: normalizeString(value.refresh),
        expires,
    };
    const accountId = normalizeString(value.accountId);
    if (accountId) credentials.accountId = accountId;
    const tokenEndpoint = normalizeString(value.tokenEndpoint);
    if (tokenEndpoint) credentials.tokenEndpoint = tokenEndpoint;
    const tokenType = normalizeString(value.tokenType);
    if (tokenType) credentials.tokenType = tokenType;
    return credentials;
}

export function normalizeProviderConfig(provider: LlmProvider, config: unknown): LlmProviderConfig {
    const defaults = getDefaultProviderConfig(provider);
    const record = isRecord(config) ? config : {};
    const apiKey = normalizeString(record.apiKey);
    const baseUrl = normalizeString(record.baseUrl);
    const normalized: LlmProviderConfig = {
        apiKey: apiKey || null,
        baseUrl: baseUrl || defaults.baseUrl,
    };
    // Preserve the optional fields the previous implementation silently dropped —
    // including `useResponsesApi` (a latent bug) and the OAuth fields. Every persistence
    // path funnels through here, so dropping these loses them on the next save/load.
    if (typeof record.useResponsesApi === 'boolean') {
        normalized.useResponsesApi = record.useResponsesApi;
    }
    const authMode = normalizeAuthMode(record.authMode);
    if (authMode) normalized.authMode = authMode;
    const oauth = normalizeOAuthCredentials(record.oauth);
    if (oauth) normalized.oauth = oauth;
    const customModel = normalizeString(record.customModel);
    if (customModel) normalized.customModel = customModel;
    return normalized;
}

/** A provider is usable in the model picker when it has an API key, or — in OAuth mode —
 *  a stored access token. Mirrors the credential gate used elsewhere. */
export function hasUsableProviderCredentials(config: LlmProviderConfig | undefined): boolean {
    if (!config) return false;
    if (config.authMode === 'oauth') return !!config.oauth?.access;
    return !!config.apiKey;
}

export function normalizeProviderConfigMap(configs: unknown): LlmProviderConfigMap {
    const record = isRecord(configs) ? configs : {};
    return LLM_PROVIDERS.reduce((normalizedConfigs, provider) => {
        normalizedConfigs[provider] = normalizeProviderConfig(provider, record[provider]);
        return normalizedConfigs;
    }, createDefaultProviderConfigMap());
}

export function getProviderModelOptions(provider: LlmProvider) {
    return PROVIDER_MODEL_OPTIONS[provider] || [];
}

export function getProviderLabel(provider: unknown) {
    const normalized = normalizeLlmProvider(provider);
    return (
        LLM_PROVIDER_OPTIONS.find(option => option.value === normalized)?.label ||
        DEFAULT_LLM_PROVIDER
    );
}

export function getDefaultModelForProvider(provider: LlmProvider) {
    return getProviderModelOptions(provider)[0]?.value || null;
}

export function normalizeModelSelection(
    model: unknown,
    options: LlmModelOption[],
    fallbackValue?: string | null
): string | null {
    const safeOptions = Array.isArray(options) ? options : [];
    const normalized = normalizeString(model);
    const fallback = fallbackValue ?? safeOptions[0]?.value ?? null;
    if (!normalized) return fallback;

    const lowered = normalized.toLowerCase();
    const exactValue = safeOptions.find(option => option.value === normalized);
    if (exactValue) return exactValue.value;

    const caseInsensitiveValue = safeOptions.find(option => option.value.toLowerCase() === lowered);
    if (caseInsensitiveValue) return caseInsensitiveValue.value;

    const labelMatch = safeOptions.find(option => option.label.toLowerCase() === lowered);
    if (labelMatch) return labelMatch.value;

    const aliasMatch = safeOptions.find(option =>
        option.value.toLowerCase().startsWith(`${lowered}-`)
    );
    if (aliasMatch) return aliasMatch.value;

    return fallback;
}

export function isInternalProviderBaseUrl(baseUrl: unknown) {
    return normalizeString(baseUrl).includes('eng-ai-model-gateway');
}

// Native API domain patterns for each non-OpenAI provider.
// When a provider is configured with a baseUrl that doesn't match its native
// domain, it's assumed to point at an OpenAI-compatible gateway (e.g. LiteLLM).
const NATIVE_PROVIDER_DOMAINS: Partial<Record<LlmProvider, string>> = {
    anthropic: 'api.anthropic.com',
    gemini: 'generativelanguage.googleapis.com',
    grok: 'api.x.ai',
    mistral: 'api.mistral.ai',
};

/**
 * Returns true when the provider is pointing at an OpenAI-compatible gateway
 * rather than its own native API.  This covers both the internal Salesforce
 * eng-ai-model-gateway and any external proxy (e.g. LiteLLM) that exposes an
 * OpenAI-compatible `/chat/completions` or `/responses` surface.
 */
export function isOpenAiCompatibleGateway(provider: unknown, baseUrl: unknown) {
    if (isInternalProviderBaseUrl(baseUrl)) return true;
    const normalized = normalizeString(baseUrl).toLowerCase();
    if (!normalized) return false;
    const nativeDomain = NATIVE_PROVIDER_DOMAINS[normalizeLlmProvider(provider)];
    return !!nativeDomain && !normalized.includes(nativeDomain);
}

function getWorkbenchBaseUrl(): string {
    if (
        typeof process === 'undefined' ||
        !process ||
        typeof process.env !== 'object' ||
        typeof process.env.WORKBENCH_BASE_URL !== 'string'
    ) {
        return '';
    }

    return normalizeString(process.env.WORKBENCH_BASE_URL).replace(/\/+$/, '');
}

function resolveWorkbenchEndpoint(pathname: string): string {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const baseUrl = getWorkbenchBaseUrl();
    if (!baseUrl) {
        throw new Error('fetchLlmModelsEndpoint: no WORKBENCH_BASE_URL configured');
    }
    return `${baseUrl}${normalizedPath}`;
}

function extractModels(
    availableModelsByProvider:
        | Partial<Record<LlmProvider, LlmModelOption[] | { models?: LlmModelOption[] }>>
        | undefined,
    provider: LlmProvider
): LlmModelOption[] {
    const entry = availableModelsByProvider?.[provider];
    if (Array.isArray(entry)) {
        return entry;
    }
    return Array.isArray(entry?.models) ? entry.models : [];
}

const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

export function getMaxOutputTokensForModel(
    model: unknown,
    options: LlmModelOption[] = [
        ...Object.values(PROVIDER_MODEL_OPTIONS).flat(),
        ...INTERNAL_MODEL_OPTIONS,
    ]
): number {
    const normalized = normalizeString(model);
    if (!normalized) return DEFAULT_MAX_OUTPUT_TOKENS;
    const match = options.find(o => o.value === normalized);
    return match?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

export function getProviderForModel(
    model: unknown,
    options: LlmModelOption[] = Object.values(PROVIDER_MODEL_OPTIONS).flat()
): LlmProvider {
    const normalized = normalizeString(model);
    if (!normalized) {
        return DEFAULT_LLM_PROVIDER;
    }

    const lowered = normalized.toLowerCase();
    const exactValue = options.find(option => option.value === normalized);
    if (exactValue) return exactValue.provider;

    const caseInsensitiveValue = options.find(option => option.value.toLowerCase() === lowered);
    if (caseInsensitiveValue) return caseInsensitiveValue.provider;

    const labelMatch = options.find(option => option.label.toLowerCase() === lowered);
    if (labelMatch) return labelMatch.provider;

    const aliasMatch = options.find(option => option.value.toLowerCase().startsWith(`${lowered}-`));
    return aliasMatch?.provider || DEFAULT_LLM_PROVIDER;
}

export function buildAvailableAgentModelOptions({
    availableModelsByProvider,
    providerConfigs,
}: {
    availableModelsByProvider?:
        | Partial<Record<LlmProvider, LlmModelOption[] | { models?: LlmModelOption[] }>>
        | undefined;
    providerConfigs: LlmProviderConfigMap;
}): LlmModelOption[] {
    const normalizedConfigs = normalizeProviderConfigMap(providerConfigs);
    const configuredProviders = LLM_PROVIDERS.filter(provider =>
        hasUsableProviderCredentials(normalizedConfigs[provider])
    );
    const shouldPrefixProviderLabel = configuredProviders.length > 1;

    return configuredProviders.flatMap(provider => {
        const config = normalizedConfigs[provider];
        const serverModels = extractModels(availableModelsByProvider, provider);
        const isProviderInternal = isInternalProviderBaseUrl(config.baseUrl);
        // `openai` in OAuth mode is Codex (WHAM): use the live WHAM `/models` catalog
        // (fetchLlmModelsEndpoint fetches it client-side for OAuth and overrides the openai
        // catalog) — there is no hardcoded Codex list. Other providers keep their existing
        // server/internal/static resolution.
        const isCodexOAuth = provider === 'openai' && config.authMode === 'oauth';
        let models = isCodexOAuth
            ? serverModels
            : serverModels.length > 0
              ? serverModels
              : isProviderInternal
                ? getInternalModelsForProvider(provider)
                : getProviderModelOptions(provider);
        // Manual fallback: a user-typed model the live catalog may not list (Codex models
        // change often). Append it so it's selectable, if not already present.
        const customModel = normalizeString(config.customModel);
        if (customModel && !models.some(model => model.value === customModel)) {
            models = [
                ...models,
                { label: customModel, value: customModel, provider, maxOutputTokens: 16000 },
            ];
        }

        return models.map(model => ({
            ...model,
            label: shouldPrefixProviderLabel
                ? `${getProviderLabel(provider)}: ${model.label}`
                : model.label,
        }));
    });
}

export function resolveAgentProviderBaseUrl(provider: unknown, baseUrl: unknown): string {
    const normalizedProvider = normalizeLlmProvider(provider);
    const normalizedBaseUrl = normalizeString(baseUrl).replace(/\/+$/, '');
    const fallbackBaseUrl = DEFAULT_PROVIDER_BASE_URLS[normalizedProvider];
    const effectiveBaseUrl = normalizedBaseUrl || fallbackBaseUrl;

    if (normalizedProvider !== 'gemini') {
        return effectiveBaseUrl;
    }

    if (effectiveBaseUrl.includes('/openai')) {
        return effectiveBaseUrl;
    }
    if (effectiveBaseUrl.endsWith('/v1beta')) {
        return `${effectiveBaseUrl}/openai`;
    }
    if (effectiveBaseUrl.includes('generativelanguage.googleapis.com')) {
        return `${effectiveBaseUrl}/v1beta/openai`;
    }
    return effectiveBaseUrl;
}

/** Strip OAuth credentials (and the oauth auth-mode) from a config map. The Workbench server
 *  can't use subscription tokens and they must not leave the client, so the model-catalog
 *  request never carries them. */
function stripOAuthFromProviderConfigs(configs: LlmProviderConfigMap): LlmProviderConfigMap {
    return LLM_PROVIDERS.reduce((result, provider) => {
        const { apiKey, baseUrl, useResponsesApi } = configs[provider];
        result[provider] = { apiKey, baseUrl, ...(useResponsesApi ? { useResponsesApi } : {}) };
        return result;
    }, {} as LlmProviderConfigMap);
}

/** The `client_version` WHAM gates its `/models` list by. Resolved from the latest published
 *  @openai/codex release (npm) so it tracks OpenAI without manual bumps; falls back to the
 *  pinned constant when the registry is unreachable. */
export async function resolveCodexClientVersion(fetchImpl: typeof fetch = fetch): Promise<string> {
    try {
        const response = await fetchImpl('https://registry.npmjs.org/@openai/codex/latest', {
            headers: { Accept: 'application/json' },
        });
        if (response.ok) {
            const data = (await response.json()) as { version?: unknown };
            if (typeof data.version === 'string' && data.version) {
                return data.version;
            }
        }
    } catch {
        // Registry unreachable (e.g. offline) — fall back to the pinned default.
    }
    return CODEX_MODELS_CLIENT_VERSION;
}

/** Fetch the live Codex (WHAM) model list for an OAuth-authenticated openai config. WHAM's
 *  `/models` returns `{ models: [{ slug }] }` (slug-based, client_version required); falls back
 *  to the standard `{ data: [{ id }] }` shape. Returns [] on any failure so the picker degrades
 *  to the user-typed customModel. Works from the extension (host permissions); the hosted web
 *  app would need a server-side proxy (a documented follow-up). */
export async function fetchCodexModels(
    oauth: OAuthCredentials,
    clientVersion: string,
    fetchImpl: typeof fetch = fetch
): Promise<LlmModelOption[]> {
    if (!oauth?.access) return [];
    const headers: Record<string, string> = {
        Authorization: `Bearer ${oauth.access}`,
        Accept: 'application/json',
    };
    if (oauth.accountId) headers['ChatGPT-Account-Id'] = oauth.accountId;
    const url = `${CODEX_WHAM_BASE_URL}/models?client_version=${encodeURIComponent(clientVersion)}`;
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
        throw new Error(`Codex /models request failed with status ${response.status}.`);
    }
    const data = (await response.json()) as { models?: unknown; data?: unknown };
    const rawList = Array.isArray(data.models)
        ? data.models
        : Array.isArray(data.data)
          ? data.data
          : [];
    const options: LlmModelOption[] = [];
    for (const entry of rawList) {
        if (!isRecord(entry)) continue;
        const slug =
            typeof entry.slug === 'string'
                ? entry.slug
                : typeof entry.id === 'string'
                  ? entry.id
                  : '';
        if (slug) {
            options.push({ label: slug, value: slug, provider: 'openai', maxOutputTokens: 16000 });
        }
    }
    return options;
}

function emptyProviderCatalog(provider: LlmProvider): LlmProviderCatalog {
    return { provider, status: 'missing_key', models: [], defaultModel: null, error: null };
}

function emptyProviderCatalogs(): Record<LlmProvider, LlmProviderCatalog> {
    return LLM_PROVIDERS.reduce(
        (catalogs, provider) => {
            catalogs[provider] = emptyProviderCatalog(provider);
            return catalogs;
        },
        {} as Record<LlmProvider, LlmProviderCatalog>
    );
}

export async function fetchLlmModelsEndpoint({
    provider,
    providerConfigs,
}: {
    provider: LlmProvider;
    providerConfigs: LlmProviderConfigMap;
}): Promise<LlmModelsEndpointResponse> {
    const normalizedConfigs = normalizeProviderConfigMap(providerConfigs);
    const openaiConfig = normalizedConfigs.openai;
    const isCodexOAuth = openaiConfig?.authMode === 'oauth' && !!openaiConfig.oauth?.access;

    let result: LlmModelsEndpointResponse;
    try {
        const response = await fetch(resolveWorkbenchEndpoint('/api/llm/models'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                provider,
                // Never send OAuth tokens to the server; it can't use them.
                providerConfigs: stripOAuthFromProviderConfigs(normalizedConfigs),
            }),
        });
        if (!response.ok) {
            throw new Error(`Model catalog request failed with status ${response.status}.`);
        }
        result = (await response.json()) as LlmModelsEndpointResponse;
    } catch (serverError) {
        // The Workbench server may be unreachable (e.g. an extension user signed in with their
        // own subscription and has no server). Still serve the Codex catalog client-side;
        // otherwise propagate so API-key providers report the failure.
        if (!isCodexOAuth) throw serverError;
        result = {
            provider,
            catalog: emptyProviderCatalog(provider),
            catalogs: emptyProviderCatalogs(),
        };
    }

    // openai in OAuth (Codex) mode: the server can't reach WHAM, so fetch the live model list
    // client-side and override the openai catalog. Degrade gracefully on any failure (the
    // picker then relies on the user-typed customModel).
    if (isCodexOAuth && openaiConfig?.oauth) {
        try {
            const clientVersion = await resolveCodexClientVersion();
            const codexModels = await fetchCodexModels(openaiConfig.oauth, clientVersion);
            result.catalogs = {
                ...result.catalogs,
                openai: {
                    provider: 'openai',
                    status: codexModels.length > 0 ? 'ok' : 'missing_key',
                    models: codexModels,
                    defaultModel: codexModels[0]?.value ?? null,
                    error: null,
                },
            };
        } catch {
            // Leave the openai catalog empty; the user can type a model manually.
        }
    }

    return result;
}
