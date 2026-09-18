import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';

import { applySessionRefreshLimit } from '../sessionRefreshLimit';

const require = createRequire(import.meta.url);
const jsforce = require('jsforce');

const BLACKTAB_BODY = JSON.stringify([
    {
        message: 'BlackTab users cannot perform API operations',
        errorCode: 'INVALID_SESSION_ID',
    },
]);

function installBlackTabTransport(conn: {
    instanceUrl?: string;
    _transport: { httpRequest: (...args: unknown[]) => unknown };
    oauth2: { refreshToken: (...args: unknown[]) => unknown };
}) {
    let apiCalls = 0;
    let refreshCalls = 0;
    conn._transport.httpRequest = () => {
        apiCalls += 1;
        if (apiCalls > 8) {
            throw new Error(`runaway 401 retry after ${apiCalls} API calls`);
        }
        const promise = Promise.resolve({
            statusCode: 401,
            headers: { 'content-type': 'application/json' },
            body: BLACKTAB_BODY,
        }) as Promise<unknown> & { stream: () => PassThrough };
        promise.stream = () => new PassThrough();
        return promise;
    };
    conn.oauth2.refreshToken = async () => {
        refreshCalls += 1;
        if (refreshCalls > 8) {
            throw new Error(`runaway token refresh after ${refreshCalls} calls`);
        }
        return {
            access_token: 'new-token',
            instance_url: conn.instanceUrl,
            id: 'https://login.salesforce.com/id/00Dxx0000000001/005xx0000000001',
        };
    };
    return {
        getApiCalls: () => apiCalls,
        getRefreshCalls: () => refreshCalls,
    };
}

test(
    'smoke: BlackTab 401 is not treated as a refreshable session expiry',
    { timeout: 4000 },
    async () => {
        const conn = new jsforce.Connection({
            instanceUrl: 'https://example.my.salesforce.com',
            accessToken: 'sid',
            refreshToken: 'rt',
            version: '60.0',
            oauth2: {
                clientId: 'cid',
                clientSecret: 'secret',
                loginUrl: 'https://login.salesforce.com',
            },
        });
        const sessionExpired: unknown[] = [];
        conn.on('sessionExpired', (err: unknown) => sessionExpired.push(err));
        const counters = installBlackTabTransport(conn);
        applySessionRefreshLimit(conn);

        const error = await conn.request('/services/data/').then(
            () => null,
            (err: unknown) => err as Error & { errorCode?: string; status?: number }
        );

        const second = await conn.request('/services/data/').then(
            () => null,
            (err: unknown) => err as Error & { errorCode?: string; status?: number }
        );

        console.log(
            JSON.stringify(
                {
                    apiCalls: counters.getApiCalls(),
                    refreshCalls: counters.getRefreshCalls(),
                    sessionExpiredEvents: sessionExpired.length,
                    errorMessage: error?.message,
                    errorCode: error?.errorCode,
                    errorName: error?.name,
                    secondErrorMessage: second?.message,
                },
                null,
                2
            )
        );

        assert.ok(error, 'request should fail');
        assert.equal(counters.getApiCalls(), 1);
        assert.equal(counters.getRefreshCalls(), 0);
        assert.equal(sessionExpired.length, 0);
        assert.equal(error.message, 'BlackTab users cannot perform API operations');
        assert.equal(error.errorCode, 'INVALID_SESSION_ID');
        assert.equal(second?.message, 'BlackTab users cannot perform API operations');
        assert.equal(counters.getApiCalls(), 1);
    }
);
