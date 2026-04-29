import assert from 'node:assert/strict';
import { test } from 'node:test';

type WorkerInit = { url: string; options?: { type?: string } };

class WorkerStub {
    static created: WorkerInit[] = [];
    onmessage: ((event: { data?: { status?: string } }) => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;
    posted: unknown[] = [];
    constructor(url: string, options?: { type?: string }) {
        WorkerStub.created.push({ url, options });
    }
    postMessage(payload: unknown) {
        this.posted.push(payload);
    }
    terminate() {}
}

(globalThis as unknown as { Worker: unknown }).Worker = WorkerStub;
(globalThis as unknown as { window: { jsforceSettings: { proxyUrl: string | null } } }).window = {
    jsforceSettings: { proxyUrl: null },
};

const { getWorker, getWorkerStatuses, getAllWorkers } = await import('../worker.ts');

function makeConnection(overrides: Record<string, unknown> = {}) {
    return {
        instanceUrl: 'https://x.my.salesforce.com',
        accessToken: 'T',
        refreshToken: 'R',
        version: '60.0',
        loginUrl: 'https://login.salesforce.com',
        oauth2: { marker: 'oauth' },
        ...overrides,
    };
}

test('getWorker: creates a Worker with module type and /libs/workers/<name> URL', () => {
    WorkerStub.created.length = 0;
    const entry = getWorker(makeConnection(), 'accessAnalyzer.worker.js');
    const last = WorkerStub.created.at(-1)!;
    assert.equal(last.url, '/libs/workers/accessAnalyzer.worker.js');
    assert.deepEqual(last.options, { type: 'module' });
    assert.ok(entry.id);
    assert.equal(entry.type, 'accessAnalyzer.worker.js');
    assert.equal(entry.status, 'idle');
});

test('getWorker: posts an init message with the connection params', () => {
    const conn = makeConnection({ accessToken: 'ABC' });
    const entry = getWorker(conn, 'x.worker.js');
    const posted = (entry.instance as unknown as WorkerStub).posted;
    assert.equal(posted.length, 1);
    const msg = posted[0] as { action: string; connectionParams: { accessToken: string } };
    assert.equal(msg.action, 'init');
    assert.equal(msg.connectionParams.accessToken, 'ABC');
});

test('getWorker: each call produces a unique worker id', () => {
    const a = getWorker(makeConnection(), 'x.worker.js');
    const b = getWorker(makeConnection(), 'x.worker.js');
    assert.notEqual(a.id, b.id);
});

test('getWorkerStatuses: returns entry by id, undefined for unknown', () => {
    const entry = getWorker(makeConnection(), 'lookup.worker.js');
    assert.equal(getWorkerStatuses(entry.id)?.id, entry.id);
    assert.equal(getWorkerStatuses('not-a-worker'), undefined);
});

test('getAllWorkers: returns a map including each registered worker id', () => {
    const entry = getWorker(makeConnection(), 'all.worker.js');
    const all = getAllWorkers();
    assert.ok(all[entry.id]);
    assert.equal(all[entry.id].type, 'all.worker.js');
});

test('Worker onmessage: status updates mutate the entry.status', () => {
    const entry = getWorker(makeConnection(), 'status.worker.js');
    (entry.instance.onmessage as unknown as (e: unknown) => void)({
        data: { status: 'running' },
    });
    assert.equal(entry.status, 'running');
});

test('Worker onerror: flips status to "error"', () => {
    const entry = getWorker(makeConnection(), 'error.worker.js');
    (entry.instance.onerror as unknown as (e: unknown) => void)(new Error('boom'));
    assert.equal(entry.status, 'error');
});
