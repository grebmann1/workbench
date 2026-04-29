import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSlice, configureStore } from '@reduxjs/toolkit';

import { createInjectableStore } from '../createInjectableStore.ts';

const PROBE_KEY = '__probe_slice__';
const CORE_KEY = 'coreA';

function makeProbe() {
    return createSlice({
        name: PROBE_KEY,
        initialState: { n: 0 },
        reducers: {
            bump(state) {
                state.n += 1;
            },
            set(state, action) {
                state.n = action.payload;
            },
        },
    });
}

function makeCoreSlice() {
    return createSlice({
        name: CORE_KEY,
        initialState: { hit: 0 },
        reducers: {
            ping(state) {
                state.hit += 1;
            },
        },
    });
}

function mkStore() {
    const core = makeCoreSlice();
    const { store, injectReducer, removeReducer } = createInjectableStore(
        { [CORE_KEY]: core.reducer },
        rootReducer => configureStore({ reducer: rootReducer })
    );
    return { store, injectReducer, removeReducer, core };
}

test('static core slice is registered at construction', () => {
    const { store } = mkStore();
    assert.deepEqual(store.getState()[CORE_KEY], { hit: 0 });
});

test('injected key is absent before injection', () => {
    const { store } = mkStore();
    assert.equal(store.getState()[PROBE_KEY], undefined);
});

test('injected slice appears with initial state', () => {
    const { store, injectReducer } = mkStore();
    const probe = makeProbe();
    injectReducer(PROBE_KEY, probe.reducer);
    assert.deepEqual(store.getState()[PROBE_KEY], { n: 0 });
});

test('dispatches reach the injected reducer', () => {
    const { store, injectReducer } = mkStore();
    const probe = makeProbe();
    injectReducer(PROBE_KEY, probe.reducer);
    store.dispatch(probe.actions.bump());
    store.dispatch(probe.actions.bump());
    assert.equal(store.getState()[PROBE_KEY].n, 2);
});

test('unregister callback removes the slice', () => {
    const { store, injectReducer } = mkStore();
    const probe = makeProbe();
    const unregister = injectReducer(PROBE_KEY, probe.reducer);
    unregister();
    assert.equal(store.getState()[PROBE_KEY], undefined);
});

test('removeReducer also clears an injected slice', () => {
    const { store, injectReducer, removeReducer } = mkStore();
    const probe = makeProbe();
    injectReducer(PROBE_KEY, probe.reducer);
    store.dispatch(probe.actions.set(42));
    assert.equal(store.getState()[PROBE_KEY].n, 42);
    removeReducer(PROBE_KEY);
    assert.equal(store.getState()[PROBE_KEY], undefined);
});

test('injecting over a core key throws', () => {
    const { injectReducer } = mkStore();
    assert.throws(
        () => injectReducer(CORE_KEY, state => state ?? null),
        /reserved by a core slice/
    );
});

test('injectReducer rejects invalid key', () => {
    const { injectReducer } = mkStore();
    assert.throws(() => injectReducer('', state => state ?? null), /non-empty string/);
});

test('injectReducer rejects non-function reducer', () => {
    const { injectReducer } = mkStore();
    assert.throws(() => injectReducer('k', 'not a reducer'), /must be a function/);
});

test('removeReducer is a no-op for unknown keys', () => {
    const { removeReducer } = mkStore();
    assert.doesNotThrow(() => removeReducer('never-registered'));
});

test('core slices survive injection + removal cycles', () => {
    const { store, injectReducer, removeReducer, core } = mkStore();
    const probe = makeProbe();
    injectReducer(PROBE_KEY, probe.reducer);
    store.dispatch(core.actions.ping());
    removeReducer(PROBE_KEY);
    store.dispatch(core.actions.ping());
    assert.equal(store.getState()[CORE_KEY].hit, 2);
});

test('re-injection replaces the previous reducer', () => {
    const { store, injectReducer } = mkStore();
    const first = makeProbe();
    injectReducer(PROBE_KEY, first.reducer);
    store.dispatch(first.actions.set(7));

    // A brand-new reducer that doubles the payload on the same action type.
    const second = (state = { n: 0 }, action) => {
        if (action.type === `${PROBE_KEY}/set`) {
            return { n: action.payload * 2 };
        }
        return state;
    };
    injectReducer(PROBE_KEY, second);
    store.dispatch(first.actions.set(10));
    assert.equal(store.getState()[PROBE_KEY].n, 20);
});

test('removeReducer restores state shape: core keys remain, dynamic key drops', () => {
    const { store, injectReducer, removeReducer } = mkStore();
    const probe = makeProbe();
    injectReducer(PROBE_KEY, probe.reducer);
    store.dispatch(probe.actions.set(99));

    const before = store.getState();
    assert.ok(Object.prototype.hasOwnProperty.call(before, CORE_KEY));
    assert.ok(Object.prototype.hasOwnProperty.call(before, PROBE_KEY));

    removeReducer(PROBE_KEY);

    const after = store.getState();
    assert.deepEqual(Object.keys(after).sort(), [CORE_KEY].sort());
    // Core slice state is preserved across the rebuild.
    assert.deepEqual(after[CORE_KEY], before[CORE_KEY]);
});

test('configure callback receives the static root reducer and middleware is preserved', () => {
    const core = makeCoreSlice();
    const middlewareCalls = [];
    const marker = () => next => action => {
        middlewareCalls.push(action.type);
        return next(action);
    };
    const { store, injectReducer } = createInjectableStore(
        { [CORE_KEY]: core.reducer },
        rootReducer =>
            configureStore({
                reducer: rootReducer,
                middleware: getDefault => getDefault().concat(marker),
            })
    );
    store.dispatch(core.actions.ping());

    // Middleware stays wired after a replaceReducer triggered by injection.
    const probe = makeProbe();
    injectReducer(PROBE_KEY, probe.reducer);
    store.dispatch(probe.actions.bump());

    assert.ok(middlewareCalls.includes(`${CORE_KEY}/ping`));
    assert.ok(middlewareCalls.includes(`${PROBE_KEY}/bump`));
});

test('multiple dynamic slices can coexist and be removed independently', () => {
    const { store, injectReducer, removeReducer } = mkStore();
    const probeA = makeProbe();
    const probeB = createSlice({
        name: 'probeB',
        initialState: { s: 'x' },
        reducers: {
            swap(state, action) {
                state.s = action.payload;
            },
        },
    });
    injectReducer(PROBE_KEY, probeA.reducer);
    injectReducer('probeB', probeB.reducer);
    store.dispatch(probeA.actions.set(5));
    store.dispatch(probeB.actions.swap('hello'));
    assert.equal(store.getState()[PROBE_KEY].n, 5);
    assert.equal(store.getState()['probeB'].s, 'hello');

    removeReducer(PROBE_KEY);
    assert.equal(store.getState()[PROBE_KEY], undefined);
    // The other dynamic slice is untouched.
    assert.equal(store.getState()['probeB'].s, 'hello');
});
