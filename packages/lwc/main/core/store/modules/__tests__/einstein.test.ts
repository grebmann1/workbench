import assert from 'node:assert/strict';
import { test } from 'node:test';

function installLocalStorage() {
    const store: Record<string, string> = {};
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
            store[k] = String(v);
        },
        removeItem: (k: string) => {
            delete store[k];
        },
    };
    return store;
}
function removeLocalStorage() {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).window;
}

test('einstein: MODEL_OPTIONS and PROVIDER_OPTIONS expose label+value pairs', async () => {
    installLocalStorage();
    try {
        const { MODEL_OPTIONS, PROVIDER_OPTIONS } = await import('../einstein.ts');
        assert.ok(MODEL_OPTIONS.length > 0);
        for (const opt of MODEL_OPTIONS) {
            assert.equal(typeof opt.label, 'string');
            assert.equal(typeof opt.value, 'string');
        }
        const providerValues = PROVIDER_OPTIONS.map(p => p.value);
        assert.ok(providerValues.includes('openai'));
        assert.ok(providerValues.includes('apex'));
    } finally {
        removeLocalStorage();
    }
});

test('einstein: initial state has defaults', async () => {
    installLocalStorage();
    try {
        const { reduxSlice, MODEL_OPTIONS } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        const s = r(undefined, { type: '@@INIT' } as any);
        assert.equal(s.provider, 'apex');
        assert.equal(s.model, MODEL_OPTIONS[0].value);
        assert.deepEqual(s.errorIds, []);
        assert.deepEqual(s.dialog.ids, []);
    } finally {
        removeLocalStorage();
    }
});

test('einstein: updateProvider / updateModel set state', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.updateProvider({ provider: 'openai' }));
        assert.equal(s.provider, 'openai');
        s = r(s, reduxSlice.actions.updateModel({ model: 'gpt-5-2025-08-07' }));
        assert.equal(s.model, 'gpt-5-2025-08-07');
    } finally {
        removeLocalStorage();
    }
});

test('einstein: updateConnectionAlias sets alias', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        const s = r(
            undefined,
            reduxSlice.actions.updateConnectionAlias({
                connectionAlias: 'prod',
            })
        );
        assert.equal(s.connectionAlias, 'prod');
    } finally {
        removeLocalStorage();
    }
});

test('einstein: addTab creates dialog and sets currentDialogId', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        const s = r(undefined, reduxSlice.actions.addTab({ tab: { id: 'T1' } }));
        assert.equal(s.currentDialogId, 'T1');
        assert.equal(s.dialog.ids.length, 1);
    } finally {
        removeLocalStorage();
    }
});

test('einstein: selectionTab updates currentDialogId', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.addTab({ tab: { id: 'T1' } }));
        s = r(s, reduxSlice.actions.addTab({ tab: { id: 'T2' } }));
        s = r(s, reduxSlice.actions.selectionTab({ id: 'T1' }));
        assert.equal(s.currentDialogId, 'T1');
    } finally {
        removeLocalStorage();
    }
});

test('einstein: removeTab drops dialog and reassigns currentDialogId when it was active', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.addTab({ tab: { id: 't1' } }));
        s = r(s, reduxSlice.actions.addTab({ tab: { id: 't2' } }));
        s = r(s, reduxSlice.actions.removeTab({ id: 't2' }));
        assert.equal(s.dialog.ids.length, 1);
        assert.equal(s.currentDialogId, 't1');
    } finally {
        removeLocalStorage();
    }
});

test('einstein: clearDialog removes by id', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.addTab({ tab: { id: 'T1' } }));
        s = r(s, reduxSlice.actions.clearDialog({ id: 't1' }));
        assert.equal(s.dialog.ids.length, 0);
    } finally {
        removeLocalStorage();
    }
});

test('einstein: updateMessage upserts data onto dialog id', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.addTab({ tab: { id: 'T1' } }));
        s = r(
            s,
            reduxSlice.actions.updateMessage({
                dialogId: 'T1',
                data: [{ role: 'user', content: 'hi' }],
            })
        );
        const entry: any = s.dialog.entities.t1;
        assert.equal(entry.data.length, 1);
        assert.equal(entry.data[0].content, 'hi');
    } finally {
        removeLocalStorage();
    }
});

test('einstein: saveCacheSettings persists to localStorage under `<alias>-EINSTEIN_SETTINGS_KEY`', async () => {
    const store = installLocalStorage();
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        r(undefined, reduxSlice.actions.saveCacheSettings({ alias: 'prod' }));
        assert.ok(store['prod-EINSTEIN_SETTINGS_KEY']);
    } finally {
        removeLocalStorage();
    }
});

test('einstein: loadCacheSettings hydrates from JSON', async () => {
    const store = installLocalStorage();
    store['prod-EINSTEIN_SETTINGS_KEY'] = JSON.stringify({
        dialog: { ids: [], entities: {} },
        connectionAlias: 'hydrated',
        provider: 'openai',
        model: 'gpt-5-nano-2025-08-07',
    });
    try {
        const { reduxSlice } = await import('../einstein.ts');
        const r = reduxSlice.reducer;
        const s = r(undefined, reduxSlice.actions.loadCacheSettings({ alias: 'prod' }));
        assert.equal(s.connectionAlias, 'hydrated');
        assert.equal(s.provider, 'openai');
        assert.equal(s.model, 'gpt-5-nano-2025-08-07');
    } finally {
        removeLocalStorage();
    }
});
