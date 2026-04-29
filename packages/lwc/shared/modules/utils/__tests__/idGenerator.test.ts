import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateUniqueId } from '../idGenerator.ts';

test('generateUniqueId: monotonically increments; respects prefix', () => {
    const a = generateUniqueId('foo');
    const b = generateUniqueId('foo');
    assert.notEqual(a, b);
    assert.match(a, /^foo-\d+$/);
    const numA = Number(a.split('-')[1]);
    const numB = Number(b.split('-')[1]);
    assert.ok(numB > numA);
});

test('generateUniqueId: defaults prefix to "input"', () => {
    const id = generateUniqueId();
    assert.match(id, /^input-\d+$/);
});
