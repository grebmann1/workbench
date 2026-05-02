export type FormattedRequest = {
    url: RequestInfo | URL;
    options?: RequestInit;
};

type FormatRequestFn = (url: RequestInfo | URL, options?: RequestInit) => FormattedRequest;
type TransformResponseFn = (response: Response) => Promise<Response>;

export function normalizeBaseUrl(value: unknown) {
    return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

export function getModelFromRequestBody(body: unknown) {
    if (typeof body !== 'string') {
        return '';
    }
    try {
        const payload = JSON.parse(body);
        return typeof payload?.model === 'string' ? payload.model.trim() : '';
    } catch {
        return '';
    }
}

const identityFormat: FormatRequestFn = (url, options) => ({ url, options });

/**
 * Build a fetch implementation the provider SDKs can hand to their clients.
 *
 * Two optional per-runtime hooks:
 *   - formatRequest:      rewrite URL / body / headers before the network call.
 *   - transformResponse:  rewrite the Response before the SDK parser sees it
 *                         (e.g., AWS eventstream → SSE).
 *
 * Also strips the `cookie` header and forces `credentials: 'omit'` for all requests.
 */
export function createSanitizedFetch(
    hooks: { formatRequest?: FormatRequestFn; transformResponse?: TransformResponseFn } = {}
) {
    const formatRequest = hooks.formatRequest ?? identityFormat;
    const transformResponse = hooks.transformResponse;
    return async (url: RequestInfo | URL, options?: RequestInit) => {
        const formatted = formatRequest(url, options);
        const response = await fetch(formatted.url, {
            ...formatted.options,
            credentials: 'omit',
            headers: {
                ...Object.fromEntries(
                    Object.entries(formatted.options?.headers || {}).filter(
                        ([key]) => key !== 'cookie'
                    )
                ),
            },
        });
        return transformResponse ? transformResponse(response) : response;
    };
}
