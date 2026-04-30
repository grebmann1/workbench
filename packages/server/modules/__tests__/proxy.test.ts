import assert from 'node:assert/strict';
import { test } from 'node:test';

import proxy from '../proxy.ts';

function makeRes() {
    const state: any = { status: 200, headers: {}, body: '' };
    return {
        state,
        set(h: Record<string, string>) {
            Object.assign(state.headers, h);
            return this;
        },
        status(code: number) {
            state.status = code;
            return this;
        },
        send(body: unknown) {
            state.body = body;
            return this;
        },
        sendStatus(code: number) {
            state.status = code;
            return this;
        },
    } as any;
}

function makeReq({ method = 'GET', endpoint = '', headers = {} as Record<string, string> } = {}) {
    const allHeaders: Record<string, string> = {
        'salesforceproxy-endpoint': endpoint,
        ...headers,
    };
    return {
        method,
        headers: allHeaders,
    } as any;
}

test('proxy: OPTIONS request with CORS returns 200 and sets headers', () => {
    const handler = proxy({ enableCORS: true, allowedOrigin: 'https://example.com' });
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    handler(req, res);
    assert.equal(res.state.status, 200);
    assert.equal(res.state.headers['Access-Control-Allow-Origin'], 'https://example.com');
    assert.ok(res.state.headers['Access-Control-Allow-Headers'].includes('Authorization'));
    assert.ok(res.state.headers['Access-Control-Allow-Methods'].includes('POST'));
    assert.equal(res.state.headers['Access-Control-Expose-Headers'], 'SForce-Limit-Info');
});

test('proxy: OPTIONS with no allowedOrigin defaults to *', () => {
    const handler = proxy({ enableCORS: true });
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    handler(req, res);
    assert.equal(res.state.headers['Access-Control-Allow-Origin'], '*');
});

test('proxy: rejects invalid endpoint domain with 400', () => {
    const handler = proxy();
    const req = makeReq({ endpoint: 'https://evil.example.com/' });
    const res = makeRes();
    handler(req, res);
    assert.equal(res.state.status, 400);
    assert.ok(String(res.state.body).includes('not allowed'));
});

test('proxy: rejects missing endpoint with 400', () => {
    const handler = proxy();
    const req = makeReq({ endpoint: '' });
    const res = makeRes();
    handler(req, res);
    assert.equal(res.state.status, 400);
});

test('proxy: rejects endpoint with wrong protocol', () => {
    const handler = proxy();
    const req = makeReq({ endpoint: 'http://my.salesforce.com/' });
    const res = makeRes();
    handler(req, res);
    assert.equal(res.state.status, 400);
});

test('proxy: rejects a non-Salesforce https endpoint', () => {
    const handler = proxy();
    const req = makeReq({ endpoint: 'https://malicious.example.org/data' });
    const res = makeRes();
    handler(req, res);
    assert.equal(res.state.status, 400);
});

test('proxy: no enableCORS skips OPTIONS short-circuit (no CORS headers)', () => {
    const handler = proxy();
    const req = makeReq({ method: 'OPTIONS', endpoint: 'https://evil.example.com/' });
    const res = makeRes();
    handler(req, res);
    // Falls through to endpoint validation because CORS is disabled
    assert.equal(res.state.status, 400);
    assert.equal(res.state.headers['Access-Control-Allow-Origin'], undefined);
});

test('proxy: accepts an array salesforceproxy-endpoint header', () => {
    const handler = proxy();
    const req = makeReq({ endpoint: ['https://evil.example.com/', 'https://other'] as any });
    const res = makeRes();
    handler(req, res);
    // First element is invalid, rejected with 400
    assert.equal(res.state.status, 400);
});
