import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import vm from 'node:vm';
import {
    applySessionRefreshLimit,
    isSalesforceApiBlocked,
    NON_REFRESHABLE_401_MARKERS,
} from '../sessionRefreshLimit.ts';

const require = createRequire(import.meta.url);
const browser = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
});
browser.window = browser;
browser.self = browser;
vm.runInContext(
    readFileSync(
        new URL('../../../../../../assets/extension/libs/jsforce/jsforce.js', import.meta.url),
        'utf8'
    ).replace(/export default jsforce;\s*$/, ''),
    browser
);

function fixture(jsforce, responses, retries) {
    let calls = 0,
        refreshes = 0;
    const conn = new jsforce.Connection({
        instanceUrl: 'https://example.my.salesforce.com',
        accessToken: 'fixture-token',
        refreshToken: 'fixture-refresh',
        version: '60.0',
        oauth2: { clientId: 'fixture-client', loginUrl: 'https://login.salesforce.com' },
    });
    if (retries !== undefined) conn._maxSessionRefreshRetries = retries;
    conn._transport.httpRequest = () => {
        if (++calls > 10) throw new Error('Runaway retry');
        const response = responses[Math.min(calls - 1, responses.length - 1)];
        const promise = Promise.resolve({
            headers: { 'content-type': 'application/json' },
            ...response,
        });
        promise.stream = () => new PassThrough();
        return promise;
    };
    conn.oauth2.refreshToken = async () => {
        refreshes++;
        return {
            access_token: `fixture-refreshed-${refreshes}`,
            instance_url: conn.instanceUrl,
            id: 'https://login.salesforce.com/id/00D000000000001AAA/005000000000001AAA',
        };
    };
    applySessionRefreshLimit(conn);
    return { conn, calls: () => calls, refreshes: () => refreshes };
}
const expired = {
    statusCode: 401,
    body: JSON.stringify([
        { errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' },
    ]),
};
const success = { statusCode: 200, body: JSON.stringify({ recovered: true }) };

for (const [name, jsforce] of [
    ['installed jsforce', require('jsforce')],
    ['shipped browser jsforce', browser.jsforce],
]) {
    for (const marker of NON_REFRESHABLE_401_MARKERS) {
        test(`${name}: ${marker} latches without a refresh`, { timeout: 4000 }, async () => {
            const f = fixture(jsforce, [
                {
                    statusCode: 401,
                    body: JSON.stringify([{ errorCode: 'INVALID_SESSION_ID', message: marker }]),
                },
            ]);
            await assert.rejects(f.conn.request('/services/data/'), { message: marker });
            await assert.rejects(f.conn.request('/services/data/'), { message: marker });
            assert.equal(f.calls(), 1);
            assert.equal(f.refreshes(), 0);
            assert.equal(isSalesforceApiBlocked(f.conn), true);
            const fresh = fixture(jsforce, [success]);
            assert.equal((await fresh.conn.request('/services/data/')).recovered, true);
        });
    }
    test(
        `${name}: an ordinary expired session refreshes and recovers`,
        { timeout: 4000 },
        async () => {
            const f = fixture(jsforce, [expired, success], 1);
            assert.equal((await f.conn.request('/services/data/')).recovered, true);
            assert.equal(f.calls(), 2);
            assert.equal(f.refreshes(), 1);
            assert.equal(isSalesforceApiBlocked(f.conn), false);
            assert.equal((await f.conn.request('/services/data/')).recovered, true);
            assert.equal(f.calls(), 3);
        }
    );
    for (const [budget, maxCalls] of [
        [0, 1],
        [1, 2],
        [undefined, 4],
    ]) {
        test(
            `${name}: persistent 401 stops at refresh budget ${budget ?? 'default'}`,
            { timeout: 4000 },
            async () => {
                const f = fixture(jsforce, [expired], budget);
                await assert.rejects(
                    f.conn.request('/services/data/'),
                    /Session expired or invalid/
                );
                assert.equal(f.calls(), maxCalls);
                assert.ok(f.refreshes() <= maxCalls - 1);
                assert.equal(isSalesforceApiBlocked(f.conn), false);
            }
        );
    }
}
