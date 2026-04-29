import { test } from 'node:test';
import assert from 'node:assert/strict';

function installStorage() {
    const local: Record<string, string> = {};
    const localStorage = {
        getItem: (k: string) => (k in local ? local[k] : null),
        setItem: (k: string, v: string) => {
            local[k] = String(v);
        },
        removeItem: (k: string) => {
            delete local[k];
        },
    };
    const sessionStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    };
    (globalThis as any).window = { localStorage, sessionStorage };
    (globalThis as any).localStorage = localStorage;
    (globalThis as any).sessionStorage = sessionStorage;
    return { local };
}
function removeStorage() {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).sessionStorage;
    delete (globalThis as any).window;
}

test('smartInput: initial state has Default system category and that id as active', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const s = reduxSlice.reducer(undefined, { type: '@@INIT' } as any);
        assert.equal(s.categories.length, 1);
        assert.equal(s.categories[0].name, 'Default');
        assert.equal(s.categories[0].ref, 'A');
        assert.equal(s.activeCategoryId, s.categories[0].id);
        assert.equal(s.isLeftPanelOpen, false);
    } finally {
        removeStorage();
    }
});

test('smartInput: toggleLeftPanel / setLeftPanelOpen flip flag', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.toggleLeftPanel({} as any));
        assert.equal(s.isLeftPanelOpen, true);
        s = r(s, reduxSlice.actions.setLeftPanelOpen(false));
        assert.equal(s.isLeftPanelOpen, false);
        s = r(s, reduxSlice.actions.setLeftPanelOpen(true));
        assert.equal(s.isLeftPanelOpen, true);
    } finally {
        removeStorage();
    }
});

test('smartInput: setCategories overwrites, setActiveCategoryId updates', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.setCategories([{ id: 'x', name: 'X', ref: 'A' }]));
        assert.equal(s.categories.length, 1);
        assert.equal(s.categories[0].id, 'x');
        s = r(s, reduxSlice.actions.setActiveCategoryId('x'));
        assert.equal(s.activeCategoryId, 'x');
    } finally {
        removeStorage();
    }
});

test('smartInput: addCategory auto-assigns next ref (B after existing A)', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const r = reduxSlice.reducer;
        const s = r(undefined, reduxSlice.actions.addCategory({ id: 'c2', name: 'Custom' }));
        assert.equal(s.categories.length, 2);
        const added = s.categories.find((c: any) => c.id === 'c2');
        assert.equal(added.ref, 'B');
        assert.equal(added.type, 'custom');
        assert.equal(s.activeCategoryId, 'c2');
    } finally {
        removeStorage();
    }
});

test('smartInput: addCategory honors explicit valid ref', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const r = reduxSlice.reducer;
        const s = r(undefined, reduxSlice.actions.addCategory({ id: 'c2', name: 'X', ref: 'Z' }));
        assert.equal(s.categories.find((c: any) => c.id === 'c2').ref, 'Z');
    } finally {
        removeStorage();
    }
});

test('smartInput: updateCategory replaces entry with same id', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.addCategory({ id: 'c2', name: 'Old' }));
        s = r(s, reduxSlice.actions.updateCategory({ id: 'c2', name: 'New', ref: 'B' }));
        assert.equal(s.categories.find((c: any) => c.id === 'c2').name, 'New');
    } finally {
        removeStorage();
    }
});

test('smartInput: deleteItemOrCategory removes custom category and resets activeCategoryId', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.addCategory({ id: 'c2', name: 'Custom' }));
        assert.equal(s.activeCategoryId, 'c2');
        s = r(s, reduxSlice.actions.deleteItemOrCategory('c2'));
        assert.ok(!s.categories.find((c: any) => c.id === 'c2'));
        assert.equal(s.activeCategoryId, s.categories[0].id);
    } finally {
        removeStorage();
    }
});

test('smartInput: reset returns to initial state', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../smartInput.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.setLeftPanelOpen(true));
        s = r(s, reduxSlice.actions.reset());
        assert.equal(s.isLeftPanelOpen, false);
        assert.equal(s.categories.length, 1);
    } finally {
        removeStorage();
    }
});
