// Target-agnostic OAuth 2.0 Authorization-Code + PKCE client helpers, shared by both the
// Codex (openai) and xAI (grok) subscription flows. Pure logic + fetch only — the
// transport (loopback server / extension popup capture) lives per-target. `now` is passed
// in (never read from Date here) so every function is deterministically testable.

import type { OAuthCredentials } from 'shared/llm';

import { extractAccountId } from './jwt';

/** Static, provider-specific OAuth configuration (one constants object per provider). */
export type OAuthProviderConfig = {
    /** Stable id, e.g. 'codex' | 'xai'. */
    id: string;
    /** Authorize endpoint. Empty when resolved via OIDC discovery (xAI). */
    authorizeUrl: string;
    /** Token endpoint. Empty when resolved via OIDC discovery (xAI). */
    tokenUrl: string;
    clientId: string;
    scope: string;
    /** The exact redirect_uri registered for the reused CLI client_id. */
    redirectUri: string;
    /** Provider-specific authorize params (e.g. Codex's originator / simplified-flow). */
    extraAuthParams?: Record<string, string>;
    /** Refresh this many ms before the real expiry. */
    refreshSkewMs: number;
    /** Whether the endpoints come from OIDC discovery (xAI). */
    usesDiscovery?: boolean;
    discoveryUrl?: string;
};

/** Raw token-endpoint response. */
export type TokenPayload = {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    token_type?: string;
};

export type CallbackResult = {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
};

type FetchImpl = typeof fetch;

export function buildAuthorizeUrl(params: {
    authorizeEndpoint: string;
    clientId: string;
    redirectUri: string;
    scope: string;
    challenge: string;
    state: string;
    nonce?: string;
    extraParams?: Record<string, string>;
}): string {
    const search = new URLSearchParams({
        response_type: 'code',
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        scope: params.scope,
        code_challenge: params.challenge,
        code_challenge_method: 'S256',
        state: params.state,
    });
    if (params.nonce) search.set('nonce', params.nonce);
    for (const [key, value] of Object.entries(params.extraParams ?? {})) {
        search.set(key, value);
    }
    return `${params.authorizeEndpoint}?${search.toString()}`;
}

async function postToken(
    tokenEndpoint: string,
    body: Record<string, string>,
    fetchImpl: FetchImpl
): Promise<TokenPayload> {
    const response = await fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body).toString(),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`OAuth token request failed: ${response.status} ${detail}`.trim());
    }
    return (await response.json()) as TokenPayload;
}

export function exchangeAuthCode(
    opts: {
        tokenEndpoint: string;
        clientId: string;
        code: string;
        redirectUri: string;
        verifier: string;
    },
    fetchImpl: FetchImpl = fetch
): Promise<TokenPayload> {
    return postToken(
        opts.tokenEndpoint,
        {
            grant_type: 'authorization_code',
            code: opts.code,
            redirect_uri: opts.redirectUri,
            client_id: opts.clientId,
            code_verifier: opts.verifier,
        },
        fetchImpl
    );
}

export function refreshAccessToken(
    opts: { tokenEndpoint: string; clientId: string; refreshToken: string },
    fetchImpl: FetchImpl = fetch
): Promise<TokenPayload> {
    return postToken(
        opts.tokenEndpoint,
        {
            grant_type: 'refresh_token',
            refresh_token: opts.refreshToken,
            client_id: opts.clientId,
        },
        fetchImpl
    );
}

/** Convert a token response into stored credentials. The refresh safety margin is baked into
 *  `expires` (so `isExpired` is a plain `expires <= now` check). `fallbackRefresh` keeps the
 *  previous refresh token when a refresh response omits a new one. */
export function credentialsFromTokenPayload(
    payload: TokenPayload,
    opts: { now: number; refreshSkewMs?: number; tokenEndpoint?: string; fallbackRefresh?: string }
): OAuthCredentials {
    if (!payload.access_token) {
        throw new Error('OAuth token response did not include an access_token');
    }
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
    const credentials: OAuthCredentials = {
        access: payload.access_token,
        refresh: payload.refresh_token || opts.fallbackRefresh || '',
        expires: opts.now + expiresIn * 1000 - (opts.refreshSkewMs ?? 0),
        tokenType: payload.token_type || 'Bearer',
    };
    const accountId = extractAccountId(payload.id_token, payload.access_token);
    if (accountId) credentials.accountId = accountId;
    if (opts.tokenEndpoint) credentials.tokenEndpoint = opts.tokenEndpoint;
    return credentials;
}

/** True when the access token is missing or at/after its (skew-adjusted) expiry. */
export function isExpired(credentials: OAuthCredentials, now: number): boolean {
    return !credentials.access || !credentials.expires || credentials.expires <= now;
}

/** Resolve the token endpoint for a refresh: the one captured at login (xAI discovery) or
 *  the provider's static endpoint (Codex). */
function resolveTokenEndpoint(
    credentials: OAuthCredentials,
    provider: OAuthProviderConfig
): string {
    const endpoint = credentials.tokenEndpoint || provider.tokenUrl;
    if (!endpoint) {
        throw new Error(`No token endpoint available to refresh ${provider.id} credentials`);
    }
    return endpoint;
}

/** Exchange the refresh token for a fresh access token. Throws when no refresh token exists
 *  (caller should surface a re-authenticate state). */
export async function refreshCredentials(
    credentials: OAuthCredentials,
    provider: OAuthProviderConfig,
    opts: { now: number; fetchImpl?: FetchImpl }
): Promise<OAuthCredentials> {
    if (!credentials.refresh) {
        throw new Error(`${provider.id} credentials are expired and have no refresh token`);
    }
    const tokenEndpoint = resolveTokenEndpoint(credentials, provider);
    const payload = await refreshAccessToken(
        { tokenEndpoint, clientId: provider.clientId, refreshToken: credentials.refresh },
        opts.fetchImpl ?? fetch
    );
    return credentialsFromTokenPayload(payload, {
        now: opts.now,
        refreshSkewMs: provider.refreshSkewMs,
        tokenEndpoint,
        fallbackRefresh: credentials.refresh,
    });
}

/** Return the credentials unchanged when still fresh, otherwise refresh them. */
export async function ensureFreshCredentials(
    credentials: OAuthCredentials,
    provider: OAuthProviderConfig,
    opts: { now: number; fetchImpl?: FetchImpl }
): Promise<OAuthCredentials> {
    if (!isExpired(credentials, opts.now)) return credentials;
    return refreshCredentials(credentials, provider, opts);
}

const BARE_CODE_PATTERN = /^[A-Za-z0-9._~-]{20,}$/;

/** Parse an OAuth callback the user may paste: a full redirect URL, a bare `?code=…&state=…`
 *  query string, or just the authorization code on its own. */
export function parseCallback(
    input: string,
    redirect: { host: string; path: string } = { host: '127.0.0.1', path: '/callback' }
): CallbackResult {
    const value = (input || '').trim();
    if (!value) return {};

    if (!value.includes('=') && !value.includes('/') && BARE_CODE_PATTERN.test(value)) {
        return { code: value };
    }

    try {
        const url = value.startsWith('http')
            ? new URL(value)
            : new URL(`http://${redirect.host}${redirect.path}?${value.replace(/^\?/, '')}`);
        return {
            code: url.searchParams.get('code') ?? undefined,
            state: url.searchParams.get('state') ?? undefined,
            error: url.searchParams.get('error') ?? undefined,
            errorDescription: url.searchParams.get('error_description') ?? undefined,
        };
    } catch {
        return {};
    }
}

export type PendingFlow = {
    state: string;
    verifier: string;
    nonce?: string;
    redirectUri: string;
    provider: string;
    /** Token endpoint resolved at login time (xAI discovery); undefined for static-endpoint
     *  providers like Codex. */
    tokenEndpoint?: string;
    createdAt: number;
};

/** In-memory store of in-flight OAuth requests, keyed by `state`. Enforces single-use
 *  (take() deletes) and a TTL, so a stale or replayed authorization code is rejected before
 *  token exchange (callback hardening). */
export function createPendingFlowStore(ttlMs = 10 * 60 * 1000) {
    const flows = new Map<string, PendingFlow>();
    return {
        put(flow: PendingFlow): void {
            flows.set(flow.state, flow);
        },
        /** Consume the flow for `state`. Returns null when unknown, already consumed, or
         *  past its TTL. */
        take(state: string | undefined, now: number): PendingFlow | null {
            if (!state) return null;
            const flow = flows.get(state);
            if (!flow) return null;
            flows.delete(state);
            if (now - flow.createdAt > ttlMs) return null;
            return flow;
        },
        clear(): void {
            flows.clear();
        },
        get size(): number {
            return flows.size;
        },
    };
}
