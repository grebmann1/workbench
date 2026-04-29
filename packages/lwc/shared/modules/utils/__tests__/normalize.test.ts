import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeString,
    normalizeBoolean,
    normalizeArray,
    normalizeAriaAttribute,
} from '../normalize.ts';

test('normalizeString: trims + lowercases by default', () => {
    assert.equal(normalizeString('  HELLO  '), 'hello');
});

test('normalizeString: honours toLowerCase=false', () => {
    assert.equal(normalizeString('  HI  ', { toLowerCase: false }), 'HI');
});

test('normalizeString: restricts to validValues, falls back otherwise', () => {
    const config = { validValues: ['small', 'medium', 'large'], fallbackValue: 'medium' };
    assert.equal(normalizeString('LARGE', config), 'large');
    assert.equal(normalizeString('giant', config), 'medium');
});

test('normalizeString: null / undefined / non-string become empty (or fallback)', () => {
    assert.equal(normalizeString(null), '');
    assert.equal(normalizeString(undefined), '');
    assert.equal(normalizeString(null, { fallbackValue: 'x', validValues: ['y'] }), 'x');
});

test('normalizeBoolean: any string (even empty) is truthy — documents current behavior', () => {
    // The implementation is `typeof value === 'string' || !!value`, so the
    // presence-of-the-attribute semantics matter more than its content.
    assert.equal(normalizeBoolean('false'), true);
    assert.equal(normalizeBoolean(''), true);
});

test('normalizeBoolean: non-string falsy values return false', () => {
    assert.equal(normalizeBoolean(null), false);
    assert.equal(normalizeBoolean(undefined), false);
    assert.equal(normalizeBoolean(0), false);
    assert.equal(normalizeBoolean(1), true);
});

test('normalizeArray: passes arrays through, everything else → []', () => {
    assert.deepEqual(normalizeArray([1, 2]), [1, 2]);
    assert.deepEqual(normalizeArray('not an array'), []);
    assert.deepEqual(normalizeArray(null), []);
});

test('normalizeAriaAttribute: collapses whitespace and joins arrays', () => {
    assert.equal(normalizeAriaAttribute('  label   one  '), 'label one');
    assert.equal(normalizeAriaAttribute(['one', '  two  ']), 'one two');
});

test('normalizeAriaAttribute: returns null when no useful tokens remain', () => {
    assert.equal(normalizeAriaAttribute(null), null);
    assert.equal(normalizeAriaAttribute(['', '  ']), null);
});
