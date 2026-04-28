import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, isHttpError } from '../http.ts';

test('HttpError: preserves message, status, payload', () => {
    const err = new HttpError('boom', 418, { code: 'TEAPOT' });
    assert.equal(err.message, 'boom');
    assert.equal(err.status, 418);
    assert.deepEqual(err.payload, { code: 'TEAPOT' });
    assert.equal(err.name, 'HttpError');
});

test('HttpError: is an Error subclass', () => {
    const err = new HttpError('x', 500, null);
    assert.ok(err instanceof HttpError);
    assert.ok(err instanceof Error);
});

test('isHttpError: true for HttpError instance', () => {
    assert.equal(isHttpError(new HttpError('x', 400, null)), true);
});

test('isHttpError: false for plain Error without status', () => {
    assert.equal(isHttpError(new Error('no status')), false);
});

test('isHttpError: true for Error with numeric status property (duck-typed)', () => {
    const err = Object.assign(new Error('duck'), { status: 404 });
    assert.equal(isHttpError(err), true);
});

test('isHttpError: false for non-error values', () => {
    assert.equal(isHttpError(null), false);
    assert.equal(isHttpError(undefined), false);
    assert.equal(isHttpError({ status: 500 }), false);
    assert.equal(isHttpError('oops'), false);
});
