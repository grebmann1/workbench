import type { OAuthCredentials } from 'shared/llm';
import {
    createAuthenticatedOAuthFetch,
    type OAuthLifecycle,
    type OAuthProviderConfig,
} from 'shared/oauth';

import { createSanitizedFetch, type FormattedRequest } from './fetch';

type FormatRequestFn = (url: RequestInfo | URL, options?: RequestInit) => FormattedRequest;

/** Runtime formatting stays local; catalog and runtime share OAuth renewal and retry logic. */
export function createOAuthFetch(
    opts: OAuthLifecycle & {
        provider: OAuthProviderConfig;
        credentials: OAuthCredentials;
        formatRequest?: FormatRequestFn;
    }
) {
    return createAuthenticatedOAuthFetch({
        ...opts,
        fetchImpl: createSanitizedFetch(
            opts.formatRequest ? { formatRequest: opts.formatRequest } : {}
        ),
        tokenFetchImpl: fetch,
    });
}
