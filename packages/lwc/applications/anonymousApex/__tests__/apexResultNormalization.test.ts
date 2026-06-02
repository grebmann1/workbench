import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    hasExecuteAnonymousSignal,
    normalizeExecuteAnonymousResult,
    unwrapExecuteAnonymousResponse,
} from '../slices/normalizeExecuteAnonymousResult.ts';

test('unwrapExecuteAnonymousResponse prefers wrapped payloads', () => {
    const payload = { compiled: false, success: false, compileProblem: 'bad token' };
    assert.deepEqual(unwrapExecuteAnonymousResponse({ data: payload }), payload);
    assert.deepEqual(unwrapExecuteAnonymousResponse({ response: payload }), payload);
    assert.deepEqual(unwrapExecuteAnonymousResponse({ result: payload }), payload);
});

test('normalizeExecuteAnonymousResult preserves compile errors', () => {
    const normalized = normalizeExecuteAnonymousResult({
        data: {
            compiled: false,
            success: false,
            compileProblem: "Method does not exist: 'debugg'",
            line: 1,
            column: 8,
        },
    });
    assert.equal(normalized.compiled, false);
    assert.equal(normalized.success, false);
    assert.equal(normalized.compileProblem, "Method does not exist: 'debugg'");
    assert.equal(normalized.line, 1);
    assert.equal(normalized.column, 8);
});

test('normalizeExecuteAnonymousResult defaults safe fields', () => {
    const normalized = normalizeExecuteAnonymousResult({ response: {} });
    assert.equal(normalized.compiled, true);
    assert.equal(normalized.success, true);
    assert.equal(normalized.compileProblem, '');
    assert.equal(normalized.exceptionMessage, '');
    assert.equal(normalized.debugLog, '');
});

test('hasExecuteAnonymousSignal rejects empty objects', () => {
    assert.equal(hasExecuteAnonymousSignal({}), false);
    assert.equal(hasExecuteAnonymousSignal({ success: true }), true);
});
