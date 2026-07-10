import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import oauthPassword, { isAllowedLoginUrl, normalizeLoginUrl } from '../oauthPassword.ts';

test('normalizeLoginUrl: reduces a full URL to its origin', () => {
    assert.equal(
        normalizeLoginUrl('https://mydomain.my.salesforce.com/foo?bar=1'),
        'https://mydomain.my.salesforce.com'
    );
});

test('normalizeLoginUrl: returns null for empty/invalid input', () => {
    assert.equal(normalizeLoginUrl(''), null);
    assert.equal(normalizeLoginUrl(undefined), null);
    assert.equal(normalizeLoginUrl('not a url'), null);
});

test('isAllowedLoginUrl: accepts real Salesforce hosts, rejects others', () => {
    assert.equal(isAllowedLoginUrl('https://mydomain.my.salesforce.com'), true);
    assert.equal(isAllowedLoginUrl('https://login.salesforce.com'), true);
    assert.equal(isAllowedLoginUrl('https://foo.force.com'), true);
    assert.equal(isAllowedLoginUrl('https://evil.example.com'), false);
    assert.equal(isAllowedLoginUrl('http://mydomain.my.salesforce.com'), false);
});

/** Minimal express-app stub that captures the POST handler. */
function makeApp() {
    const routes: Record<string, any> = {};
    return {
        routes,
        options(path: string, handler: any) {
            routes[`OPTIONS ${path}`] = handler;
        },
        post(path: string, handler: any) {
            routes[`POST ${path}`] = handler;
        },
        get() {},
    } as any;
}

function makeRes() {
    const state: any = { status: 200, headers: {}, body: undefined };
    return {
        state,
        set(h: any) {
            if (typeof h === 'string') return this;
            Object.assign(state.headers, h);
            return this;
        },
        status(code: number) {
            state.status = code;
            return this;
        },
        json(body: unknown) {
            state.body = body;
            return this;
        },
        sendStatus(code: number) {
            state.status = code;
            return this;
        },
    } as any;
}

const ORIGINAL_ENV = { CLIENT_ID: process.env.CLIENT_ID, CLIENT_SECRET: process.env.CLIENT_SECRET };

beforeEach(() => {
    process.env.CLIENT_ID = 'test-client-id';
    process.env.CLIENT_SECRET = 'test-client-secret';
});

afterEach(() => {
    process.env.CLIENT_ID = ORIGINAL_ENV.CLIENT_ID;
    process.env.CLIENT_SECRET = ORIGINAL_ENV.CLIENT_SECRET;
});

function register(oauth2Factory?: any) {
    const app = makeApp();
    oauthPassword(app, oauth2Factory ? { oauth2Factory } : {});
    return app.routes['POST /oauth2/password'];
}

test('POST handler: 400 when fields missing', async () => {
    const handler = register();
    const res = makeRes();
    await handler({ body: { username: 'a@b.com' } }, res);
    assert.equal(res.state.status, 400);
});

test('POST handler: 400 when loginUrl is not a Salesforce host', async () => {
    const handler = register();
    const res = makeRes();
    await handler(
        { body: { username: 'a@b.com', password: 'pw', loginUrl: 'https://evil.example.com' } },
        res
    );
    assert.equal(res.state.status, 400);
    assert.ok(String(res.state.body.error).includes('valid Salesforce host'));
});

test('POST handler: 500 when server OAuth client is not configured', async () => {
    delete process.env.CLIENT_ID;
    const handler = register();
    const res = makeRes();
    await handler(
        {
            body: {
                username: 'a@b.com',
                password: 'pw',
                loginUrl: 'https://x.my.salesforce.com',
            },
        },
        res
    );
    assert.equal(res.state.status, 500);
});

test('POST handler: returns tokens on success', async () => {
    let capturedLoginUrl = '';
    const handler = register((loginUrl: string) => {
        capturedLoginUrl = loginUrl;
        return {
            authenticate: async () => ({
                access_token: 'AT',
                instance_url: 'https://x.my.salesforce.com',
                refresh_token: 'RT',
                id: 'https://login.salesforce.com/id/00D/005',
            }),
        };
    });
    const res = makeRes();
    await handler(
        {
            body: {
                username: 'a@b.com',
                password: 'pw',
                loginUrl: 'https://x.my.salesforce.com/lightning/page',
            },
        },
        res
    );
    assert.equal(res.state.status, 200);
    assert.equal(res.state.body.access_token, 'AT');
    assert.equal(res.state.body.instance_url, 'https://x.my.salesforce.com');
    assert.equal(res.state.body.refresh_token, 'RT');
    // loginUrl was normalized to origin before the grant
    assert.equal(capturedLoginUrl, 'https://x.my.salesforce.com');
});

test('POST handler: 400 with error message when the grant throws', async () => {
    const handler = register(() => ({
        authenticate: async () => {
            const err = new Error('authentication failure');
            err.name = 'invalid_grant';
            throw err;
        },
    }));
    const res = makeRes();
    await handler(
        {
            body: {
                username: 'a@b.com',
                password: 'bad',
                loginUrl: 'https://x.my.salesforce.com',
            },
        },
        res
    );
    assert.equal(res.state.status, 400);
    assert.equal(res.state.body.code, 'invalid_grant');
});
