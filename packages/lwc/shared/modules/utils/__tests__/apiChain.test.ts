import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    resolveJsonPath,
    runChain,
    type ChainStep,
    type ChainExecutor,
} from '../modules/apiChain.ts';

const fakeExecutor = (
    responses: Record<string, { status?: number; body: unknown; headers?: Array<{ key: string; value: string }> }>
): ChainExecutor => {
    return async (input) => {
        const key = `${input.method} ${input.url}`;
        const spec = responses[key];
        if (!spec) throw new Error(`Unexpected call: ${key}`);
        return {
            statusCode: spec.status ?? 200,
            content: spec.body,
            contentRaw: typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body),
            contentHeaders: spec.headers ?? [{ key: 'content-type', value: 'application/json' }],
            contentType: 'application/json',
            contentLength: 0,
            executionStartDate: Date.now(),
            executionEndDate: Date.now(),
        };
    };
};

/* -------------------------------------------------------------------------- */
/*  resolveJsonPath                                                            */
/* -------------------------------------------------------------------------- */

test('resolveJsonPath: $ returns root', () => {
    assert.deepEqual(resolveJsonPath({ a: 1 }, '$'), { a: 1 });
});

test('resolveJsonPath: dot-path', () => {
    assert.equal(resolveJsonPath({ a: { b: { c: 7 } } }, '$.a.b.c'), 7);
});

test('resolveJsonPath: array index', () => {
    assert.equal(resolveJsonPath({ xs: [10, 20, 30] }, '$.xs[1]'), 20);
});

test('resolveJsonPath: negative array index', () => {
    assert.equal(resolveJsonPath({ xs: [10, 20, 30] }, '$.xs[-1]'), 30);
});

test('resolveJsonPath: quoted key with spaces', () => {
    assert.equal(resolveJsonPath({ "a b": 5 }, "$['a b']"), 5);
});

test('resolveJsonPath: missing path returns undefined', () => {
    assert.equal(resolveJsonPath({ a: 1 }, '$.b.c'), undefined);
    assert.equal(resolveJsonPath(null, '$.b'), undefined);
});

/* -------------------------------------------------------------------------- */
/*  runChain                                                                   */
/* -------------------------------------------------------------------------- */

test('runChain: single passing step with status assertion', async () => {
    const executor = fakeExecutor({
        'GET /a': { status: 200, body: { ok: true } },
    });
    const steps: ChainStep[] = [
        {
            id: 's1',
            request: { method: 'GET', url: '/a' },
            assert: [{ status: 200 }],
        },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.ok, true);
    assert.equal(res.steps[0].status, 'pass');
});

test('runChain: assertion mismatch → fail + bails by default', async () => {
    const executor = fakeExecutor({
        'GET /a': { status: 500, body: { ok: false } },
        'GET /b': { status: 200, body: {} },
    });
    const steps: ChainStep[] = [
        {
            id: 's1',
            request: { method: 'GET', url: '/a' },
            assert: [{ status: 200 }],
        },
        {
            id: 's2',
            request: { method: 'GET', url: '/b' },
        },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.ok, false);
    assert.equal(res.steps[0].status, 'fail');
    assert.equal(res.steps[1].status, 'skipped');
});

test('runChain: bailOnFailure=false lets later steps run', async () => {
    const executor = fakeExecutor({
        'GET /a': { status: 500, body: {} },
        'GET /b': { status: 200, body: {} },
    });
    const steps: ChainStep[] = [
        {
            id: 's1',
            request: { method: 'GET', url: '/a' },
            assert: [{ status: 200 }],
            bailOnFailure: false,
        },
        { id: 's2', request: { method: 'GET', url: '/b' }, assert: [{ status: 200 }] },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.steps[0].status, 'fail');
    assert.equal(res.steps[1].status, 'pass');
});

test('runChain: extractions propagate to later steps via variables scope', async () => {
    const executor = fakeExecutor({
        'POST /a': { status: 201, body: { id: 'X-7' } },
        'GET /b': { status: 200, body: {} },
    });
    const steps: ChainStep[] = [
        {
            id: 's1',
            request: { method: 'POST', url: '/a' },
            extract: [{ from: '$.id', as: 'newId' }],
        },
        { id: 's2', request: { method: 'GET', url: '/b' } },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.variables.newId, 'X-7');
    assert.equal(res.steps[0].extractedVariables.newId, 'X-7');
});

test('runChain: jsonPath equals assertion', async () => {
    const executor = fakeExecutor({
        'GET /a': { status: 200, body: { data: { success: true } } },
    });
    const steps: ChainStep[] = [
        {
            id: 's1',
            request: { method: 'GET', url: '/a' },
            assert: [{ jsonPath: '$.data.success', equals: true }],
        },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.steps[0].status, 'pass');
});

test('runChain: contains assertion against raw body', async () => {
    const executor = fakeExecutor({
        'GET /a': { status: 200, body: 'Hello, world' },
    });
    const steps: ChainStep[] = [
        {
            id: 's1',
            request: { method: 'GET', url: '/a' },
            assert: [{ contains: 'Hello' }, { contains: 'missing' }],
        },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.steps[0].status, 'fail');
    const [first, second] = res.steps[0].assertions;
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
});

test('runChain: headerPresent assertion', async () => {
    const executor = fakeExecutor({
        'GET /a': {
            status: 200,
            body: {},
            headers: [{ key: 'X-Custom', value: 'yes' }],
        },
    });
    const steps: ChainStep[] = [
        {
            id: 's1',
            request: { method: 'GET', url: '/a' },
            assert: [{ headerPresent: 'x-custom' }, { headerPresent: 'x-missing' }],
        },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.steps[0].assertions[0].ok, true);
    assert.equal(res.steps[0].assertions[1].ok, false);
});

test('runChain: executor throwing marks step as error', async () => {
    const executor: ChainExecutor = async () => {
        throw new Error('network boom');
    };
    const steps: ChainStep[] = [
        { id: 's1', request: { method: 'GET', url: '/x' } },
        { id: 's2', request: { method: 'GET', url: '/y' } },
    ];
    const res = await runChain(steps, executor);
    assert.equal(res.steps[0].status, 'error');
    assert.equal(res.steps[0].error, 'network boom');
    assert.equal(res.steps[1].status, 'skipped');
});

test('runChain: initialVariables are available to all steps', async () => {
    const executor = fakeExecutor({ 'GET /a': { status: 200, body: {} } });
    const steps: ChainStep[] = [{ id: 's1', request: { method: 'GET', url: '/a' } }];
    const res = await runChain(steps, executor, { token: 'abc' });
    assert.equal(res.variables.token, 'abc');
});
