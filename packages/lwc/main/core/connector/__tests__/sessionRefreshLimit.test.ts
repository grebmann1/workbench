import assert from 'node:assert/strict';
import { test } from 'node:test';

const { applySessionRefreshLimit, isSalesforceApiBlocked } = await import('../sessionRefreshLimit');

const makeConn = ({ responses }: { responses: Array<{ statusCode: number; body?: unknown }> }) => {
    const remaining = [...responses];
    const conn = {
        calls: 0,
        _transport: {
            httpRequest(_request: unknown) {
                conn.calls += 1;
                const response = remaining.shift() || { statusCode: 200 };
                const promise = Promise.resolve(response) as Promise<{ statusCode: number }> & {
                    stream?: () => string;
                };
                promise.stream = () => 'stream';
                return promise;
            },
        },
    };
    return conn;
};

test('applySessionRefreshLimit: generic 401s pass through to jsforce', async () => {
    const conn = makeConn({
        responses: [{ statusCode: 401 }, { statusCode: 401 }],
    });
    applySessionRefreshLimit(conn);

    assert.equal((await conn._transport.httpRequest({})).statusCode, 401);
    assert.equal((await conn._transport.httpRequest({})).statusCode, 401);
    assert.equal(conn.calls, 2);
    assert.equal(isSalesforceApiBlocked(conn), false);
});

test('applySessionRefreshLimit: preserves StreamPromise.stream()', async () => {
    const conn = makeConn({ responses: [{ statusCode: 200 }] });
    applySessionRefreshLimit(conn);
    const result = conn._transport.httpRequest({});
    assert.equal(typeof result.stream, 'function');
    assert.equal(result.stream(), 'stream');
    assert.equal((await result).statusCode, 200);
});

test('applySessionRefreshLimit: BlackTab 401 fails immediately and latches', async () => {
    const body = JSON.stringify([
        {
            message: 'BlackTab users cannot perform API operations',
            errorCode: 'INVALID_SESSION_ID',
        },
    ]);
    const conn = makeConn({
        responses: [{ statusCode: 401, body }],
    });
    applySessionRefreshLimit(conn);

    await assert.rejects(
        async () => {
            await conn._transport.httpRequest({});
        },
        { message: 'BlackTab users cannot perform API operations' }
    );
    assert.equal(conn.calls, 1);
    assert.equal(isSalesforceApiBlocked(conn), true);

    await assert.rejects(
        async () => {
            await conn._transport.httpRequest({});
        },
        { message: 'BlackTab users cannot perform API operations' }
    );
    assert.equal(conn.calls, 1);
});

test('applySessionRefreshLimit: is a no-op without a transport and is idempotent', async () => {
    const empty = {};
    assert.equal(applySessionRefreshLimit(empty), empty);
    const conn = makeConn({
        responses: [{ statusCode: 200 }, { statusCode: 200 }],
    });
    applySessionRefreshLimit(conn);
    applySessionRefreshLimit(conn);
    assert.equal((await conn._transport.httpRequest({})).statusCode, 200);
    assert.equal((await conn._transport.httpRequest({})).statusCode, 200);
    assert.equal(conn.calls, 2);
});
