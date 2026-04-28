import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    createQuestion,
    resolveQuestion,
    rejectQuestion,
} from '../modules/askUserBridge.ts';

test('createQuestion: pending promise resolves when resolveQuestion is called', async () => {
    const promise = createQuestion('q1');
    resolveQuestion('q1', 'the answer');
    assert.equal(await promise, 'the answer');
});

test('createQuestion: rejects with "Question dismissed" on rejectQuestion', async () => {
    const promise = createQuestion('q2');
    rejectQuestion('q2');
    await assert.rejects(promise, /Question dismissed/);
});

test('resolveQuestion: unknown id is a silent no-op', () => {
    assert.doesNotThrow(() => resolveQuestion('no-such-id', 'x'));
});

test('rejectQuestion: unknown id is a silent no-op', () => {
    assert.doesNotThrow(() => rejectQuestion('no-such-id'));
});

test('createQuestion: concurrent questions are tracked by distinct ids', async () => {
    const a = createQuestion('A');
    const b = createQuestion('B');
    resolveQuestion('B', 'b-value');
    resolveQuestion('A', 'a-value');
    assert.equal(await a, 'a-value');
    assert.equal(await b, 'b-value');
});

test('resolveQuestion: second resolve for same id is a no-op (entry was removed)', async () => {
    const p = createQuestion('once');
    resolveQuestion('once', 'first');
    // second call should not throw and the original promise stays resolved to 'first'
    assert.doesNotThrow(() => resolveQuestion('once', 'second'));
    assert.equal(await p, 'first');
});
