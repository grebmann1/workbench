import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getFromStorage, safeParseJson } from '../storage.ts';

test('getFromStorage: null item returns default', () => {
    assert.equal(getFromStorage(null, 'default'), 'default');
});

test('getFromStorage: valid JSON parses through', () => {
    assert.deepEqual(getFromStorage('{"a":1}', null), { a: 1 });
    assert.equal(getFromStorage('42', 0), 42);
});

test('getFromStorage: invalid JSON returns default', () => {
    assert.equal(getFromStorage('not json', 'fallback'), 'fallback');
});

test('getFromStorage: parsed null/undefined uses default', () => {
    assert.equal(getFromStorage('null', 'fallback'), 'fallback');
});

test('safeParseJson: valid JSON parses; invalid returns null', () => {
    assert.deepEqual(safeParseJson('[1,2,3]'), [1, 2, 3]);
    assert.equal(safeParseJson('bad'), null);
    assert.equal(safeParseJson(null), null);
});
