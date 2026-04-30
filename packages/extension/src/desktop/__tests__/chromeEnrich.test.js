import assert from 'node:assert/strict';
import { before, test } from 'node:test';

/**
 * chromeEnrich.js is a side-effect module with a single top-level guard:
 *   if (window && window.desktop && chrome) { patch chrome.* }
 *
 * Node caches ESM modules by URL, so we can only evaluate the module once
 * in a test file. We install the "desktop + chrome present" env up front
 * and cover the patch surface. The negative-path branches (no window,
 * no chrome, pre-existing storage) aren't reachable from here without a
 * fresh Node worker — not worth the complexity for a guard this small.
 */

function makeWebStorage() {
    const backing = {};
    const storage = {
        getItem: k => (k in backing ? backing[k] : null),
        setItem: (k, v) => {
            backing[k] = String(v);
        },
        removeItem: k => {
            delete backing[k];
        },
        get length() {
            return Object.keys(backing).length;
        },
        _backing: backing,
    };
    return storage;
}

before(async () => {
    const localStorage = makeWebStorage();
    const sessionStorage = makeWebStorage();
    globalThis.localStorage = localStorage;
    globalThis.sessionStorage = sessionStorage;
    // chromeEnrich uses Object.keys(webStorage) to enumerate. Patch Object.keys
    // to look into the _backing map for our storage stubs.
    const origKeys = Object.keys.bind(Object);
    Object.keys = obj => {
        if (obj === localStorage || obj === sessionStorage) {
            return origKeys(obj._backing);
        }
        return origKeys(obj);
    };
    globalThis.window = { desktop: {}, location: { origin: 'http://localhost:3000' } };
    globalThis.chrome = { runtime: {} };
    await import('../chromeEnrich.js');
});

test('chromeEnrich: chrome.runtime.getURL resolves relative to window.location.origin', () => {
    assert.equal(
        globalThis.chrome.runtime.getURL('/views/app.html'),
        'http://localhost:3000/views/app.html'
    );
});

test('chromeEnrich: chrome.runtime.getURL normalises leading slash', () => {
    assert.equal(
        globalThis.chrome.runtime.getURL('views/app.html'),
        'http://localhost:3000/views/app.html'
    );
});

test('chromeEnrich: installs chrome.storage with local/sync/session areas', () => {
    assert.ok(globalThis.chrome.storage.local);
    assert.ok(globalThis.chrome.storage.sync);
    assert.ok(globalThis.chrome.storage.session);
});

test('chromeEnrich: storage.local set + get round-trips JSON values', async () => {
    await globalThis.chrome.storage.local.set({ foo: { n: 1, s: 'x' } });
    const got = await globalThis.chrome.storage.local.get('foo');
    assert.deepEqual(got, { foo: { n: 1, s: 'x' } });
});

test('chromeEnrich: storage.local.get returns defaults for missing keys (object arg)', async () => {
    const got = await globalThis.chrome.storage.local.get({ missing: 'fallback' });
    assert.deepEqual(got, { missing: 'fallback' });
});

test('chromeEnrich: storage.local.get with callback', async () => {
    await globalThis.chrome.storage.local.set({ cb: 42 });
    await new Promise(resolve => {
        globalThis.chrome.storage.local.get('cb', result => {
            assert.deepEqual(result, { cb: 42 });
            resolve();
        });
    });
});

test('chromeEnrich: storage.local.remove deletes a single key', async () => {
    await globalThis.chrome.storage.local.set({ del1: 1, del2: 2 });
    await globalThis.chrome.storage.local.remove('del1');
    const after = await globalThis.chrome.storage.local.get(['del1', 'del2']);
    assert.deepEqual(after, { del2: 2 });
});

test('chromeEnrich: storage.local.remove deletes an array of keys', async () => {
    await globalThis.chrome.storage.local.set({ r1: 1, r2: 2, r3: 3 });
    await globalThis.chrome.storage.local.remove(['r1', 'r2']);
    const after = await globalThis.chrome.storage.local.get(['r1', 'r2', 'r3']);
    assert.deepEqual(after, { r3: 3 });
});

test('chromeEnrich: session storage is backed separately from local', async () => {
    await globalThis.chrome.storage.local.set({ shared: 'L' });
    await globalThis.chrome.storage.session.set({ shared: 'S' });
    const l = await globalThis.chrome.storage.local.get('shared');
    const s = await globalThis.chrome.storage.session.get('shared');
    assert.equal(l.shared, 'L');
    assert.equal(s.shared, 'S');
});

test('chromeEnrich: get with string key returns value under that key', async () => {
    await globalThis.chrome.storage.local.set({ strKey: 'hello' });
    const got = await globalThis.chrome.storage.local.get('strKey');
    assert.equal(got.strKey, 'hello');
});

test('chromeEnrich: non-JSON value falls back to raw string', async () => {
    // Inject a raw string bypassing set (simulates pre-existing localStorage data).
    globalThis.localStorage.setItem('raw', 'not-json-at-all');
    const got = await globalThis.chrome.storage.local.get('raw');
    assert.equal(got.raw, 'not-json-at-all');
});

test('chromeEnrich: set accepts callback', async () => {
    await new Promise(resolve => {
        globalThis.chrome.storage.local.set({ cb2: 'ok' }, () => resolve());
    });
    const got = await globalThis.chrome.storage.local.get('cb2');
    assert.equal(got.cb2, 'ok');
});
