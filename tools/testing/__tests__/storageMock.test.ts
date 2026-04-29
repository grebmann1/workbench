import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStorageMock } from '../storageMock.ts';

test('createStorageMock: empty by default, get returns undefined', async () => {
    const s = createStorageMock();
    assert.equal(await s.get('missing'), undefined);
    assert.deepEqual(await s.keys(), []);
});

test('createStorageMock: initial seed populates raw map', async () => {
    const s = createStorageMock({ a: 1, b: 'two' });
    assert.equal(await s.get<number>('a'), 1);
    assert.equal(await s.get<string>('b'), 'two');
    assert.deepEqual((await s.keys()).sort(), ['a', 'b']);
});

test('createStorageMock: set/get/remove round trip', async () => {
    const s = createStorageMock();
    await s.set('k', { nested: true });
    assert.deepEqual(await s.get('k'), { nested: true });
    await s.remove('k');
    assert.equal(await s.get('k'), undefined);
});

test('createStorageMock: clear wipes everything', async () => {
    const s = createStorageMock({ a: 1, b: 2 });
    await s.clear();
    assert.deepEqual(await s.keys(), []);
});

test('createStorageMock: _raw exposes underlying map for assertions', async () => {
    const s = createStorageMock();
    await s.set('x', 42);
    assert.ok(s._raw instanceof Map);
    assert.equal(s._raw.get('x'), 42);
});
