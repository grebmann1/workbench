import type { OAuthCredentials } from 'shared/llm';
import {
    isExpired,
    OAuthAuthorizationError,
    refreshCredentials,
    type OAuthProviderConfig,
} from './oauthClient';

export type OAuthLifecycle = {
    onTokenRefresh?: (
        credentials: OAuthCredentials,
        previous: OAuthCredentials
    ) => void | Promise<void>;
    onAuthInvalid?: (credentials: OAuthCredentials) => void | Promise<void>;
};

// Shared by catalogs and runtime instances in this JS context. Keep only the latest
// rotation per provider, not an unbounded history of refresh tokens.
const rotations = new WeakMap<
    typeof fetch,
    Map<
        string,
        {
            previous: OAuthCredentials;
            result: Promise<OAuthCredentials>;
        }
    >
>();

async function refreshShared(
    credentials: OAuthCredentials,
    provider: OAuthProviderConfig,
    fetchImpl: typeof fetch
): Promise<OAuthCredentials> {
    let providerRotations = rotations.get(fetchImpl);
    if (!providerRotations) {
        providerRotations = new Map();
        rotations.set(fetchImpl, providerRotations);
    }
    const key = `${provider.id}:${credentials.tokenEndpoint || provider.tokenUrl}`;
    const existing = providerRotations.get(key);
    if (
        existing?.previous.access === credentials.access &&
        existing.previous.refresh === credentials.refresh
    ) {
        const next = await existing.result;
        if (!isExpired(next, Date.now())) return next;
        credentials = next;
    }
    const entry = {
        previous: credentials,
        result: refreshCredentials(credentials, provider, { now: Date.now(), fetchImpl }),
    };
    providerRotations.set(key, entry);
    void entry.result.catch(() => {
        if (providerRotations.get(key) === entry) providerRotations.delete(key);
    });
    return entry.result;
}

/** Refresh before expiry, retry a rejected bearer once, and never turn transient failures
 * into sign-outs. Persistence completes before requests proceed with rotated credentials. */
export function createAuthenticatedOAuthFetch(
    opts: OAuthLifecycle & {
        credentials: OAuthCredentials;
        provider: OAuthProviderConfig;
        fetchImpl?: typeof fetch;
        tokenFetchImpl?: typeof fetch;
    }
): typeof fetch {
    let credentials = opts.credentials;
    let inflight: Promise<void> | undefined;
    const fetchImpl = opts.fetchImpl ?? fetch;
    const tokenFetchImpl = opts.tokenFetchImpl ?? fetchImpl;
    const refresh = () => {
        if (!inflight) {
            const previous = credentials;
            inflight = refreshShared(previous, opts.provider, tokenFetchImpl)
                .then(async next => {
                    await opts.onTokenRefresh?.(next, previous);
                    credentials = next;
                })
                .finally(() => {
                    inflight = undefined;
                });
        }
        return inflight;
    };
    const request = (url: RequestInfo | URL, options?: RequestInit) => {
        const headers = new Headers(options?.headers);
        headers.set('Authorization', `Bearer ${credentials.access}`);
        if (opts.provider.id === 'codex' && credentials.accountId) {
            headers.set('ChatGPT-Account-Id', credentials.accountId);
        }
        const headerRecord: Record<string, string> = {};
        headers.forEach((value, key) => {
            headerRecord[key] = value;
        });
        return fetchImpl(url, { ...options, headers: headerRecord });
    };
    return async (url, options) => {
        try {
            if (isExpired(credentials, Date.now())) await refresh();
            const sent = credentials;
            let response = await request(url, options);
            if (response.status !== 401) return response;
            // A delayed 401 must not rotate again after another request already refreshed.
            if (credentials.access === sent.access) await refresh();
            response = await request(url, options);
            if (response.status === 401) throw new OAuthAuthorizationError();
            return response;
        } catch (error) {
            if (error instanceof OAuthAuthorizationError) {
                await opts.onAuthInvalid?.(credentials);
            }
            throw error;
        }
    };
}
