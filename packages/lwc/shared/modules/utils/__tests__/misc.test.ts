import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    decodeError,
    ROLES,
    generateExternalId,
    isObject,
    getFieldValue,
    extractErrorDetailsFromQuery,
} from '../misc.ts';

test('decodeError: reconstructs name + message', () => {
    const err = decodeError({ name: 'HttpError', message: 'boom' });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'HttpError');
    assert.equal(err.message, 'boom');
});

test('decodeError: missing name leaves default Error name', () => {
    const err = decodeError({ message: 'x' });
    assert.equal(err.name, 'Error');
    assert.equal(err.message, 'x');
});

test('ROLES: exposes the LLM role strings', () => {
    assert.equal(ROLES.USER, 'user');
    assert.equal(ROLES.SYSTEM, 'system');
    assert.equal(ROLES.TOOL, 'tool');
    assert.equal(ROLES.ASSISTANT, 'assistant');
});

test('generateExternalId: joins alias + key with underscore', () => {
    assert.equal(generateExternalId({ alias: 'prod' }, 'Account/001'), 'prod_Account/001');
});

test('isObject: true only for non-null object references', () => {
    assert.equal(isObject({}), true);
    assert.equal(isObject([]), true);
    assert.equal(isObject(null), false);
    assert.equal(isObject(undefined), false);
    assert.equal(isObject('x'), false);
    assert.equal(isObject(42), false);
});

test('getFieldValue: resolves dotted paths', () => {
    const rec = { a: { b: { c: 42 } } };
    assert.equal(getFieldValue('a.b.c', rec), 42);
});

test('getFieldValue: stops walking when a segment is missing (returns last resolved)', () => {
    const rec = { a: { b: 1 } } as Record<string, unknown>;
    // After 'a.b' we hit a non-object (number 1) so the walk stops there.
    assert.equal(getFieldValue('a.b.c', rec), 1);
});

test('extractErrorDetailsFromQuery: parses Row + Column + trailing message', () => {
    const out = extractErrorDetailsFromQuery('Row:12|Column:4\nMALFORMED_QUERY: unexpected token');
    assert.equal(out.row, 12);
    assert.equal(out.column, 4);
    assert.match(out.message, /MALFORMED_QUERY/);
});

test('extractErrorDetailsFromQuery: missing row/column returns nulls', () => {
    const out = extractErrorDetailsFromQuery('no location\nplain error');
    assert.equal(out.row, null);
    assert.equal(out.column, null);
    assert.equal(out.message, 'plain error');
});
