import { isChromeExtension } from 'shared/utils';

type McpProxyResponse = {
    ok?: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string;
    error?: string;
};

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
    if (!headers) {
        return {};
    }
    if (headers instanceof Headers) {
        const result: Record<string, string> = {};
        headers.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers.map(([key, value]) => [key, value]));
    }
    return Object.entries(headers).reduce<Record<string, string>>((acc, [key, value]) => {
        if (value != null) {
            acc[key] = String(value);
        }
        return acc;
    }, {});
}

async function bodyToString(body: BodyInit | null | undefined): Promise<string | undefined> {
    if (body == null) {
        return undefined;
    }
    if (typeof body === 'string') {
        return body;
    }
    if (body instanceof URLSearchParams) {
        return body.toString();
    }
    if (body instanceof Blob) {
        return await body.text();
    }
    if (body instanceof ArrayBuffer) {
        return new TextDecoder().decode(body);
    }
    if (ArrayBuffer.isView(body)) {
        return new TextDecoder().decode(body);
    }
    throw new Error('Unsupported MCP request body type');
}

function sendMcpProxyMessage(message: Record<string, unknown>): Promise<McpProxyResponse> {
    return new Promise((resolve, reject) => {
        const runtime = chrome.runtime as typeof chrome.runtime & {
            sendMessage: (
                payload: Record<string, unknown>,
                callback: (response: McpProxyResponse) => void
            ) => void;
            lastError?: { message?: string };
        };
        runtime.sendMessage(message, response => {
            const runtimeError = runtime.lastError;
            if (runtimeError) {
                reject(new Error(runtimeError.message));
                return;
            }
            resolve(response || {});
        });
    });
}

async function resolveRequestParts(input: RequestInfo | URL, init?: RequestInit) {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    const method = init?.method || request?.method || 'GET';
    const headers = {
        ...headersToRecord(request?.headers),
        ...headersToRecord(init?.headers),
    };
    const body = await bodyToString((init?.body as BodyInit | null | undefined) ?? null);
    return { url, method, headers, body };
}

export function createMcpFetch(timeoutMs = 30000): typeof fetch {
    return async (input, init) => {
        if (!isChromeExtension()) {
            return globalThis.fetch(input, init);
        }

        const { url, method, headers, body } = await resolveRequestParts(input, init);
        const response = await sendMcpProxyMessage({
            action: 'mcp_http_request',
            url,
            method,
            headers,
            body,
            timeoutMs,
        });

        if (response.error) {
            throw new Error(response.error);
        }

        return new Response(response.body || '', {
            status: response.status || 200,
            statusText: response.statusText || '',
            headers: response.headers || {},
        });
    };
}
