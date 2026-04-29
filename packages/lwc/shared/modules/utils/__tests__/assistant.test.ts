import assert from 'node:assert/strict';
import { test } from 'node:test';

type Store = Record<string, string>;

function installLocalStorage(): Store {
    const store: Store = {};
    (globalThis as any).localStorage = {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
            store[k] = String(v);
        },
        removeItem: (k: string) => {
            delete store[k];
        },
        clear: () => {
            for (const k of Object.keys(store)) delete store[k];
        },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() {
            return Object.keys(store).length;
        },
    };
    return store;
}

function removeLocalStorage() {
    delete (globalThis as any).localStorage;
}

test('storeThread / getThread round-trip', async () => {
    installLocalStorage();
    try {
        const mod = await import('../modules/assistant.ts');
        await mod.storeThread('t1', [{ role: 'user', content: 'hi' }]);
        const out = await mod.getThread('t1');
        assert.deepEqual(out, [{ role: 'user', content: 'hi' }]);
    } finally {
        removeLocalStorage();
    }
});

test('getThread: missing / empty threadId returns []', async () => {
    installLocalStorage();
    try {
        const mod = await import('../modules/assistant.ts');
        assert.deepEqual(await mod.getThread(undefined), []);
        assert.deepEqual(await mod.getThread('missing'), []);
    } finally {
        removeLocalStorage();
    }
});

test('upsertThreadList / getThreadList: deduplicates ids', async () => {
    installLocalStorage();
    try {
        const mod = await import('../modules/assistant.ts');
        await mod.upsertThreadList('a');
        await mod.upsertThreadList('b');
        await mod.upsertThreadList('a');
        const list = await mod.getThreadList();
        assert.deepEqual(list.sort(), ['a', 'b']);
    } finally {
        removeLocalStorage();
    }
});

test('deleteThreadList: removes the given id', async () => {
    installLocalStorage();
    try {
        const mod = await import('../modules/assistant.ts');
        await mod.upsertThreadList('a');
        await mod.upsertThreadList('b');
        await mod.deleteThreadList('a');
        assert.deepEqual(await mod.getThreadList(), ['b']);
    } finally {
        removeLocalStorage();
    }
});

test('setThreadList: overwrites the persisted list', async () => {
    installLocalStorage();
    try {
        const mod = await import('../modules/assistant.ts');
        await mod.setThreadList(['x', 'y']);
        assert.deepEqual(await mod.getThreadList(), ['x', 'y']);
    } finally {
        removeLocalStorage();
    }
});

test('getThreadList: returns [] when key is unset', async () => {
    installLocalStorage();
    try {
        const mod = await import('../modules/assistant.ts');
        assert.deepEqual(await mod.getThreadList(), []);
    } finally {
        removeLocalStorage();
    }
});

test('exports GLOBAL_EINSTEIN constant', async () => {
    installLocalStorage();
    try {
        const mod = await import('../modules/assistant.ts');
        assert.equal(mod.GLOBAL_EINSTEIN, 'global_einstein');
    } finally {
        removeLocalStorage();
    }
});
