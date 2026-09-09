import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSerializedTaskQueue } from '../evalQueue.ts';

test('createSerializedTaskQueue: concurrent tasks run one at a time in order', async () => {
    const queue = createSerializedTaskQueue();
    const posted: string[] = [];
    const pending = new Map<string, (value: string) => void>();

    const execInSandbox = (code: string) =>
        queue.enqueue(
            () =>
                new Promise<string>(resolve => {
                    posted.push(code);
                    pending.set(code, resolve);
                })
        );

    const first = execInSandbox('continue');
    const second = execInSandbox('verify');
    await Promise.resolve();

    assert.deepEqual(posted, ['continue']);
    pending.get('continue')?.('ok-continue');
    assert.equal(await first, 'ok-continue');
    await Promise.resolve();

    assert.deepEqual(posted, ['continue', 'verify']);
    pending.get('verify')?.('ok-verify');
    assert.equal(await second, 'ok-verify');
});

test('createSerializedTaskQueue: abortQueued rejects tasks that have not started', async () => {
    const queue = createSerializedTaskQueue();
    let releaseFirst: (value: string) => void = () => {};
    let firstStarted!: () => void;
    const started = new Promise<void>(resolve => {
        firstStarted = resolve;
    });
    const first = queue.enqueue(
        () =>
            new Promise<string>(resolve => {
                firstStarted();
                releaseFirst = resolve;
            })
    );
    await started;
    const second = queue.enqueue(async () => 'second');

    queue.abortQueued();
    releaseFirst('first');
    assert.equal(await first, 'first');
    await assert.rejects(second, { name: 'AbortError' });
});

test('createSerializedTaskQueue: destroy rejects queued and later tasks', async () => {
    const queue = createSerializedTaskQueue();
    let releaseFirst: (value: string) => void = () => {};
    let firstStarted!: () => void;
    const started = new Promise<void>(resolve => {
        firstStarted = resolve;
    });
    const first = queue.enqueue(
        () =>
            new Promise<string>(resolve => {
                firstStarted();
                releaseFirst = resolve;
            })
    );
    await started;
    const second = queue.enqueue(async () => 'second');

    queue.destroy();
    releaseFirst('first');
    assert.equal(await first, 'first');
    await assert.rejects(second, /CdpHandler destroyed/);
    await assert.rejects(
        queue.enqueue(async () => 'later'),
        /CdpHandler destroyed/
    );
});
