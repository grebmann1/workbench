import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isUndefinedOrNull, isNotUndefinedOrNull, isEmpty, isRecord } from '../validation.ts';

test('isUndefinedOrNull: true for null and undefined only', () => {
    assert.equal(isUndefinedOrNull(null), true);
    assert.equal(isUndefinedOrNull(undefined), true);
    assert.equal(isUndefinedOrNull(0), false);
    assert.equal(isUndefinedOrNull(''), false);
    assert.equal(isUndefinedOrNull(false), false);
});

test('isNotUndefinedOrNull: negation of isUndefinedOrNull', () => {
    assert.equal(isNotUndefinedOrNull('x'), true);
    assert.equal(isNotUndefinedOrNull(0), true);
    assert.equal(isNotUndefinedOrNull(null), false);
    assert.equal(isNotUndefinedOrNull(undefined), false);
});

test('isEmpty: empty string, null, undefined are empty', () => {
    assert.equal(isEmpty(''), true);
    assert.equal(isEmpty(undefined), true);
    assert.equal(isEmpty(null), true);
});

test('isEmpty: non-empty strings are not empty', () => {
    assert.equal(isEmpty(' '), false);
    assert.equal(isEmpty('hi'), false);
});

test('isRecord: true for plain objects, false for arrays/null/primitives', () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord({ a: 1 }), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord('s'), false);
    assert.equal(isRecord(42), false);
});
