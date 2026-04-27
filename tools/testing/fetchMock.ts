type ResponseInit_ = { status?: number; body?: unknown; headers?: Record<string, string> };
type RouteHandler = (req: { url: string; init?: RequestInit }) => Response | Promise<Response> | ResponseInit_ | Promise<ResponseInit_>;

export interface FetchMockCall {
    url: string;
    init?: RequestInit;
}

export interface FetchMock {
    fetch: typeof fetch;
    calls: FetchMockCall[];
    reset(): void;
    install(target?: { fetch?: typeof fetch }): () => void;
    restore(): void;
}

interface FetchMockOptions {
    routes?: Array<{ match: string | RegExp; handler: RouteHandler }>;
    default?: RouteHandler;
}

function toResponse(result: Response | ResponseInit_): Response {
    if (result instanceof Response) {
        return result;
    }
    const { status = 200, body = '', headers = {} } = result ?? {};
    const payload =
        typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Uint8Array
            ? (body as BodyInit)
            : JSON.stringify(body);
    const finalHeaders = { 'content-type': 'application/json', ...headers };
    return new Response(payload, { status, headers: finalHeaders });
}

function matches(matcher: string | RegExp, url: string) {
    if (matcher instanceof RegExp) return matcher.test(url);
    return url === matcher || url.includes(matcher);
}

export function createFetchMock(options: FetchMockOptions = {}): FetchMock {
    const calls: FetchMockCall[] = [];
    let original: typeof fetch | undefined;
    let installed = false;

    const mockFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
        calls.push({ url, init });
        const route = (options.routes ?? []).find(r => matches(r.match, url));
        const handler = route?.handler ?? options.default;
        if (!handler) {
            throw new Error(`fetchMock: no route for ${url}`);
        }
        const result = await handler({ url, init });
        return toResponse(result);
    }) as typeof fetch;

    return {
        fetch: mockFetch,
        calls,
        reset() {
            calls.length = 0;
        },
        install(target: { fetch?: typeof fetch } = globalThis) {
            if (installed) return this.restore;
            original = target.fetch;
            target.fetch = mockFetch;
            installed = true;
            return () => this.restore();
        },
        restore() {
            if (!installed) return;
            (globalThis as { fetch?: typeof fetch }).fetch = original;
            installed = false;
        },
    };
}
