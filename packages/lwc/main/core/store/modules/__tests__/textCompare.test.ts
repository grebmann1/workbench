import { test } from 'node:test';
import assert from 'node:assert/strict';

function installLocalStorage() {
    const store: Record<string, string> = {};
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
}

test('textCompare: setLeftText / setRightText update state', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../textCompare.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.setLeftText('hello'));
        assert.equal(s.leftText, 'hello');
        s = r(s, reduxSlice.actions.setRightText('world'));
        assert.equal(s.rightText, 'world');
    } finally {
        removeLocalStorage();
    }
});

test('textCompare: setTexts can set both; swap swaps them', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../textCompare.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.setTexts({ left: 'a', right: 'b' }));
        assert.equal(s.leftText, 'a');
        assert.equal(s.rightText, 'b');
        s = r(s, reduxSlice.actions.swap({}));
        assert.equal(s.leftText, 'b');
        assert.equal(s.rightText, 'a');
    } finally {
        removeLocalStorage();
    }
});

test('textCompare: clear resets left/right', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../textCompare.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.setTexts({ left: 'a', right: 'b' }));
        s = r(s, reduxSlice.actions.clear({}));
        assert.equal(s.leftText, '');
        assert.equal(s.rightText, '');
    } finally {
        removeLocalStorage();
    }
});

test('textCompare: setOptions toggles ignoreWhitespace (coerced to boolean)', async () => {
    installLocalStorage();
    try {
        const { reduxSlice } = await import('../textCompare.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.setOptions({ ignoreWhitespace: 1 }));
        assert.equal(s.ignoreWhitespace, true);
        s = r(s, reduxSlice.actions.setOptions({ ignoreWhitespace: 0 }));
        assert.equal(s.ignoreWhitespace, false);
    } finally {
        removeLocalStorage();
    }
});

test('textCompare: setLeftText persists to localStorage under `<alias>-TEXTCOMPARE_SETTINGS_KEY`', async () => {
    const store = installLocalStorage();
    try {
        const { reduxSlice } = await import('../textCompare.ts');
        const r = reduxSlice.reducer;
        r(undefined, reduxSlice.actions.setLeftText({ value: 'v', alias: 'prod' }));
        const raw = store['prod-TEXTCOMPARE_SETTINGS_KEY'];
        assert.ok(raw, 'expected entry for alias prod');
        const parsed = JSON.parse(raw);
        assert.equal(parsed.leftText, 'v');
    } finally {
        removeLocalStorage();
    }
});

test('textCompare: loadCacheSettings hydrates state from cached JSON', async () => {
    const store = installLocalStorage();
    try {
        store['prod-TEXTCOMPARE_SETTINGS_KEY'] = JSON.stringify({
            leftText: 'cached-L',
            rightText: 'cached-R',
            ignoreWhitespace: true,
        });
        const { reduxSlice } = await import('../textCompare.ts');
        const r = reduxSlice.reducer;
        const s = r(undefined, reduxSlice.actions.loadCacheSettings({ alias: 'prod' }));
        assert.equal(s.leftText, 'cached-L');
        assert.equal(s.rightText, 'cached-R');
        assert.equal(s.ignoreWhitespace, true);
    } finally {
        removeLocalStorage();
    }
});
