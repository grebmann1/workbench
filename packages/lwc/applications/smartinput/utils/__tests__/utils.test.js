import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    TEMPLATE,
    CATEGORY_SYSTEM,
    CATEGORY_CUSTOM,
    CATEGORY_TYPE,
    sanitizeCategories,
    sanitizeItems,
} from '../utils.js';

test('utils: constants have expected values', () => {
    assert.equal(CATEGORY_SYSTEM, 'system');
    assert.equal(CATEGORY_CUSTOM, 'custom');
    assert.equal(CATEGORY_TYPE.CATEGORY, 'category');
    assert.equal(CATEGORY_TYPE.ITEM, 'item');
    assert.equal(typeof TEMPLATE.BASIC, 'string');
    assert.match(TEMPLATE.BASIC, /<Package /);
    assert.match(TEMPLATE.BASIC, /<version>\{0\}<\/version>/);
});

test('sanitizeCategories: null/undefined → []', () => {
    assert.deepEqual(sanitizeCategories(null), []);
    assert.deepEqual(sanitizeCategories(undefined), []);
});

test('sanitizeCategories: array returned as-is', () => {
    const arr = [{ id: 'a' }, { id: 'b' }];
    assert.equal(sanitizeCategories(arr), arr);
});

test('sanitizeCategories: object → Object.values', () => {
    const out = sanitizeCategories({ a: { id: 'a' }, b: { id: 'b' } });
    assert.deepEqual(out, [{ id: 'a' }, { id: 'b' }]);
});

test('sanitizeItems: null/undefined → []', () => {
    assert.deepEqual(sanitizeItems(null), []);
    assert.deepEqual(sanitizeItems(undefined), []);
});

test('sanitizeItems: array returned as-is; object → Object.values', () => {
    const arr = [1, 2, 3];
    assert.equal(sanitizeItems(arr), arr);
    assert.deepEqual(sanitizeItems({ x: 'a', y: 'b' }), ['a', 'b']);
});
