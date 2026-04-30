import assert from 'node:assert/strict';
import { test } from 'node:test';

// hotkeys-js (the dependency of hotkeysmanager) touches `document` on
// first `hotkeys(...)` call to attach keydown/keyup listeners. Node's
// test environment has no DOM, so stub the minimum surface the library
// pokes at before the module is imported. This does NOT install jsdom —
// it's a 10-line shim that mirrors the addEventListener/removeEventListener
// signatures the library looks for.
const noop = () => undefined;
const documentStub = {
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: { style: {} },
    body: null,
};
(globalThis as unknown as { document?: unknown }).document ??= documentStub;
(globalThis as unknown as { window?: unknown }).window ??= {
    addEventListener: noop,
    removeEventListener: noop,
    navigator: { userAgent: 'node-test' },
};
(globalThis as unknown as { navigator?: unknown }).navigator ??= { userAgent: 'node-test' };

// eslint-disable-next-line import/first
import hotkeysManager from '../hotkeysmanager.ts';

type HotkeysSingleton = {
    subscribers: Map<string, Set<(event: unknown) => void>>;
    subscribe: (combo: string, cb: (event: unknown) => void) => void;
    unsubscribe: (combo: string, cb: (event: unknown) => void) => void;
    cleanup: () => void;
};

const hm = hotkeysManager as unknown as HotkeysSingleton;

test.beforeEach(() => {
    // The module exports a long-lived singleton; reset between tests so
    // state from one test doesn't leak into another.
    hm.cleanup();
});

test('hotkeysmanager: singleton exposes a Map-backed subscribers registry', () => {
    assert.ok(hm.subscribers instanceof Map, 'subscribers must be a Map');
});

test('hotkeysmanager: subscribing a new combo records it in the registry', () => {
    const cb = () => undefined;
    hm.subscribe('ctrl+k', cb);
    assert.equal(hm.subscribers.has('ctrl+k'), true);
    const set = hm.subscribers.get('ctrl+k');
    assert.ok(set instanceof Set);
    assert.equal(set.size, 1);
});

test('hotkeysmanager: subscribing the same combo twice adds to the same set without rebinding', () => {
    const cb1 = () => undefined;
    const cb2 = () => undefined;
    hm.subscribe('ctrl+k', cb1);
    hm.subscribe('ctrl+k', cb2);
    assert.equal(hm.subscribers.get('ctrl+k')?.size, 2);
});

test('hotkeysmanager: unsubscribing removes the callback; removes the combo when empty', () => {
    const cb1 = () => undefined;
    const cb2 = () => undefined;
    hm.subscribe('ctrl+k', cb1);
    hm.subscribe('ctrl+k', cb2);
    hm.unsubscribe('ctrl+k', cb1);
    assert.equal(hm.subscribers.get('ctrl+k')?.size, 1, 'first cb should be removed');
    hm.unsubscribe('ctrl+k', cb2);
    assert.equal(hm.subscribers.has('ctrl+k'), false, 'empty combo should be dropped');
});

test('hotkeysmanager: unsubscribing an unknown combo is a no-op', () => {
    assert.doesNotThrow(() => hm.unsubscribe('ctrl+never', () => undefined));
});

test('hotkeysmanager: cleanup clears all subscribers', () => {
    hm.subscribe('ctrl+a', () => undefined);
    hm.subscribe('ctrl+b', () => undefined);
    assert.equal(hm.subscribers.size, 2);
    hm.cleanup();
    assert.equal(hm.subscribers.size, 0);
});
