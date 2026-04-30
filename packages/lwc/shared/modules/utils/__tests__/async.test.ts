import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chunkPromises, runActionAfterTimeOut, runSilent } from '../async.ts';

test('chunkPromises: returns [] for empty / non-array inputs', async () => {
    assert.deepEqual(await chunkPromises([] as number[], 10, async x => x), []);
    assert.deepEqual(await chunkPromises(null as unknown as number[], 10, async x => x), []);
});

test('chunkPromises: preserves order of mapped results', async () => {
    const out = await chunkPromises([1, 2, 3, 4, 5], 2, async n => n * 10);
    assert.deepEqual(out, [10, 20, 30, 40, 50]);
});

test('chunkPromises: size defaults to 10 when falsy', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const out = await chunkPromises(items, 0, async n => n + 1);
    assert.equal(out.length, 25);
    assert.equal(out[24], 25);
});

test('runSilent: returns the function result on success', async () => {
    const out = await runSilent(async () => 'ok', 'fallback');
    assert.equal(out, 'ok');
});

test('runSilent: returns placeholder on error (and does not throw)', async () => {
    // Swallow the console.warn to keep test output clean.
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        const out = await runSilent(async () => {
            throw new Error('boom');
        }, 'fallback');
        assert.equal(out, 'fallback');
    } finally {
        console.warn = originalWarn;
    }
});

test('runActionAfterTimeOut: latest call per key wins (earlier pending is cancelled)', async () => {
    const calls: number[] = [];
    runActionAfterTimeOut(1, v => calls.push(v), { timeout: 30, key: 'same' });
    runActionAfterTimeOut(2, v => calls.push(v), { timeout: 30, key: 'same' });
    await new Promise(r => setTimeout(r, 80));
    assert.deepEqual(calls, [2]);
});

test('runActionAfterTimeOut: accepts a plain timeout number (shared __default__ key)', async () => {
    const calls: number[] = [];
    runActionAfterTimeOut(7, v => calls.push(v), 20);
    await new Promise(r => setTimeout(r, 60));
    assert.deepEqual(calls, [7]);
});
