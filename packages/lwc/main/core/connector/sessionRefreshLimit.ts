/**
 * jsforce HttpApi now caps session-refresh retries and skips non-refreshable
 * 401 bodies (BlackTab, Agent, REST-API-invalid). This wrapper only latches
 * the transport after those 401s so later `httpRequest` calls throw without
 * hitting the network. Overlay metadata/org fetches cannot keep probing a
 * blocked session.
 */

/** 401 bodies that must not trigger a token refresh (kept in sync with jsforce HttpApi). */
export const NON_REFRESHABLE_401_MARKERS = [
    'BlackTab users cannot perform API operations',
    'Connected app is not attached to Agent',
    'This session is not valid for use with the REST API',
];

function readBodyText(response: unknown) {
    const body = (response as { body?: unknown } | null)?.body;
    if (typeof body === 'string') return body;
    if (body == null) return '';
    try {
        return JSON.stringify(body);
    } catch {
        return String(body);
    }
}

function isNonRefreshable401(response: unknown) {
    const text = readBodyText(response);
    return NON_REFRESHABLE_401_MARKERS.some(marker => text.includes(marker));
}

function asSalesforce401Error(response: unknown) {
    const text = readBodyText(response);
    try {
        const parsed = JSON.parse(text);
        const first = Array.isArray(parsed) ? parsed[0] : parsed;
        if (first && typeof first.message === 'string') {
            const err = new Error(first.message) as Error & {
                errorCode?: string;
                status?: number;
            };
            err.errorCode =
                typeof first.errorCode === 'string' ? first.errorCode : 'INVALID_SESSION_ID';
            err.status = 401;
            return err;
        }
    } catch {
        // fall through to the raw body
    }
    const err = new Error(text || 'Session expired or invalid') as Error & {
        errorCode?: string;
        status?: number;
    };
    err.errorCode = 'INVALID_SESSION_ID';
    err.status = 401;
    return err;
}

function tapHttpRequestResult(
    result: {
        then?: (onFulfilled: (response: unknown) => unknown) => unknown;
        stream?: (...args: unknown[]) => unknown;
    },
    onResponse: (response: unknown) => unknown
) {
    if (!result || typeof result.then !== 'function') {
        return onResponse(result);
    }
    const wrapped = result.then(onResponse);
    if (typeof result.stream === 'function' && wrapped && typeof wrapped === 'object') {
        (wrapped as { stream?: unknown }).stream = result.stream.bind(result);
    }
    return wrapped;
}

type SessionLimitTransport = {
    httpRequest?: (req: unknown, options?: unknown) => unknown;
    _workbenchSessionRefreshLimit?: boolean;
    _workbenchApiBlockedError?: unknown;
};

type SessionLimitConnection = {
    _transport?: SessionLimitTransport;
};

export function isSalesforceApiBlocked(conn: unknown) {
    const transport = (conn as { _transport?: SessionLimitTransport } | null | undefined)
        ?._transport;
    return Boolean(transport?._workbenchApiBlockedError);
}

export function isSalesforceSessionError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const value = error as { status?: unknown; errorCode?: unknown; name?: unknown };
    return (
        value.status === 401 ||
        [value.errorCode, value.name].some(
            code => code === 'INVALID_SESSION_ID' || code === 'ERROR_HTTP_401'
        )
    );
}

function blockSalesforceApi(transport: SessionLimitTransport, err: unknown) {
    transport._workbenchApiBlockedError = err;
}

export const applySessionRefreshLimit = <T>(conn: T): T => {
    const transport = (conn as SessionLimitConnection | null | undefined)?._transport;
    if (!transport || typeof transport.httpRequest !== 'function') return conn;
    if (transport._workbenchSessionRefreshLimit) return conn;
    transport._workbenchSessionRefreshLimit = true;

    const originalHttpRequest = transport.httpRequest.bind(transport);
    transport.httpRequest = (req, options = {}) => {
        if (transport._workbenchApiBlockedError) {
            throw transport._workbenchApiBlockedError;
        }
        const result = originalHttpRequest(req, options) as {
            then?: (onFulfilled: (response: unknown) => unknown) => unknown;
            stream?: (...args: unknown[]) => unknown;
        };
        return tapHttpRequestResult(result, (response: unknown) => {
            const statusCode = (response as { statusCode?: number } | null)?.statusCode;
            if (statusCode === 401 && isNonRefreshable401(response)) {
                const err = asSalesforce401Error(response);
                blockSalesforceApi(transport, err);
                throw err;
            }
            return response;
        });
    };
    return conn;
};
