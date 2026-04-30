import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTestStore, waitForState } from '../reduxHarness.ts';

test('createTestStore: default noop reducer produces a usable store', () => {
    const { store, dispatched } = createTestStore();
    assert.deepEqual(store.getState(), { _noop: null });
    assert.deepEqual(dispatched, []);
});

test('createTestStore: custom reducers + preloaded state', () => {
    const counter = (state: number = 0, action: { type: string }) =>
        action.type === 'inc' ? state + 1 : state;
    const { store } = createTestStore({
        reducers: { counter },
        preloadedState: { counter: 5 },
    });
    assert.equal((store.getState() as { counter: number }).counter, 5);
    store.dispatch({ type: 'inc' });
    assert.equal((store.getState() as { counter: number }).counter, 6);
});

test('createTestStore: dispatched array records every action', () => {
    const { store, dispatched } = createTestStore();
    store.dispatch({ type: 'foo' });
    store.dispatch({ type: 'bar', payload: 1 });
    assert.equal(dispatched.length, 2);
    assert.equal(dispatched[0].type, 'foo');
    assert.equal(dispatched[1].type, 'bar');
});

test('createTestStore: reset clears dispatched log', () => {
    const { store, dispatched, reset } = createTestStore();
    store.dispatch({ type: 'x' });
    assert.equal(dispatched.length, 1);
    reset();
    assert.equal(dispatched.length, 0);
});

test('createTestStore: extra middlewares run in order', () => {
    const order: string[] = [];
    const m1 = () => (next: (a: unknown) => unknown) => (action: unknown) => {
        order.push('m1');
        return next(action);
    };
    const m2 = () => (next: (a: unknown) => unknown) => (action: unknown) => {
        order.push('m2');
        return next(action);
    };
    const { store } = createTestStore({ middlewares: [m1 as any, m2 as any] });
    store.dispatch({ type: 'x' });
    assert.deepEqual(order, ['m1', 'm2']);
});

test('waitForState: resolves synchronously when predicate already matches', async () => {
    const counter = (state: number = 7) => state;
    const { store } = createTestStore({ reducers: { counter } });
    const value = await waitForState(store, state =>
        (state as { counter: number }).counter === 7 ? 'matched' : false
    );
    assert.equal(value, 'matched');
});

test('waitForState: resolves when predicate becomes true after dispatch', async () => {
    const counter = (state: number = 0, action: { type: string }) =>
        action.type === 'inc' ? state + 1 : state;
    const { store } = createTestStore({ reducers: { counter } });
    const pending = waitForState(store, state =>
        (state as { counter: number }).counter >= 2 ? 'done' : false
    );
    store.dispatch({ type: 'inc' });
    store.dispatch({ type: 'inc' });
    assert.equal(await pending, 'done');
});

test('waitForState: rejects on timeout when predicate never matches', async () => {
    const { store } = createTestStore();
    await assert.rejects(
        waitForState(store, () => false, { timeoutMs: 20 }),
        /did not match within 20ms/
    );
});
