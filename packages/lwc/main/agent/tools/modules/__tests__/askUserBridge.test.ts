import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createQuestion, resolveQuestion, rejectQuestion } from '../askUserBridge.ts';

test('askUserBridge: resolveQuestion fulfills the pending promise', async () => {
    const p = createQuestion('q1');
    resolveQuestion('q1', 'yes');
    assert.equal(await p, 'yes');
});

test('askUserBridge: rejectQuestion rejects with "Question dismissed"', async () => {
    const p = createQuestion('q2');
    rejectQuestion('q2');
    await assert.rejects(p, /Question dismissed/);
});

test('askUserBridge: unknown id is a silent no-op', () => {
    resolveQuestion('nope', 'ignored');
    rejectQuestion('nope');
    // nothing to assert except no throw
    assert.ok(true);
});

test('askUserBridge: each id tracked independently', async () => {
    const a = createQuestion('a');
    const b = createQuestion('b');
    resolveQuestion('a', 'alpha');
    resolveQuestion('b', 'beta');
    assert.equal(await a, 'alpha');
    assert.equal(await b, 'beta');
});

test('askUserBridge: once resolved, a second resolve for same id is a no-op', async () => {
    const p = createQuestion('once');
    resolveQuestion('once', 'first');
    resolveQuestion('once', 'second'); // no-op; promise already settled
    assert.equal(await p, 'first');
});
