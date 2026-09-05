import assert from 'node:assert/strict';
import { test } from 'node:test';

// The module reads `window.localStorage` / `window.sessionStorage` at call
// time; install an in-memory shim before importing so `basicStore` binds to
// it. `chromeStore` is also exercised with a minimal chrome.storage shim.
class MemStorage {
    private data = new Map<string, string>();
    getItem(key: string): string | null {
        return this.data.has(key) ? this.data.get(key)! : null;
    }
    setItem(key: string, value: string) {
        this.data.set(key, value);
    }
    removeItem(key: string) {
        this.data.delete(key);
    }
    clear() {
        this.data.clear();
    }
}

const localStorage = new MemStorage();
const sessionStorage = new MemStorage();

(globalThis as any).window = { localStorage, sessionStorage };

// Minimal chrome.storage shim — two keyed bags (local + sync). API is
// callback-based in the real Chrome API.
const chromeBags = { local: new Map<string, unknown>(), sync: new Map<string, unknown>() };
(globalThis as any).chrome = {
    runtime: {},
    storage: {
        local: {
            get(keys: string[], cb: (r: Record<string, unknown>) => void) {
                const out: Record<string, unknown> = {};
                for (const k of keys) if (chromeBags.local.has(k)) out[k] = chromeBags.local.get(k);
                cb(out);
            },
            set(items: Record<string, unknown>, cb: () => void) {
                for (const [k, v] of Object.entries(items)) chromeBags.local.set(k, v);
                cb();
            },
            remove(key: string, cb: () => void) {
                chromeBags.local.delete(key);
                cb();
            },
        },
        sync: {
            get(keys: string[], cb: (r: Record<string, unknown>) => void) {
                const out: Record<string, unknown> = {};
                for (const k of keys) if (chromeBags.sync.has(k)) out[k] = chromeBags.sync.get(k);
                cb(out);
            },
            set(items: Record<string, unknown>, cb: () => void) {
                for (const [k, v] of Object.entries(items)) chromeBags.sync.set(k, v);
                cb();
            },
            remove(key: string, cb: () => void) {
                chromeBags.sync.delete(key);
                cb();
            },
        },
    },
};

const { chromeStore, basicStore } = await import('../interfaces.ts');

test('basicStore: round-trips JSON via localStorage', async () => {
    localStorage.clear();
    const store = basicStore('local');
    await store.setItem('k', { a: 1 });
    const v = await store.getItem<{ a: number }>('k');
    assert.deepEqual(v, { a: 1 });
});

test('basicStore: getItem returns null for missing keys', async () => {
    localStorage.clear();
    const store = basicStore('local');
    assert.equal(await store.getItem('missing'), null);
});

test('basicStore: removeItem clears the entry', async () => {
    localStorage.clear();
    const store = basicStore('local');
    await store.setItem('k', 'hello');
    await store.removeItem('k');
    assert.equal(await store.getItem('k'), null);
});

test('basicStore: setItem coerces null to the literal "null" (legacy readers)', async () => {
    localStorage.clear();
    const store = basicStore('local');
    await store.setItem('k', null);
    // Direct peek: stored value is the string "null".
    assert.equal(localStorage.getItem('k'), 'null');
    // But getItem normalizes "null" back to null.
    assert.equal(await store.getItem('k'), null);
});

test('basicStore: session variant targets sessionStorage', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const store = basicStore('session');
    await store.setItem('sk', 42);
    assert.equal(localStorage.getItem('sk'), null);
    assert.equal(sessionStorage.getItem('sk'), '42');
    assert.equal(await store.getItem<number>('sk'), 42);
});

test('basicStore: rejects invalid variant', () => {
    assert.throws(() => basicStore('bogus' as any), /Invalid variant/);
});

test('basicStore: getItem invokes callback with parsed value', async () => {
    localStorage.clear();
    const store = basicStore('local');
    await store.setItem('k', 7);
    let seen: number | null = -1 as any;
    await store.getItem<number>('k', v => {
        seen = v ?? null;
    });
    assert.equal(seen, 7);
});

test('chromeStore: round-trips via chrome.storage.local', async () => {
    chromeBags.local.clear();
    const store = chromeStore('local');
    await store.setItem('ck', 'hello');
    assert.equal(chromeBags.local.get('ck'), 'hello');
    const v = await store.getItem<string>('ck');
    assert.equal(v, 'hello');
    await store.removeItem('ck');
    assert.equal(chromeBags.local.has('ck'), false);
});

test('chromeStore: sync variant targets chrome.storage.sync', async () => {
    chromeBags.local.clear();
    chromeBags.sync.clear();
    const store = chromeStore('sync');
    await store.setItem('sk', { x: 1 });
    assert.equal(chromeBags.local.has('sk'), false);
    assert.deepEqual(chromeBags.sync.get('sk'), { x: 1 });
});

test('chromeStore: rejects invalid variant', () => {
    assert.throws(() => chromeStore('bogus' as any), /Invalid variant/);
});

test('chromeStore: setItem rejects when chrome.runtime.lastError is set', async () => {
    chromeBags.local.clear();
    const store = chromeStore('local');
    const originalSet = (globalThis as any).chrome.storage.local.set;
    (globalThis as any).chrome.storage.local.set = (
        _items: Record<string, unknown>,
        cb: () => void
    ) => {
        (globalThis as any).chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
        cb();
        (globalThis as any).chrome.runtime.lastError = undefined;
    };
    try {
        await assert.rejects(() => store.setItem('ck', 'nope'), /QUOTA_BYTES quota exceeded/);
        assert.equal(chromeBags.local.has('ck'), false);
    } finally {
        (globalThis as any).chrome.storage.local.set = originalSet;
    }
});
