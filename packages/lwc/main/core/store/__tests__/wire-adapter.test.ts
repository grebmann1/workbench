import { test } from 'node:test';
import assert from 'node:assert/strict';

import { connectStore } from '../wire-adapter.ts';

function makeFakeStore(initialState: any = {}) {
    let state = initialState;
    const listeners = new Set<() => void>();
    return {
        getState: () => state,
        setState(next: any) {
            state = next;
            listeners.forEach(l => l());
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        listenerCount: () => listeners.size,
    };
}

test('connectStore: connect() before update() does nothing (no store yet)', () => {
    const seen: any[] = [];
    const adapter = new connectStore((state: any) => seen.push(state));
    adapter.connect();
    // No store has been supplied → nothing should have been published
    assert.equal(seen.length, 0);
    assert.equal(adapter.connected, true);
});

test('connectStore: update() subscribes to the store and emits current state immediately', () => {
    const seen: any[] = [];
    const store = makeFakeStore({ count: 1 });
    const adapter = new connectStore((state: any) => seen.push(state));
    adapter.connect();
    adapter.update({ store });
    assert.deepEqual(seen, [{ count: 1 }]);
    assert.equal(store.listenerCount(), 1);
});

test('connectStore: forwards subsequent store changes', () => {
    const seen: any[] = [];
    const store = makeFakeStore({ count: 1 });
    const adapter = new connectStore((state: any) => seen.push(state));
    adapter.connect();
    adapter.update({ store });
    store.setState({ count: 2 });
    store.setState({ count: 3 });
    assert.deepEqual(seen, [{ count: 1 }, { count: 2 }, { count: 3 }]);
});

test('connectStore: disconnect() stops forwarding store changes', () => {
    const seen: any[] = [];
    const store = makeFakeStore({ count: 1 });
    const adapter = new connectStore((state: any) => seen.push(state));
    adapter.connect();
    adapter.update({ store });
    adapter.disconnect();
    store.setState({ count: 99 });
    // Only initial emit captured; post-disconnect update is ignored
    assert.deepEqual(seen, [{ count: 1 }]);
    assert.equal(store.listenerCount(), 0);
    assert.equal(adapter.connected, false);
});

test('connectStore: update() with a new store swaps subscriptions', () => {
    const seen: any[] = [];
    const storeA = makeFakeStore({ n: 'a' });
    const storeB = makeFakeStore({ n: 'b' });
    const adapter = new connectStore((state: any) => seen.push(state));
    adapter.connect();
    adapter.update({ store: storeA });
    adapter.update({ store: storeB });
    storeA.setState({ n: 'a2' });
    storeB.setState({ n: 'b2' });
    // Expect initial A emit, initial B emit, then B update only.
    assert.deepEqual(seen, [{ n: 'a' }, { n: 'b' }, { n: 'b2' }]);
    assert.equal(storeA.listenerCount(), 0);
    assert.equal(storeB.listenerCount(), 1);
});
