import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stub globals used by env detection (isChromeExtension) and the mcp proxy.
(globalThis as unknown as { window: Record<string, unknown> }).window = {};
(globalThis as unknown as { chrome: unknown }).chrome = undefined;

const { createMcpFetch } = await import('../mcpFetch.ts');

function installChromeRuntime(
    handler: (
        message: Record<string, unknown>,
        cb: (response: Record<string, unknown>) => void
    ) => void,
    lastError?: { message: string }
) {
    (globalThis as unknown as { chrome: unknown }).chrome = {
        runtime: {
            id: 'ext-id',
            sendMessage: handler,
            lastError,
        },
    };
}

function removeChromeRuntime() {
    (globalThis as unknown as { chrome: unknown }).chrome = undefined;
}

test('createMcpFetch: falls back to globalThis.fetch outside chrome extension', async () => {
    removeChromeRuntime();
    const calls: Array<[unknown, unknown]> = [];
    const original = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (
        input: unknown,
        init: unknown
    ) => {
        calls.push([input, init]);
        return new Response('plain fetch', { status: 200 });
    };
    try {
        const mcpFetch = createMcpFetch();
        const res = await mcpFetch('https://example.com/mcp', { method: 'POST' });
        assert.equal(await res.text(), 'plain fetch');
        assert.equal(calls.length, 1);
    } finally {
        (globalThis as unknown as { fetch: unknown }).fetch = original;
    }
});

test('createMcpFetch: routes through chrome.runtime proxy when isChromeExtension', async () => {
    let captured: Record<string, unknown> | undefined;
    installChromeRuntime((message, cb) => {
        captured = message;
        cb({ status: 201, body: 'proxy body', headers: { 'x-mark': '1' } });
    });
    try {
        const mcpFetch = createMcpFetch();
        const res = await mcpFetch('https://example.com/mcp', {
            method: 'POST',
            headers: { Authorization: 'Bearer abc' },
            body: '{"jsonrpc":"2.0"}',
        });
        assert.equal(res.status, 201);
        assert.equal(await res.text(), 'proxy body');
        assert.equal(captured!.action, 'mcp_http_request');
        assert.equal(captured!.url, 'https://example.com/mcp');
        assert.equal(captured!.method, 'POST');
        assert.equal((captured!.headers as Record<string, string>).Authorization, 'Bearer abc');
        assert.equal(captured!.body, '{"jsonrpc":"2.0"}');
        assert.equal(captured!.timeoutMs, 30000);
    } finally {
        removeChromeRuntime();
    }
});

test('createMcpFetch: honours custom timeoutMs', async () => {
    let captured: Record<string, unknown> | undefined;
    installChromeRuntime((message, cb) => {
        captured = message;
        cb({ body: 'ok' });
    });
    try {
        const mcpFetch = createMcpFetch(5000);
        await mcpFetch('https://x');
        assert.equal(captured!.timeoutMs, 5000);
    } finally {
        removeChromeRuntime();
    }
});

test('createMcpFetch: propagates chrome.runtime.lastError as a rejected promise', async () => {
    installChromeRuntime(
        (_message, cb) => cb({}),
        { message: 'runtime explosion' }
    );
    try {
        const mcpFetch = createMcpFetch();
        await assert.rejects(() => mcpFetch('https://x'), /runtime explosion/);
    } finally {
        removeChromeRuntime();
    }
});

test('createMcpFetch: throws when proxy returns error field', async () => {
    installChromeRuntime((_message, cb) => cb({ error: 'upstream failure' }));
    try {
        const mcpFetch = createMcpFetch();
        await assert.rejects(() => mcpFetch('https://x'), /upstream failure/);
    } finally {
        removeChromeRuntime();
    }
});

test('createMcpFetch: defaults status 200 when proxy omits it', async () => {
    installChromeRuntime((_message, cb) => cb({ body: 'hi' }));
    try {
        const mcpFetch = createMcpFetch();
        const res = await mcpFetch('https://x');
        assert.equal(res.status, 200);
        assert.equal(await res.text(), 'hi');
    } finally {
        removeChromeRuntime();
    }
});

test('createMcpFetch: merges headers from Request and init', async () => {
    let captured: Record<string, unknown> | undefined;
    installChromeRuntime((message, cb) => {
        captured = message;
        cb({ body: '' });
    });
    try {
        const mcpFetch = createMcpFetch();
        const req = new Request('https://x', { method: 'GET', headers: { 'x-a': '1' } });
        await mcpFetch(req, { headers: { 'x-b': '2' } });
        const headers = captured!.headers as Record<string, string>;
        assert.equal(headers['x-a'], '1');
        assert.equal(headers['x-b'], '2');
    } finally {
        removeChromeRuntime();
    }
});

test('createMcpFetch: serializes URLSearchParams body to a string', async () => {
    let captured: Record<string, unknown> | undefined;
    installChromeRuntime((message, cb) => {
        captured = message;
        cb({ body: '' });
    });
    try {
        const mcpFetch = createMcpFetch();
        await mcpFetch('https://x', {
            method: 'POST',
            body: new URLSearchParams({ a: '1', b: 'two' }),
        });
        assert.equal(captured!.body, 'a=1&b=two');
    } finally {
        removeChromeRuntime();
    }
});
