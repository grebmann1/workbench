import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFetchMock } from '../fetchMock.ts';

test('createFetchMock: routes match by exact URL and return JSON body', async () => {
    const mock = createFetchMock({
        routes: [
            { match: 'https://api.example.com/ping', handler: () => ({ body: { ok: true } }) },
        ],
    });
    const res = await mock.fetch('https://api.example.com/ping');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual(json, { ok: true });
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].url, 'https://api.example.com/ping');
});

test('createFetchMock: substring matcher matches partial URL', async () => {
    const mock = createFetchMock({
        routes: [{ match: '/users', handler: () => ({ body: [] }) }],
    });
    const res = await mock.fetch('https://api.example.com/v1/users/42');
    assert.equal(res.status, 200);
});

test('createFetchMock: regex matcher', async () => {
    const mock = createFetchMock({
        routes: [{ match: /\/v\d+\/status/, handler: () => ({ status: 201, body: 'ok' }) }],
    });
    const res = await mock.fetch('https://api.example.com/v2/status');
    assert.equal(res.status, 201);
});

test('createFetchMock: default handler fires when no route matches', async () => {
    const mock = createFetchMock({
        default: () => ({ status: 404, body: 'not found' }),
    });
    const res = await mock.fetch('https://api.example.com/unknown');
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'not found');
});

test('createFetchMock: throws when no route and no default', async () => {
    const mock = createFetchMock();
    await assert.rejects(mock.fetch('https://missing'), /no route/);
});

test('createFetchMock: records calls with init', async () => {
    const mock = createFetchMock({ default: () => ({ body: 'ok' }) });
    await mock.fetch('https://example.com', { method: 'POST', body: 'hello' });
    assert.equal(mock.calls[0].init?.method, 'POST');
    assert.equal(mock.calls[0].init?.body, 'hello');
});

test('createFetchMock: reset clears calls log', async () => {
    const mock = createFetchMock({ default: () => ({ body: 'ok' }) });
    await mock.fetch('https://example.com');
    assert.equal(mock.calls.length, 1);
    mock.reset();
    assert.equal(mock.calls.length, 0);
});

test('createFetchMock: install/restore swaps globalThis.fetch and back', async () => {
    const original = globalThis.fetch;
    const mock = createFetchMock({ default: () => ({ body: 'via mock' }) });
    const uninstall = mock.install();
    assert.notEqual(globalThis.fetch, original);
    const res = await globalThis.fetch('https://anywhere');
    assert.equal(await res.text(), 'via mock');
    uninstall();
    assert.equal(globalThis.fetch, original);
});

test('createFetchMock: handler returning Response instance passes through', async () => {
    const mock = createFetchMock({
        default: () => new Response('raw', { status: 418 }),
    });
    const res = await mock.fetch('https://example.com');
    assert.equal(res.status, 418);
    assert.equal(await res.text(), 'raw');
});
