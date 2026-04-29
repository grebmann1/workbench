import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createChromeMock } from '../chromeMock.ts';

test('chromeMock: storage.local.get returns all items when keys is null', async () => {
    const { chrome, _local } = createChromeMock();
    await _local.set('a', 1);
    await _local.set('b', 'x');
    const out = await chrome.storage.local.get(null);
    assert.deepEqual(out, { a: 1, b: 'x' });
});

test('chromeMock: storage.local.get with string key returns that key only', async () => {
    const { chrome, _local } = createChromeMock();
    await _local.set('a', 1);
    await _local.set('b', 2);
    const out = await chrome.storage.local.get('a');
    assert.deepEqual(out, { a: 1 });
});

test('chromeMock: storage.local.get with array of keys returns only present values', async () => {
    const { chrome, _local } = createChromeMock();
    await _local.set('a', 1);
    const out = await chrome.storage.local.get(['a', 'missing']);
    assert.deepEqual(out, { a: 1 });
});

test('chromeMock: storage.local.get with defaults object returns defaults for missing keys', async () => {
    const { chrome } = createChromeMock();
    const out = await chrome.storage.local.get({ a: 'default-a', b: 2 });
    assert.deepEqual(out, { a: 'default-a', b: 2 });
});

test('chromeMock: storage.local.set + remove + clear', async () => {
    const { chrome } = createChromeMock();
    await chrome.storage.local.set({ a: 1, b: 2 });
    assert.deepEqual(await chrome.storage.local.get(null), { a: 1, b: 2 });
    await chrome.storage.local.remove('a');
    assert.deepEqual(await chrome.storage.local.get(null), { b: 2 });
    await chrome.storage.local.clear();
    assert.deepEqual(await chrome.storage.local.get(null), {});
});

test('chromeMock: storage.local and storage.sync are independent', async () => {
    const { chrome } = createChromeMock();
    await chrome.storage.local.set({ a: 'local' });
    await chrome.storage.sync.set({ a: 'sync' });
    const l = await chrome.storage.local.get('a');
    const s = await chrome.storage.sync.get('a');
    assert.equal(l.a, 'local');
    assert.equal(s.a, 'sync');
});

test('chromeMock: runtime.sendMessage routes through runtimeHandler', async () => {
    const { chrome } = createChromeMock({ runtimeHandler: msg => ({ echo: msg }) });
    const r = await chrome.runtime.sendMessage({ ping: true });
    assert.deepEqual(r, { echo: { ping: true } });
});

test('chromeMock: runtime.onMessage listeners fire and can be removed', () => {
    const { chrome } = createChromeMock();
    const events: unknown[] = [];
    const listener = (p: unknown) => events.push(p);
    chrome.runtime.onMessage.addListener(listener);
    assert.equal(chrome.runtime.onMessage.hasListener(listener), true);
    chrome.runtime.onMessage.emit({ message: 'hi', sendResponse: () => {} });
    assert.equal(events.length, 1);
    chrome.runtime.onMessage.removeListener(listener);
    assert.equal(chrome.runtime.onMessage.hasListener(listener), false);
});

test('chromeMock: runtime.getURL prefixes with chrome-extension://mock-id/', () => {
    const { chrome } = createChromeMock();
    assert.equal(
        chrome.runtime.getURL('/views/app.html'),
        'chrome-extension://mock-id/views/app.html'
    );
    assert.equal(chrome.runtime.getURL('plain.html'), 'chrome-extension://mock-id/plain.html');
});

test('chromeMock: tabs.query returns seeded tabs', async () => {
    const tabs = [{ id: 1, url: 'https://a.com', active: true }];
    const { chrome } = createChromeMock({ tabs });
    const out = await chrome.tabs.query({});
    assert.deepEqual(out, tabs);
});

test('chromeMock: reset clears both storage areas and restores tabs', async () => {
    const initialTabs = [{ id: 1, url: 'https://a.com', active: true }];
    const mock = createChromeMock({ tabs: initialTabs });
    await mock.chrome.storage.local.set({ a: 1 });
    await mock.chrome.storage.sync.set({ b: 2 });
    mock.reset();
    assert.deepEqual(await mock.chrome.storage.local.get(null), {});
    assert.deepEqual(await mock.chrome.storage.sync.get(null), {});
    assert.deepEqual(await mock.chrome.tabs.query({}), initialTabs);
});
