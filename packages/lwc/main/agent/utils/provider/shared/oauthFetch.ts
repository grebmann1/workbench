import type { OAuthCredentials } from 'shared/llm';
import { isExpired, refreshCredentials, type OAuthProviderConfig } from 'shared/oauth';

import { createSanitizedFetch, type FormattedRequest } from './fetch';

type FormatRequestFn = (url: RequestInfo | URL, options?: RequestInit) => FormattedRequest;

/** Normalize any HeadersInit to a plain object so `createSanitizedFetch` (which iterates with
 *  Object.entries) keeps our Authorization override. */
function toHeaderObject(headers: HeadersInit | undefined): Record<string, string> {
    if (!headers) return {};
    if (headers instanceof Headers) {
        const result: Record<string, string> = {};
        headers.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return { ...(headers as Record<string, string>) };
}

/**
 * Build a fetch that keeps an OAuth access token fresh for the life of a provider instance:
 *
 *  - Overrides the `Authorization` header with the *current* access token on every request,
 *    so requests after a refresh use the new token (the SDK only knows the token from
 *    instance-creation time).
 *  - Proactively refreshes when the stored token is at/after its (skew-adjusted) expiry.
 *  - Reactively refreshes once and retries on a `401`.
 *  - De-duplicates concurrent refreshes via a single in-flight promise (parallel tool calls
 *    don't stampede the token endpoint).
 *  - Calls `onTokenRefresh` with the new credentials so the caller can persist them (refresh
 *    tokens may rotate, so the new one must be stored).
 *
 * Refresh failures are swallowed and the original/last response is returned, so the caller
 * surfaces a normal auth error and can prompt re-authentication.
 */
export function createOAuthFetch(opts: {
    provider: OAuthProviderConfig;
    credentials: OAuthCredentials;
    onTokenRefresh?: (credentials: OAuthCredentials) => void;
    formatRequest?: FormatRequestFn;
}) {
    let credentials = opts.credentials;
    let inflight: Promise<OAuthCredentials> | null = null;
    const sanitizedFetch = createSanitizedFetch(
        opts.formatRequest ? { formatRequest: opts.formatRequest } : {}
    );

    function refresh(): Promise<OAuthCredentials> {
        if (!inflight) {
            inflight = refreshCredentials(credentials, opts.provider, { now: Date.now() })
                .then(next => {
                    credentials = next;
                    opts.onTokenRefresh?.(next);
                    return next;
                })
                .finally(() => {
                    inflight = null;
                });
        }
        return inflight;
    }

    function withAuth(options: RequestInit | undefined): RequestInit {
        const headers = toHeaderObject(options?.headers);
        // Drop any existing auth header first. The SDK sets one from `apiKey` (often
        // lowercased as `authorization`); if we then add `Authorization` too, the request
        // carries two auth headers that fetch combines into an unparseable
        // "Bearer x, Bearer y" value — which WHAM rejects with "could not parse your
        // authentication token". We emit exactly one, with the current (possibly refreshed)
        // token.
        for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === 'authorization') delete headers[key];
        }
        headers.Authorization = `Bearer ${credentials.access}`;
        return { ...options, headers };
    }

    return async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
        if (credentials.refresh && isExpired(credentials, Date.now())) {
            try {
                await refresh();
            } catch {
                // Fall through; the request will 401 and surface a re-auth error.
            }
        }
        let response = await sanitizedFetch(url, withAuth(options));
        if (response.status === 401 && credentials.refresh) {
            try {
                await refresh();
                response = await sanitizedFetch(url, withAuth(options));
            } catch {
                // Refresh failed — return the 401 so the caller surfaces re-authentication.
            }
        }
        return response;
    };
}
