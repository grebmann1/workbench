import { guid } from '../ids';
import { isUndefinedOrNull, isNotUndefinedOrNull } from '../validation';
export const DEFAULT_API_VERSION = '59.0';
export const VIEWERS = {
    PRETTY: 'Pretty',
    WORKBENCH: 'Workbench',
    RAW: 'Raw',
    PREVIEW: 'Preview',
    SNIPPET: 'Snippet',
};
export const TABS = {
    BODY: 'Body',
    HEADERS: 'Headers',
    VARIABLES: 'Variables',
    DETAILS: 'Details',
};
export const METHOD = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    PATCH: 'PATCH',
    DELETE: 'DELETE',
};
export const DEFAULT = {
    HEADER: 'Content-Type: application/json; charset=UTF-8\nAccept: application/json',
    ENDPOINT: (version) => `/services/data/v${version}`,
    BODY: '',
    METHOD: METHOD.GET,
    VARIABLES: '{}',
};
export const generateDefaultTab = (version, id) => {
    return {
        id: id || guid(),
        header: DEFAULT.HEADER,
        endpoint: DEFAULT.ENDPOINT(version),
        body: DEFAULT.BODY,
        method: DEFAULT.METHOD,
        variables: DEFAULT.VARIABLES,
        actions: [],
        actionPointer: null,
    };
};
export const formattedContentType = (contentType) => {
    if (isUndefinedOrNull(contentType))
        return 'text';
    if (/^(text|application)\/xml(;|$)/.test(contentType)) {
        return 'xml';
    }
    if (/^application\/json(;|$)/.test(contentType)) {
        return 'json';
    }
    if (/^text\/csv(;|$)/.test(contentType)) {
        return 'csv';
    }
    if (/^text\/html(;|$)/.test(contentType)) {
        return 'html';
    }
    if (/^image\/png(;|$)/.test(contentType)) {
        return 'png';
    }
    if (/^image\/jpeg(;|$)/.test(contentType)) {
        return 'jpeg';
    }
    if (/^image\/jpg(;|$)/.test(contentType)) {
        return 'jpg';
    }
    return 'text';
};
export const formatApiRequest = ({ endpoint, method, body, header, connector, replaceVariableValues, }) => {
    let error = null;
    // Apply variable replacement to endpoint
    const replacedEndpoint = replaceVariableValues ? replaceVariableValues(endpoint) : endpoint;
    // Ensure the endpoint starts with a leading slash if not a full URL
    const formattedEndpoint = replacedEndpoint.startsWith('/')
        ? replacedEndpoint
        : `/${replacedEndpoint}`;
    // If the endpoint is a full URL, use it, otherwise, prepend the instance URL
    const targetUrl = replacedEndpoint.startsWith('http')
        ? replacedEndpoint
        : `${connector.conn.instanceUrl}${formattedEndpoint}`;
    // Create the base request object with method and URL
    const request = {
        method,
        url: targetUrl,
        endpoint: formattedEndpoint,
    };
    // Include body for PATCH, POST, or PUT requests
    if ([METHOD.PATCH, METHOD.POST, METHOD.PUT].includes(method)) {
        request.body = replaceVariableValues ? replaceVariableValues(body) : body;
    }
    // Process headers if they are defined
    if (isNotUndefinedOrNull(header)) {
        let headers = {};
        let isValidHeader = true;
        if (typeof header === 'object' && header !== null) {
            // If header is already an object, use it directly
            headers = { ...header };
            if (replaceVariableValues) {
                Object.keys(headers).forEach(key => {
                    headers[key] = replaceVariableValues(headers[key]);
                });
            }
        }
        else if (typeof header === 'string') {
            header
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .forEach(line => {
                const lineArr = line.split(':');
                const firstSegment = lineArr.shift();
                if (lineArr.length >= 1 && firstSegment != null) {
                    const key = firstSegment.trim(); // Get the header name
                    headers[key] = lineArr.join(':').trim(); // Combine the remaining parts of the header value
                    headers[key] = replaceVariableValues
                        ? replaceVariableValues(headers[key])
                        : headers[key];
                }
                else {
                    isValidHeader = false; // Flag invalid header
                }
            });
        }
        else {
            isValidHeader = false;
        }
        // If any headers are invalid, show a toast notification
        if (!isValidHeader) {
            error = 'Invalid Header';
        }
        else {
            // Add headers to the request if valid and not empty
            if (Object.keys(headers).length > 0) {
                request.headers = {
                    ...request.headers,
                    ...headers,
                };
            }
        }
    }
    // Auto-add Sforce-Call-Options when user has set client_id in Settings (do not override if already set)
    const clientId = connector?.conn?._callOptions?.client;
    if (clientId) {
        request.headers = request.headers || {};
        const hasSforceCallOptions = request.headers &&
            Object.keys(request.headers).some(k => k.toLowerCase() === 'sforce-call-options');
        if (!hasSforceCallOptions) {
            request.headers['Sforce-Call-Options'] = 'client=' + clientId;
        }
    }
    return { request, error }; // Return the formatted request object
};
/* -------------------------------------------------------------------------- */
/*  Variable substitution                                                      */
/* -------------------------------------------------------------------------- */
/**
 * Escape a replacement string so that `$&`, `$1`, `$'`, etc. are treated as
 * literals by {@link String.prototype.replace}. Without this, variable values
 * containing `$` sequences corrupt the output.
 */
const escapeReplacement = (value) => value.replace(/\$/g, '$$$$');
/**
 * Escape a substring for use inside a RegExp literal (keys may contain regex
 * metacharacters).
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Replace `{key}` tokens in `input` with values from `variables`. Safe against
 * `$` sequences in replacement values and regex metacharacters in keys.
 * `sessionToken`, when provided, also replaces `{sessionId}` (back-compat with
 * the legacy API app behaviour).
 */
export const substituteVariables = (input, variables, sessionToken) => {
    if (isUndefinedOrNull(input))
        return input;
    let result = String(input);
    Object.keys(variables || {}).forEach(key => {
        const raw = variables[key];
        if (isUndefinedOrNull(raw))
            return;
        const regex = new RegExp(`\\{${escapeRegex(key)}\\}`, 'g');
        result = result.replace(regex, escapeReplacement(String(raw)));
    });
    if (sessionToken) {
        result = result.replace(/\{sessionId\}/g, escapeReplacement(sessionToken));
    }
    return result;
};
/**
 * Parse a variables JSON string defensively. Returns `{}` on parse failure.
 */
export const parseVariables = (raw) => {
    if (isUndefinedOrNull(raw))
        return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
};
/**
 * Canonical HTTP execution path. Consumed by:
 *   - the API app's Redux thunk
 *   - the `api.executeRequest` host-command
 *   - the agent's `api_execute_request` tool
 *   - the desktop CLI `api request ...` verb
 *
 * Pure: no Redux, no logger, no toast. Callers observe aborts via the standard
 * `AbortController.abort()` / `signal.aborted` contract.
 */
export const executeApiRequest = async ({ method, url, headers, body, signal, accessToken, fetchImpl, }) => {
    if (!url) {
        throw new Error('Missing request URL');
    }
    const executionStartDate = Date.now();
    const mergedHeaders = { ...(headers || {}) };
    const hasAuth = Object.keys(mergedHeaders).some(k => k.toLowerCase() === 'authorization');
    if (!hasAuth && accessToken) {
        mergedHeaders.Authorization = `Bearer ${accessToken}`;
    }
    const doFetch = fetchImpl || fetch;
    const res = await doFetch(url, {
        method: method || 'GET',
        headers: mergedHeaders,
        body: body,
        signal,
    });
    const statusCode = res.status;
    const contentHeaders = [];
    res.headers.forEach((value, key) => {
        contentHeaders.push({ key, value });
    });
    const contentType = res.headers.get('content-type') || '';
    // Always read the raw text first so we can preserve an un-parsed copy
    // regardless of content-type (useful for downloads + snippet regeneration).
    const contentRaw = await res.text();
    let content = contentRaw;
    if (formattedContentType(contentType) === 'json') {
        try {
            content = JSON.parse(contentRaw);
        }
        catch {
            content = contentRaw;
        }
    }
    const contentLength = new TextEncoder().encode(typeof content === 'string' ? content : JSON.stringify(content)).length;
    const executionEndDate = Date.now();
    return {
        content,
        contentRaw,
        statusCode,
        contentHeaders,
        contentType,
        contentLength,
        executionStartDate,
        executionEndDate,
    };
};
//# sourceMappingURL=api.js.map