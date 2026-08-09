import assert from 'node:assert/strict';
import { test } from 'node:test';

function makeChrome({ storedConfig = {} } = {}) {
    const calls = { storageGet: [] };
    globalThis.chrome = {
        runtime: {
            getURL: path => `chrome-extension://abc123/${path}`,
        },
        storage: {
            local: {
                get: keys => {
                    calls.storageGet.push(keys);
                    return Promise.resolve(storedConfig);
                },
            },
        },
    };
    return calls;
}

const EXTENSION_SENDER = { url: 'chrome-extension://abc123/panel.html' };

const { handleMcpHttpRequest } = await import('../mcpProxy.js');

function makeFetchSpy({ response, throws } = {}) {
    const calls = [];
    const fetchSpy = (url, init) => {
        calls.push({ url, init });
        if (throws) return Promise.reject(throws);
        return Promise.resolve(
            response || {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: new Map(),
                text: async () => 'body',
            }
        );
    };
    return { fetchSpy, calls };
}

function withFetch(fetchSpy, fn) {
    const orig = globalThis.fetch;
    globalThis.fetch = fetchSpy;
    return Promise.resolve()
        .then(fn)
        .finally(() => {
            globalThis.fetch = orig;
        });
}

// --- sender validation ---

test('handleMcpHttpRequest: rejects when sender is missing', async () => {
    makeChrome();
    const result = await handleMcpHttpRequest({
        message: { url: 'https://mcp.example.com/api' },
        sender: undefined,
    });
    assert.deepEqual(result, { error: 'Untrusted sender' });
});

test('handleMcpHttpRequest: rejects when sender url is not an extension page', async () => {
    makeChrome();
    const result = await handleMcpHttpRequest({
        message: { url: 'https://mcp.example.com/api' },
        sender: { url: 'https://evil.example.com/panel.html' },
    });
    assert.deepEqual(result, { error: 'Untrusted sender' });
});

test('handleMcpHttpRequest: accepts a valid extension-page sender (passes sender check)', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy } = makeFetchSpy();
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: { url: 'https://mcp.example.com/api' },
            sender: EXTENSION_SENDER,
        })
    );
    assert.equal(result.error, undefined);
    assert.equal(result.ok, true);
});

// --- method allowlist ---

test('handleMcpHttpRequest: allows GET/POST/PUT/PATCH/DELETE', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'get']) {
        makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
        const { fetchSpy, calls } = makeFetchSpy();
        const result = await withFetch(fetchSpy, () =>
            handleMcpHttpRequest({
                message: { url: 'https://mcp.example.com/api', method },
                sender: EXTENSION_SENDER,
            })
        );
        assert.equal(result.error, undefined, `method ${method} should be allowed`);
        assert.equal(calls[0].init.method, method.toUpperCase());
    }
});

test('handleMcpHttpRequest: rejects disallowed HTTP method', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const result = await handleMcpHttpRequest({
        message: { url: 'https://mcp.example.com/api', method: 'TRACE' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'Invalid MCP request' });
});

test('handleMcpHttpRequest: rejects when url is missing', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const result = await handleMcpHttpRequest({
        message: { method: 'GET' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'Invalid MCP request' });
});

// --- URL allowlist ---

test('handleMcpHttpRequest: allows a URL matching a configured MCP server', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy } = makeFetchSpy();
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: { url: 'https://mcp.example.com/api' },
            sender: EXTENSION_SENDER,
        })
    );
    assert.equal(result.ok, true);
});

test('handleMcpHttpRequest: rejects a URL not present in the allowlist', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const result = await handleMcpHttpRequest({
        message: { url: 'https://not-configured.example.com/api' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'MCP server URL is not configured' });
});

test('handleMcpHttpRequest: rejects when no MCP servers are configured', async () => {
    makeChrome({ storedConfig: {} });
    const result = await handleMcpHttpRequest({
        message: { url: 'https://mcp.example.com/api' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'MCP server URL is not configured' });
});

test('handleMcpHttpRequest: rejects malformed request URLs gracefully', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const result = await handleMcpHttpRequest({
        message: { url: 'not a url at all' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'MCP server URL is not configured' });
});

test('handleMcpHttpRequest: ignores malformed entries in the server allowlist', async () => {
    makeChrome({
        storedConfig: { mcp_servers: [null, 'not-an-object', { name: 'no-url' }, { url: 42 }] },
    });
    const result = await handleMcpHttpRequest({
        message: { url: 'https://mcp.example.com/api' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'MCP server URL is not configured' });
});

test('handleMcpHttpRequest: allows a request URL with trailing slash matching a server without one (normalization)', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy } = makeFetchSpy();
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: { url: 'https://mcp.example.com/api/' },
            sender: EXTENSION_SENDER,
        })
    );
    assert.equal(result.ok, true);
});

test('handleMcpHttpRequest: allows a request URL with different query/hash but same origin+path as server (path match ignores query/hash)', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy } = makeFetchSpy();
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: { url: 'https://mcp.example.com/api?foo=bar#frag' },
            sender: EXTENSION_SENDER,
        })
    );
    assert.equal(result.ok, true);
});

test('handleMcpHttpRequest: allows any path on the same origin as a configured server (origin fallback match)', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy } = makeFetchSpy();
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: { url: 'https://mcp.example.com/other-path' },
            sender: EXTENSION_SENDER,
        })
    );
    assert.equal(result.ok, true);
});

test('handleMcpHttpRequest: rejects credentials embedded in the request URL', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const result = await handleMcpHttpRequest({
        message: { url: 'https://user:pass@mcp.example.com/api' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'MCP server URL is not configured' });
});

test('handleMcpHttpRequest: rejects non-http(s) protocols such as file:', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const result = await handleMcpHttpRequest({
        message: { url: 'file:///etc/passwd' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'MCP server URL is not configured' });
});

test('handleMcpHttpRequest: rejects plain http to a non-local host even if configured (server itself would fail normalization)', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'http://mcp.example.com/api' }] } });
    const result = await handleMcpHttpRequest({
        message: { url: 'http://mcp.example.com/api' },
        sender: EXTENSION_SENDER,
    });
    assert.deepEqual(result, { error: 'MCP server URL is not configured' });
});

test('handleMcpHttpRequest: allows plain http to localhost when configured', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'http://localhost:3000/mcp' }] } });
    const { fetchSpy } = makeFetchSpy();
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: { url: 'http://localhost:3000/mcp' },
            sender: EXTENSION_SENDER,
        })
    );
    assert.equal(result.ok, true);
});

// --- timeout clamping ---

test('handleMcpHttpRequest: defaults to a 30s timeout when unspecified', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const setTimeoutCalls = [];
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, delay) => {
        setTimeoutCalls.push(delay);
        return origSetTimeout(fn, delay);
    };
    const { fetchSpy } = makeFetchSpy();
    try {
        await withFetch(fetchSpy, () =>
            handleMcpHttpRequest({
                message: { url: 'https://mcp.example.com/api' },
                sender: EXTENSION_SENDER,
            })
        );
    } finally {
        globalThis.setTimeout = origSetTimeout;
    }
    assert.ok(setTimeoutCalls.includes(30000), `expected 30000 among ${setTimeoutCalls}`);
});

test('handleMcpHttpRequest: clamps timeoutMs below 1000 up to 1000', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const setTimeoutCalls = [];
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, delay) => {
        setTimeoutCalls.push(delay);
        return origSetTimeout(fn, delay);
    };
    const { fetchSpy } = makeFetchSpy();
    try {
        await withFetch(fetchSpy, () =>
            handleMcpHttpRequest({
                message: { url: 'https://mcp.example.com/api', timeoutMs: 10 },
                sender: EXTENSION_SENDER,
            })
        );
    } finally {
        globalThis.setTimeout = origSetTimeout;
    }
    assert.ok(setTimeoutCalls.includes(1000), `expected 1000 among ${setTimeoutCalls}`);
});

test('handleMcpHttpRequest: clamps timeoutMs above 120000 down to 120000', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const setTimeoutCalls = [];
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, delay) => {
        setTimeoutCalls.push(delay);
        return origSetTimeout(fn, delay);
    };
    const { fetchSpy } = makeFetchSpy();
    try {
        await withFetch(fetchSpy, () =>
            handleMcpHttpRequest({
                message: { url: 'https://mcp.example.com/api', timeoutMs: 999999 },
                sender: EXTENSION_SENDER,
            })
        );
    } finally {
        globalThis.setTimeout = origSetTimeout;
    }
    assert.ok(setTimeoutCalls.includes(120000), `expected 120000 among ${setTimeoutCalls}`);
});

test('handleMcpHttpRequest: non-numeric timeoutMs falls back to default 30000', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const setTimeoutCalls = [];
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, delay) => {
        setTimeoutCalls.push(delay);
        return origSetTimeout(fn, delay);
    };
    const { fetchSpy } = makeFetchSpy();
    try {
        await withFetch(fetchSpy, () =>
            handleMcpHttpRequest({
                message: { url: 'https://mcp.example.com/api', timeoutMs: 'soon' },
                sender: EXTENSION_SENDER,
            })
        );
    } finally {
        globalThis.setTimeout = origSetTimeout;
    }
    assert.ok(setTimeoutCalls.includes(30000), `expected 30000 among ${setTimeoutCalls}`);
});

// --- fetch behavior / response shape ---

test('handleMcpHttpRequest: issues fetch with redirect: error and passes through headers/body', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy, calls } = makeFetchSpy({
        response: {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: new Map([['content-type', 'application/json']]),
            text: async () => '{"err":true}',
        },
    });
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: {
                url: 'https://mcp.example.com/api',
                method: 'POST',
                headers: { 'x-api-key': 'secret' },
                body: '{"a":1}',
            },
            sender: EXTENSION_SENDER,
        })
    );
    assert.equal(calls[0].init.redirect, 'error');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(calls[0].init.headers, { 'x-api-key': 'secret' });
    assert.equal(calls[0].init.body, '{"a":1}');
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(result.statusText, 'Not Found');
    assert.equal(result.body, '{"err":true}');
});

test('handleMcpHttpRequest: ignores non-object headers and non-string body', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy, calls } = makeFetchSpy();
    await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: {
                url: 'https://mcp.example.com/api',
                headers: ['not', 'an', 'object'],
                body: { not: 'a string' },
            },
            sender: EXTENSION_SENDER,
        })
    );
    assert.deepEqual(calls[0].init.headers, {});
    assert.equal(calls[0].init.body, undefined);
});

test('handleMcpHttpRequest: returns an error object when fetch rejects (e.g. abort/timeout)', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const { fetchSpy } = makeFetchSpy({ throws: new Error('The operation was aborted') });
    const result = await withFetch(fetchSpy, () =>
        handleMcpHttpRequest({
            message: { url: 'https://mcp.example.com/api' },
            sender: EXTENSION_SENDER,
        })
    );
    assert.deepEqual(result, { error: 'The operation was aborted' });
});

test('handleMcpHttpRequest: safeDebug is invoked on rejection paths', async () => {
    makeChrome({ storedConfig: { mcp_servers: [{ url: 'https://mcp.example.com/api' }] } });
    const debugCalls = [];
    await handleMcpHttpRequest({
        message: { url: 'https://mcp.example.com/api' },
        sender: { url: 'https://evil.example.com' },
        safeDebug: (...args) => debugCalls.push(args),
    });
    assert.equal(debugCalls.length, 1);
    assert.match(debugCalls[0][0], /untrusted sender/i);
});
