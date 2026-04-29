import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reduxSlice as errorSlice } from '../error.ts';

const { addError, clearErrors, removeError } = errorSlice.actions;
const reducer = errorSlice.reducer;

test('addError: normalises an Error instance', () => {
    const err = new Error('boom');
    const state = reducer(undefined, addError(err));
    assert.equal(state.length, 1);
    assert.equal(state[0].message, 'boom');
    assert.ok(state[0].id);
    assert.ok(state[0].time);
});

test('addError: normalises a plain-object error with details + source', () => {
    const state = reducer([] as any, addError({ message: 'x', details: 'd', source: 's' }));
    assert.equal(state[0].message, 'x');
    assert.equal(state[0].details, 'd');
    assert.equal(state[0].source, 's');
});

test('addError: null / undefined becomes "Unknown error"', () => {
    const state = reducer([] as any, addError(null));
    assert.equal(state[0].message, 'Unknown error');
});

test('addError: string error becomes message', () => {
    const state = reducer([] as any, addError('bad thing'));
    assert.equal(state[0].message, 'bad thing');
});

test('removeError: drops the matching id', () => {
    let state = reducer([] as any, addError('first'));
    state = reducer(state, addError('second'));
    const firstId = state[0].id;
    state = reducer(state, removeError(firstId));
    assert.equal(state.length, 1);
    assert.equal(state[0].message, 'second');
});

test('clearErrors: empties the list', () => {
    let state = reducer([] as any, addError('x'));
    state = reducer(state, clearErrors());
    assert.deepEqual(state, []);
});
