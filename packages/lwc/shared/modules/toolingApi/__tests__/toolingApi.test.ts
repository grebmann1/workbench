import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolingClient } from '../toolingApi.ts';
import { HttpError } from 'shared/types';

function makeJsforceConnection(overrides: Record<string, unknown> = {}) {
    const queryRuns: string[] = [];
    const requestCalls: unknown[] = [];
    const conn = {
        instanceUrl: 'https://my.my.salesforce.com',
        accessToken: 'TOKEN',
        version: '60.0',
        request: async (options: unknown) => {
            requestCalls.push(options);
            return (overrides.requestResult as unknown) ?? { ok: true };
        },
        tooling: {
            query: (soql: string) => {
                queryRuns.push(soql);
                return {
                    run: async () =>
                        (overrides.queryRecords as unknown) ?? [{ Id: '001', Name: 'Foo' }],
                };
            },
        },
    };
    return { conn, queryRuns, requestCalls };
}

test('createToolingClient: throws on missing instanceUrl (fetch-mode)', () => {
    assert.throws(() => createToolingClient({ accessToken: 'T' }), /Missing Instance URL/);
});

test('createToolingClient: throws on missing accessToken (fetch-mode)', () => {
    assert.throws(
        () => createToolingClient({ instanceUrl: 'foo.my.salesforce.com' }),
        /Missing Access Token/
    );
});

test('createToolingClient: jsforce path rejects incomplete connection', () => {
    assert.throws(
        () =>
            createToolingClient({
                connection: {
                    instanceUrl: 'https://x.my.salesforce.com',
                    accessToken: 'T',
                    version: '60.0',
                } as unknown as never,
            }),
        /jsforce connection is missing required request\/tooling methods/
    );
});

test('createToolingClient: jsforce path exposes normalized fields + null proxy', () => {
    const { conn } = makeJsforceConnection();
    const client = createToolingClient({ connection: conn, apiVersion: '61.0' });
    assert.equal(client.instanceUrl, 'https://my.my.salesforce.com');
    assert.equal(client.apiVersion, '61.0');
    assert.equal(client.proxyUrl, null);
});

test('jsforce path: listApexClasses runs the expected SOQL', async () => {
    const { conn, queryRuns } = makeJsforceConnection();
    const client = createToolingClient({ connection: conn });
    const result = await client.listApexClasses();
    assert.equal(queryRuns.length, 1);
    assert.equal(queryRuns[0], 'SELECT Id, Name FROM ApexClass ORDER BY Name');
    assert.deepEqual(result, [{ Id: '001', Name: 'Foo' }]);
});

test('jsforce path: getApexClassBody returns first row or null', async () => {
    const { conn: conn1 } = makeJsforceConnection({ queryRecords: [{ Id: '1', Body: 'x' }] });
    const client1 = createToolingClient({ connection: conn1 });
    assert.deepEqual(await client1.getApexClassBody('1'), { Id: '1', Body: 'x' });

    const { conn: conn2 } = makeJsforceConnection({ queryRecords: [] });
    const client2 = createToolingClient({ connection: conn2 });
    assert.equal(await client2.getApexClassBody('none'), null);
});

test('jsforce path: ping issues an ApexClass probe and returns true', async () => {
    const { conn, queryRuns } = makeJsforceConnection();
    const client = createToolingClient({ connection: conn });
    assert.equal(await client.ping(), true);
    assert.ok(queryRuns[0].includes('ApexClass'));
});

test('jsforce path: requestJson uses /services/data/v{ver} prefix', async () => {
    const { conn, requestCalls } = makeJsforceConnection();
    const client = createToolingClient({ connection: conn, apiVersion: '60.0' });
    await client.requestJson('/sobjects/Account');
    assert.equal(requestCalls.length, 1);
    const options = requestCalls[0] as { url: string; method: string };
    assert.equal(options.method, 'GET');
    assert.equal(options.url, '/services/data/v60.0/sobjects/Account');
});

test('jsforce path: requestJson leaves /services/data paths untouched', async () => {
    const { conn, requestCalls } = makeJsforceConnection();
    const client = createToolingClient({ connection: conn });
    await client.requestJson('/services/data/v58.0/sobjects/Contact');
    const options = requestCalls[0] as { url: string };
    assert.equal(options.url, '/services/data/v58.0/sobjects/Contact');
});

test('jsforce path: requestJson serializes JSON body and sets content type', async () => {
    const { conn, requestCalls } = makeJsforceConnection();
    const client = createToolingClient({ connection: conn });
    await client.requestJson('/tooling/sobjects/ApexClass', {
        method: 'POST',
        body: { Name: 'Foo' },
    });
    const options = requestCalls[0] as {
        method: string;
        body: string;
        headers: Record<string, string>;
    };
    assert.equal(options.method, 'POST');
    assert.equal(options.body, JSON.stringify({ Name: 'Foo' }));
    assert.equal(options.headers['Content-Type'], 'application/json');
});

test('jsforce path: requestText stringifies non-string responses', async () => {
    const { conn } = makeJsforceConnection({ requestResult: { hello: 'world' } });
    const client = createToolingClient({ connection: conn });
    const text = await client.requestText('/tooling/query');
    assert.equal(text, '{"hello":"world"}');
});

// --- fetch-mode tests ---------------------------------------------------

function mockFetch(response: {
    ok?: boolean;
    status?: number;
    text: string;
}) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const original = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (
        url: string,
        init?: RequestInit
    ) => {
        calls.push({ url, init });
        return {
            ok: response.ok ?? true,
            status: response.status ?? 200,
            text: async () => response.text,
        } as Response;
    };
    return {
        calls,
        restore: () => {
            (globalThis as unknown as { fetch: unknown }).fetch = original;
        },
    };
}

test('fetch-mode: requestJson hits /services/data/v{ver} with Bearer token', async () => {
    const { calls, restore } = mockFetch({
        text: JSON.stringify({ records: [], done: true }),
    });
    try {
        const client = createToolingClient({
            instanceUrl: 'foo.my.salesforce.com',
            accessToken: 'abc',
            apiVersion: '60.0',
        });
        const out = (await client.requestJson('/query?q=SELECT+Id+FROM+Account')) as {
            done: boolean;
        };
        assert.equal(out.done, true);
        assert.equal(calls.length, 1);
        assert.equal(
            calls[0].url,
            'https://foo.my.salesforce.com/services/data/v60.0/query?q=SELECT+Id+FROM+Account'
        );
        const headers = calls[0].init!.headers as Record<string, string>;
        assert.equal(headers.Authorization, 'Bearer abc');
    } finally {
        restore();
    }
});

test('fetch-mode: requestJson routes through proxy with Salesforceproxy-Endpoint', async () => {
    const { calls, restore } = mockFetch({ text: '{}' });
    try {
        const client = createToolingClient({
            instanceUrl: 'foo.my.salesforce.com',
            accessToken: 'abc',
            apiVersion: '60.0',
            proxyUrl: 'https://proxy.example',
        });
        await client.requestJson('/query');
        assert.equal(calls[0].url, 'https://proxy.example/proxy/services/data/v60.0/query');
        const headers = calls[0].init!.headers as Record<string, string>;
        assert.equal(
            headers['Salesforceproxy-Endpoint'],
            'https://foo.my.salesforce.com/services/data/v60.0/query'
        );
    } finally {
        restore();
    }
});

test('fetch-mode: requestJson raises HttpError on non-ok status', async () => {
    const { restore } = mockFetch({
        ok: false,
        status: 400,
        text: JSON.stringify([{ errorCode: 'INVALID', message: 'bad' }]),
    });
    try {
        const client = createToolingClient({
            instanceUrl: 'foo.my.salesforce.com',
            accessToken: 'abc',
        });
        await assert.rejects(
            client.requestJson('/query'),
            (err: unknown) => {
                assert.ok(err instanceof HttpError);
                assert.equal((err as HttpError).status, 400);
                assert.match((err as Error).message, /INVALID/);
                assert.match((err as Error).message, /bad/);
                return true;
            }
        );
    } finally {
        restore();
    }
});

test('fetch-mode: requestText returns raw body', async () => {
    const { restore } = mockFetch({ text: 'raw body' });
    try {
        const client = createToolingClient({
            instanceUrl: 'foo.my.salesforce.com',
            accessToken: 'abc',
        });
        const body = await client.requestText('/tooling/sobjects');
        assert.equal(body, 'raw body');
    } finally {
        restore();
    }
});

test('fetch-mode: toolingQueryAll concatenates paginated records', async () => {
    const responses = [
        JSON.stringify({
            records: [{ Id: '1' }, { Id: '2' }],
            nextRecordsUrl: '/services/data/v60.0/query/more',
            done: false,
        }),
        JSON.stringify({ records: [{ Id: '3' }], done: true }),
    ];
    const calls: string[] = [];
    const original = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => {
        calls.push(url);
        const text = responses.shift() ?? '{}';
        return { ok: true, status: 200, text: async () => text } as Response;
    };
    try {
        const client = createToolingClient({
            instanceUrl: 'foo.my.salesforce.com',
            accessToken: 'abc',
            apiVersion: '60.0',
        });
        const rows = await client.toolingQueryAll('SELECT Id FROM ApexClass');
        assert.equal(rows.length, 3);
        assert.deepEqual(rows, [{ Id: '1' }, { Id: '2' }, { Id: '3' }]);
        assert.equal(calls.length, 2);
    } finally {
        (globalThis as unknown as { fetch: unknown }).fetch = original;
    }
});

test('fetch-mode: CORS-like TypeError gets remapped to friendly error', async () => {
    const original = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async () => {
        const err = new TypeError('Failed to fetch');
        throw err;
    };
    try {
        const client = createToolingClient({
            instanceUrl: 'foo.my.salesforce.com',
            accessToken: 'abc',
        });
        await assert.rejects(
            client.requestJson('/query'),
            /Network\/CORS error calling Salesforce/
        );
    } finally {
        (globalThis as unknown as { fetch: unknown }).fetch = original;
    }
});

test('fetch-mode: CORS-like TypeError mentions proxy when proxy configured', async () => {
    const original = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async () => {
        throw new TypeError('NetworkError when attempting to fetch');
    };
    try {
        const client = createToolingClient({
            instanceUrl: 'foo.my.salesforce.com',
            accessToken: 'abc',
            proxyUrl: 'https://proxy.example',
        });
        await assert.rejects(
            client.requestJson('/query'),
            /Unable to reach local proxy at https:\/\/proxy.example/
        );
    } finally {
        (globalThis as unknown as { fetch: unknown }).fetch = original;
    }
});
