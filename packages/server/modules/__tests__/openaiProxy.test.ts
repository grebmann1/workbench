import assert from 'node:assert/strict';
import { test } from 'node:test';

import openaiProxy from '../openaiProxy.ts';

/**
 * openaiProxy wires CORS + auth middleware and four route handlers onto an
 * Express app. We don't need a real Express — a fake that captures the
 * registered middlewares and handlers is enough to exercise the behaviours
 * that matter (auth rejection, model validation, CORS headers).
 */
type Handler = (...args: any[]) => any;
type RouteSlot = {
    path: string;
    handlers: Handler[];
};

function makeFakeApp() {
    const uses: RouteSlot[] = [];
    const gets: RouteSlot[] = [];
    const posts: RouteSlot[] = [];
    const optionss: RouteSlot[] = [];
    return {
        uses,
        gets,
        posts,
        optionss,
        use(path: string, ...handlers: Handler[]) {
            uses.push({ path, handlers });
        },
        get(path: string, ...handlers: Handler[]) {
            gets.push({ path, handlers });
        },
        post(path: string, ...handlers: Handler[]) {
            posts.push({ path, handlers });
        },
        options(path: string, ...handlers: Handler[]) {
            optionss.push({ path, handlers });
        },
    };
}

function makeRes() {
    const state: any = { status: 200, headers: {}, body: undefined, ended: false, chunks: [] };
    const res: any = {
        state,
        status(code: number) {
            state.status = code;
            return res;
        },
        set(h: Record<string, string>) {
            Object.assign(state.headers, h);
            return res;
        },
        json(body: unknown) {
            state.body = body;
            return res;
        },
        write(chunk: unknown) {
            state.chunks.push(chunk);
            return true;
        },
        end() {
            state.ended = true;
            return res;
        },
        flushHeaders() {},
    };
    return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
    return {
        headers: {},
        body: undefined,
        ...overrides,
    };
}

test('openaiProxy: registers CORS+auth middleware on base path', () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    // Default path is /openai/v1 → .use('/openai/v1/', corsMw, authMw)
    const use = app.uses.find(u => u.path === '/openai/v1/');
    assert.ok(use, 'expected use() on /openai/v1/');
    assert.equal(use.handlers.length, 2);
});

test('openaiProxy: registers expected routes', () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    const postPaths = app.posts.map(p => p.path);
    assert.ok(postPaths.includes('/openai/v1/chat/completions'));
    assert.ok(postPaths.includes('/openai/v1/responses'));
    const getPaths = app.gets.map(g => g.path);
    assert.ok(getPaths.includes('/openai/v1/models'));
});

test('openaiProxy: honours custom path option', () => {
    const app = makeFakeApp();
    openaiProxy(app as any, { path: '/custom/v2' });
    assert.ok(app.uses.some(u => u.path === '/custom/v2/'));
    assert.ok(app.posts.some(p => p.path === '/custom/v2/chat/completions'));
});

test('openaiProxy: CORS middleware sets permissive headers', () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    const [corsMw] = app.uses[0].handlers;
    const res = makeRes();
    let called = false;
    corsMw(makeReq(), res, () => (called = true));
    assert.equal(res.state.headers['Access-Control-Allow-Origin'], '*');
    assert.ok(res.state.headers['Access-Control-Allow-Methods'].includes('POST'));
    assert.ok(res.state.headers['Access-Control-Allow-Headers'].includes('Authorization'));
    assert.equal(called, true);
});

test('openaiProxy: auth middleware allows request when no static keys configured', () => {
    const saved = {
        k0: process.env.SALESFORCE_KEY,
        k1: process.env.SALESFORCE_KEY1,
        k2: process.env.SALESFORCE_KEY2,
        k3: process.env.SALESFORCE_KEY3,
        k4: process.env.SALESFORCE_KEY4,
        k5: process.env.SALESFORCE_KEY5,
    };
    delete process.env.SALESFORCE_KEY;
    delete process.env.SALESFORCE_KEY1;
    delete process.env.SALESFORCE_KEY2;
    delete process.env.SALESFORCE_KEY3;
    delete process.env.SALESFORCE_KEY4;
    delete process.env.SALESFORCE_KEY5;
    try {
        const app = makeFakeApp();
        openaiProxy(app as any);
        const [, authMw] = app.uses[0].handlers;
        const res = makeRes();
        let called = false;
        authMw(makeReq(), res, () => (called = true));
        assert.equal(called, true);
    } finally {
        Object.entries(saved).forEach(([k, v]) => {
            const key = k === 'k0' ? 'SALESFORCE_KEY' : `SALESFORCE_KEY${k.slice(1)}`;
            if (v !== undefined) process.env[key] = v;
        });
    }
});

test('openaiProxy: auth middleware rejects missing bearer when keys configured', () => {
    const saved = process.env.SALESFORCE_KEY;
    process.env.SALESFORCE_KEY = 'secret-123';
    try {
        const app = makeFakeApp();
        openaiProxy(app as any);
        const [, authMw] = app.uses[0].handlers;
        const res = makeRes();
        let called = false;
        authMw(makeReq(), res, () => (called = true));
        assert.equal(called, false);
        assert.equal(res.state.status, 401);
        assert.deepEqual(res.state.body, { error: 'Unauthorized' });
    } finally {
        if (saved === undefined) delete process.env.SALESFORCE_KEY;
        else process.env.SALESFORCE_KEY = saved;
    }
});

test('openaiProxy: auth middleware accepts matching bearer token', () => {
    const saved = process.env.SALESFORCE_KEY;
    process.env.SALESFORCE_KEY = 'secret-123';
    try {
        const app = makeFakeApp();
        openaiProxy(app as any);
        const [, authMw] = app.uses[0].handlers;
        const res = makeRes();
        let called = false;
        authMw(
            makeReq({ headers: { authorization: 'Bearer secret-123' } }),
            res,
            () => (called = true)
        );
        assert.equal(called, true);
    } finally {
        if (saved === undefined) delete process.env.SALESFORCE_KEY;
        else process.env.SALESFORCE_KEY = saved;
    }
});

test('openaiProxy: auth middleware rejects wrong bearer token', () => {
    const saved = process.env.SALESFORCE_KEY;
    process.env.SALESFORCE_KEY = 'secret-123';
    try {
        const app = makeFakeApp();
        openaiProxy(app as any);
        const [, authMw] = app.uses[0].handlers;
        const res = makeRes();
        let called = false;
        authMw(
            makeReq({ headers: { authorization: 'Bearer wrong-key' } }),
            res,
            () => (called = true)
        );
        assert.equal(called, false);
        assert.equal(res.state.status, 401);
    } finally {
        if (saved === undefined) delete process.env.SALESFORCE_KEY;
        else process.env.SALESFORCE_KEY = saved;
    }
});

test('openaiProxy: chat/completions returns 400 when body missing', async () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    const handler = app.posts.find(p => p.path === '/openai/v1/chat/completions')!.handlers[0];
    const res = makeRes();
    await handler(makeReq({ body: undefined }), res, () => {});
    assert.equal(res.state.status, 400);
    assert.deepEqual(res.state.body, { error: 'Invalid JSON' });
});

test('openaiProxy: chat/completions returns 400 for unsupported model', async () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    const handler = app.posts.find(p => p.path === '/openai/v1/chat/completions')!.handlers[0];
    const res = makeRes();
    await handler(makeReq({ body: { model: 'not-a-real-model' } }), res, () => {});
    assert.equal(res.state.status, 400);
    assert.match((res.state.body as any).error, /not supported/);
});

test('openaiProxy: responses endpoint returns 400 for missing body', async () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    const handler = app.posts.find(p => p.path === '/openai/v1/responses')!.handlers[0];
    const res = makeRes();
    await handler(makeReq({ body: undefined }), res, () => {});
    assert.equal(res.state.status, 400);
});

test('openaiProxy: GET /models lists supportModels as OpenAI-shaped entries', () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    const handler = app.gets.find(g => g.path === '/openai/v1/models')!.handlers[0];
    const res = makeRes();
    handler(makeReq(), res, () => {});
    const body: any = res.state.body;
    assert.equal(body.object, 'list');
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length > 0);
    assert.equal(body.data[0].object, 'model');
    assert.equal(body.data[0].owned_by, 'openai');
    assert.equal(typeof body.data[0].id, 'string');
});

test('openaiProxy: OPTIONS handler returns 200 ok', () => {
    const app = makeFakeApp();
    openaiProxy(app as any);
    const optRoute = app.optionss.find(o => o.path === '/openai/v1{/*splat}');
    assert.ok(optRoute, 'expected options() on splat path');
    const res = makeRes();
    optRoute!.handlers[0](makeReq(), res);
    assert.equal(res.state.status, 200);
    assert.deepEqual(res.state.body, { body: 'ok' });
});
