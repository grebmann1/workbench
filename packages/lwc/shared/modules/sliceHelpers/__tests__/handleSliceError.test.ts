/**
 * Pure-function tests for the shared slice error helper.
 *
 * Runner: `node --experimental-strip-types --test`.
 *
 * The helper is a thin classifier + dedupe + thrower. We exercise every
 * classification branch, the rethrow contract, and the 250 ms dedupe TTL.
 * The reporter is replaced with a counting spy via `setSliceErrorReporter`
 * so we never touch the real host store.
 */

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

import {
    classifyError,
    handleSliceError,
    setSliceErrorReporter,
    _clearDedupeForTesting,
    type SliceErrorReporter,
} from '../handleSliceError.ts';

interface ReporterCall {
    err: unknown;
    options?: { source?: string; details?: string };
}

function makeReporter(): { fn: SliceErrorReporter; calls: ReporterCall[] } {
    const calls: ReporterCall[] = [];
    const fn: SliceErrorReporter = (err, options) => {
        calls.push({ err, options });
    };
    return { fn, calls };
}

beforeEach(() => {
    // _clearDedupeForTesting also resets the reporter back to the no-op default.
    _clearDedupeForTesting();
});

/* -------------------------------------------------------------------------- */
/*  classifyError                                                              */
/* -------------------------------------------------------------------------- */

test('classifyError: INSUFFICIENT_ACCESS_OR_READONLY → permission_denied', () => {
    const err = Object.assign(new Error('no read'), {
        errorCode: 'INSUFFICIENT_ACCESS_OR_READONLY',
    });
    const out = classifyError(err);
    assert.equal(out.code, 'permission_denied');
    assert.match(out.message, /Permission denied/);
    assert.equal(out.raw, err);
});

test('classifyError: INVALID_TYPE → entity_unavailable', () => {
    const err = { errorCode: 'INVALID_TYPE', message: 'sObject type ... does not exist' };
    const out = classifyError(err);
    assert.equal(out.code, 'entity_unavailable');
    assert.match(out.message, /not available/);
    assert.equal(out.raw, err);
});

test('classifyError: HTTP 500 status → service_error', () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
    const out = classifyError(err);
    assert.equal(out.code, 'service_error');
    assert.match(out.message, /HTTP 500/);
});

test('classifyError: HTTP 503 status (plain object) → service_error', () => {
    const err = { status: 503, message: 'unavailable' };
    const out = classifyError(err);
    assert.equal(out.code, 'service_error');
    assert.match(out.message, /HTTP 503/);
});

test('classifyError: unrelated Error → unknown with original message', () => {
    const err = new Error('something broke');
    const out = classifyError(err);
    assert.equal(out.code, 'unknown');
    assert.equal(out.message, 'something broke');
});

test('classifyError: nullish → unknown with default message', () => {
    const out = classifyError(undefined);
    assert.equal(out.code, 'unknown');
    assert.equal(out.message, 'Unknown error');
});

/* -------------------------------------------------------------------------- */
/*  handleSliceError                                                           */
/* -------------------------------------------------------------------------- */

test('handleSliceError: calls reportError once and rethrows classified message', () => {
    const reporter = makeReporter();
    setSliceErrorReporter(reporter.fn);

    const original = new Error('original soql fault');
    assert.throws(
        () => handleSliceError('agentforce', original),
        (e: unknown) => {
            // The rethrown error carries the classified message — for the
            // unknown bucket that's the original `.message`.
            assert.ok(e instanceof Error);
            assert.equal((e as Error).message, 'original soql fault');
            return true;
        }
    );

    assert.equal(reporter.calls.length, 1);
    assert.equal(reporter.calls[0]?.options?.source, 'agentforce');
    assert.equal(reporter.calls[0]?.err, original);
});

test('handleSliceError: classified message is human-readable for known codes', () => {
    const reporter = makeReporter();
    setSliceErrorReporter(reporter.fn);

    const permissionErr = Object.assign(new Error('raw'), {
        errorCode: 'INSUFFICIENT_ACCESS_OR_READONLY',
    });
    assert.throws(
        () => handleSliceError('agentforce', permissionErr),
        (e: unknown) => {
            assert.ok(e instanceof Error);
            assert.match((e as Error).message, /Permission denied/);
            return true;
        }
    );
});

test('handleSliceError: dedupes two rapid calls with same (scope, message)', () => {
    const reporter = makeReporter();
    setSliceErrorReporter(reporter.fn);

    const err = new Error('flapping fault');
    // First call → reports + throws.
    assert.throws(() => handleSliceError('agentforce', err));
    // Second call within 250ms with the same (scope, message) → throws but
    // does NOT re-report.
    assert.throws(() => handleSliceError('agentforce', err));

    assert.equal(reporter.calls.length, 1, 'reporter should only fire once within TTL window');
});

test('handleSliceError: different scopes are tracked separately', () => {
    const reporter = makeReporter();
    setSliceErrorReporter(reporter.fn);

    const err = new Error('shared message');
    assert.throws(() => handleSliceError('agentforce', err));
    assert.throws(() => handleSliceError('debugger', err));

    assert.equal(reporter.calls.length, 2, 'distinct scopes should each report');
});

test('handleSliceError: different messages within same scope re-fire', () => {
    const reporter = makeReporter();
    setSliceErrorReporter(reporter.fn);

    assert.throws(() => handleSliceError('agentforce', new Error('one')));
    assert.throws(() => handleSliceError('agentforce', new Error('two')));

    assert.equal(reporter.calls.length, 2);
});
