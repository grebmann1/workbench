/**
 * Slice-behavior tests for the recordviewer `recordViewer` slice.
 *
 * Why we don't import `../recordViewer.ts` directly
 * -------------------------------------------
 * The slice file imports `host-api/store`, which transitively loads the
 * full core store graph including LWC components decorated with `@api`
 * (invalid syntax under plain Node — the test runner can't parse them).
 * Stubbing `host-api/store` via an ESM resolver hook from the test file
 * is unreliable because `module.register()` and dynamic-import scheduling
 * race with the existing tsconfig-paths resolver.
 *
 * Pragmatic alternative: re-construct the same `reducers` the slice uses
 * (a faithful clone built with `createSlice`), and pin the behavior
 * contract here. Any drift between this test and `../recordViewer.ts` will
 * be caught in code review AND by the "source contract" tests below, which
 * `readFileSync` the real source and regex-match key lines. This mirrors
 * the pattern established in
 * `packages/lwc/applications/agentforce/slices/__tests__/agents.test.ts`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSlice } from '@reduxjs/toolkit';

// ---------------------------------------------------------------------------
// In-memory localStorage stub — plain Node has no `localStorage` global.
// Only used by the loadCacheSettings/saveCacheSettings behavior tests.
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
    const backing = new Map<string, string>();
    return {
        getItem(key: string) {
            return backing.has(key) ? backing.get(key)! : null;
        },
        setItem(key: string, value: string) {
            backing.set(key, value);
        },
        removeItem(key: string) {
            backing.delete(key);
        },
        clear() {
            backing.clear();
        },
        _backing: backing,
    };
}

// ---------------------------------------------------------------------------
// Test rig: faithful clone of the recordviewer slice.
// MUST stay in sync with `slices/recordViewer.ts`. The "source contract"
// tests below pin the real source text so drift is caught.
// ---------------------------------------------------------------------------

const RECORDVIEWER_SETTINGS_KEY = 'RECORDVIEWER_SETTINGS_KEY';

function isNotUndefinedOrNull(value: unknown): boolean {
    return value !== undefined && value !== null;
}

function loadCacheSettingsClone(alias: string) {
    try {
        const configText = (globalThis as any).localStorage.getItem(
            `${alias}-${RECORDVIEWER_SETTINGS_KEY}`
        );
        if (configText) return JSON.parse(configText);
    } catch (e) {
        // Real slice dispatches ERROR.reduxSlice.actions.addError here — omitted
        // in the clone since we can't import host-api/store (see file header).
    }
    return null;
}

function saveCacheSettingsClone(alias: string, state: any) {
    try {
        const { tabs, recentPanelToggled } = state;
        (globalThis as any).localStorage.setItem(
            `${alias}-${RECORDVIEWER_SETTINGS_KEY}`,
            JSON.stringify({ tabs, recentPanelToggled })
        );
    } catch (e) {
        // Real slice dispatches ERROR.reduxSlice.actions.addError here — omitted
        // in the clone since we can't import host-api/store (see file header).
    }
}

export const formatTabClone = (payload: Record<string, unknown>) => {
    const validParams = ['id', 'refreshedDate', 'record', 'recordType'];
    const tab: Record<string, unknown> = {};
    validParams.forEach(key => {
        if (key in payload && payload[key] !== undefined) {
            tab[key] = payload[key];
        }
    });
    return tab;
};

const initialState = {
    tabs: [] as any[],
    currentTab: null as any,
    recentPanelToggled: false,
};

const testSlice = createSlice({
    name: 'recordViewerTest',
    initialState,
    reducers: {
        loadCacheSettings: (state, action: { payload: { alias: string } }) => {
            const { alias } = action.payload;
            const cachedConfig = loadCacheSettingsClone(alias);
            if (cachedConfig) {
                const { tabs, recentPanelToggled } = cachedConfig;
                Object.assign(state, { tabs, recentPanelToggled });
            }
        },
        saveCacheSettings: (state, action: { payload: { alias?: string } }) => {
            const { alias } = action.payload;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsClone(alias as string, state);
            }
        },
        updateRecentPanel: (state, action: { payload: { value: unknown; alias?: string } }) => {
            const { value, alias } = action.payload;
            state.recentPanelToggled = value === true;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsClone(alias as string, state);
            }
        },
        upsertTab: (state, action: { payload: { tab: any } }) => {
            const { tab } = action.payload;
            const indexTab = state.tabs.findIndex(x => x.id === tab.id);
            if (indexTab < 0) {
                state.tabs.push(tab);
                state.currentTab = tab;
            } else {
                const originalTab = state.tabs.find(x => x.id === tab.id);
                const newTab = Object.assign(originalTab, tab);
                state.tabs[indexTab] = newTab;
                state.currentTab = newTab;
            }
        },
        removeTab: (state, action: { payload: { id: any; alias?: string } }) => {
            const { id, alias } = action.payload;
            state.tabs = state.tabs.filter(x => x.id != id);
            // eslint-disable-next-line eqeqeq
            if (state.tabs.length > 0 && state.currentTab.id == id) {
                const lastTab = state.tabs[state.tabs.length - 1];
                state.currentTab = lastTab;
            }
            if (state.tabs.length == 0) {
                state.currentTab = null;
            }
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsClone(alias as string, state);
            }
        },
        selectionTab: (state, action: { payload: { id: any } }) => {
            const { id } = action.payload;
            // eslint-disable-next-line eqeqeq
            const tab = state.tabs.find(x => x.id == id);
            if (tab) {
                state.currentTab = tab;
            }
        },
    },
});

function makeState(overrides: Partial<typeof initialState> = {}) {
    return { ...initialState, ...overrides };
}

// ---------------------------------------------------------------------------
// formatTab
// ---------------------------------------------------------------------------

test('formatTab: whitelist-copies only id, refreshedDate, record, recordType', () => {
    const result = formatTabClone({
        id: '1',
        refreshedDate: '2026-08-08',
        record: { Name: 'Acme' },
        recordType: '012',
        extraneous: 'should be dropped',
        anotherOne: 42,
    });

    assert.deepEqual(result, {
        id: '1',
        refreshedDate: '2026-08-08',
        record: { Name: 'Acme' },
        recordType: '012',
    });
});

test('formatTab: drops whitelisted keys whose value is undefined', () => {
    const result = formatTabClone({
        id: '1',
        refreshedDate: undefined,
        record: { Name: 'Acme' },
    });

    assert.deepEqual(result, { id: '1', record: { Name: 'Acme' } });
    assert.ok(!('refreshedDate' in result), 'undefined-valued whitelisted key must be excluded');
});

test('formatTab: returns empty object when payload has no whitelisted keys', () => {
    const result = formatTabClone({ foo: 'bar' });
    assert.deepEqual(result, {});
});

// ---------------------------------------------------------------------------
// updateRecentPanel
// ---------------------------------------------------------------------------

test('updateRecentPanel: sets recentPanelToggled true only for strict boolean true', () => {
    const before = makeState({ recentPanelToggled: false });
    const next = testSlice.reducer(before, testSlice.actions.updateRecentPanel({ value: true }));
    assert.equal(next.recentPanelToggled, true);
});

test('updateRecentPanel: coerces truthy-but-not-strictly-true values to false', () => {
    for (const truthy of ['true', 1, {}, [], 'yes']) {
        const before = makeState({ recentPanelToggled: true });
        const next = testSlice.reducer(
            before,
            testSlice.actions.updateRecentPanel({ value: truthy })
        );
        assert.equal(
            next.recentPanelToggled,
            false,
            `value ${JSON.stringify(truthy)} must coerce to false (strict === true check)`
        );
    }
});

test('updateRecentPanel: sets recentPanelToggled false for false', () => {
    const before = makeState({ recentPanelToggled: true });
    const next = testSlice.reducer(before, testSlice.actions.updateRecentPanel({ value: false }));
    assert.equal(next.recentPanelToggled, false);
});

// ---------------------------------------------------------------------------
// upsertTab
// ---------------------------------------------------------------------------

test('upsertTab: inserts a new tab and sets it as currentTab', () => {
    const before = makeState();
    const tab = { id: 't1', record: { Name: 'Acme' } };
    const next = testSlice.reducer(before, testSlice.actions.upsertTab({ tab }));

    assert.deepEqual(next.tabs, [tab]);
    assert.deepEqual(next.currentTab, tab);
});

test('upsertTab: merges into an existing tab by id, preserving unspecified fields', () => {
    const existing = { id: 't1', record: { Name: 'Acme' }, recordType: '012' };
    const before = makeState({ tabs: [existing], currentTab: existing });

    const update = { id: 't1', refreshedDate: '2026-08-08' };
    const next = testSlice.reducer(before, testSlice.actions.upsertTab({ tab: update }));

    assert.equal(next.tabs.length, 1);
    assert.deepEqual(next.tabs[0], {
        id: 't1',
        record: { Name: 'Acme' },
        recordType: '012',
        refreshedDate: '2026-08-08',
    });
    assert.deepEqual(next.currentTab, next.tabs[0]);
});

// ---------------------------------------------------------------------------
// removeTab
// ---------------------------------------------------------------------------

test('removeTab: removing the current tab reassigns currentTab to the new last tab', () => {
    const tabA = { id: 'a' };
    const tabB = { id: 'b' };
    const before = makeState({ tabs: [tabA, tabB], currentTab: tabB });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'b' }));

    assert.deepEqual(next.tabs, [tabA]);
    assert.deepEqual(next.currentTab, tabA);
});

test('removeTab: removing a non-current tab leaves currentTab untouched', () => {
    const tabA = { id: 'a' };
    const tabB = { id: 'b' };
    const before = makeState({ tabs: [tabA, tabB], currentTab: tabB });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'a' }));

    assert.deepEqual(next.tabs, [tabB]);
    assert.deepEqual(
        next.currentTab,
        tabB,
        'currentTab must be untouched when a non-current tab is removed'
    );
});

test('removeTab: sets currentTab to null when tabs becomes empty', () => {
    const tabA = { id: 'a' };
    const before = makeState({ tabs: [tabA], currentTab: tabA });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'a' }));

    assert.deepEqual(next.tabs, []);
    assert.equal(next.currentTab, null);
});

// ---------------------------------------------------------------------------
// selectionTab
// ---------------------------------------------------------------------------

test('selectionTab: sets currentTab when a matching tab is found', () => {
    const tabA = { id: 'a' };
    const tabB = { id: 'b' };
    const before = makeState({ tabs: [tabA, tabB], currentTab: tabA });

    const next = testSlice.reducer(before, testSlice.actions.selectionTab({ id: 'b' }));

    assert.deepEqual(next.currentTab, tabB);
});

test('selectionTab: leaves currentTab unchanged when no tab matches', () => {
    const tabA = { id: 'a' };
    const before = makeState({ tabs: [tabA], currentTab: tabA });

    const next = testSlice.reducer(
        before,
        testSlice.actions.selectionTab({ id: 'does-not-exist' })
    );

    assert.deepEqual(next.currentTab, tabA);
});

// ---------------------------------------------------------------------------
// loadCacheSettings / saveCacheSettings — exercised via a stubbed localStorage
// ---------------------------------------------------------------------------

test('saveCacheSettings then loadCacheSettings: persists tabs + recentPanelToggled, NOT currentTab', () => {
    const originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = makeLocalStorageStub();
    try {
        const tabs = [{ id: 't1', record: { Name: 'Acme' } }];
        const before = makeState({ tabs, currentTab: tabs[0], recentPanelToggled: true });

        const afterSave = testSlice.reducer(
            before,
            testSlice.actions.saveCacheSettings({ alias: 'myOrg' })
        );

        // saveCacheSettings does not itself mutate state; confirm it round-trips.
        assert.deepEqual(afterSave, before);

        const raw = (globalThis as any).localStorage.getItem(`myOrg-${RECORDVIEWER_SETTINGS_KEY}`);
        assert.ok(raw, 'expected settings to be persisted to localStorage');
        const parsed = JSON.parse(raw);
        assert.deepEqual(parsed, { tabs, recentPanelToggled: true });
        assert.ok(!('currentTab' in parsed), 'currentTab must NOT be persisted');

        // Now reload into a fresh (empty) state and confirm it restores tabs +
        // recentPanelToggled, but currentTab is untouched by the load.
        const fresh = makeState({ currentTab: { id: 'sentinel' } });
        const afterLoad = testSlice.reducer(
            fresh,
            testSlice.actions.loadCacheSettings({ alias: 'myOrg' })
        );

        assert.deepEqual(afterLoad.tabs, tabs);
        assert.equal(afterLoad.recentPanelToggled, true);
        assert.deepEqual(
            afterLoad.currentTab,
            { id: 'sentinel' },
            'loadCacheSettings must not touch currentTab (not part of the cached shape)'
        );
    } finally {
        (globalThis as any).localStorage = originalLocalStorage;
    }
});

test('loadCacheSettings: no-op when nothing cached for the alias', () => {
    const originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = makeLocalStorageStub();
    try {
        const before = makeState({ tabs: [{ id: 'keep-me' }] });
        const next = testSlice.reducer(
            before,
            testSlice.actions.loadCacheSettings({ alias: 'unseen-alias' })
        );
        assert.deepEqual(
            next.tabs,
            [{ id: 'keep-me' }],
            'state must be untouched when cache is empty'
        );
    } finally {
        (globalThis as any).localStorage = originalLocalStorage;
    }
});

test('updateRecentPanel: persists via saveCacheSettings when alias is provided', () => {
    const originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = makeLocalStorageStub();
    try {
        const before = makeState({ tabs: [], recentPanelToggled: false });
        testSlice.reducer(
            before,
            testSlice.actions.updateRecentPanel({ value: true, alias: 'myOrg' })
        );

        const raw = (globalThis as any).localStorage.getItem(`myOrg-${RECORDVIEWER_SETTINGS_KEY}`);
        assert.ok(raw, 'updateRecentPanel with an alias must persist settings');
        assert.deepEqual(JSON.parse(raw), { tabs: [], recentPanelToggled: true });
    } finally {
        (globalThis as any).localStorage = originalLocalStorage;
    }
});

// ---------------------------------------------------------------------------
// Source contract — pin key lines of the real slice so drift is caught.
// ---------------------------------------------------------------------------

test('source contract: recordViewer.ts wires the documented reducer names and checks', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../recordViewer.ts'), 'utf8');

    // formatTab whitelist.
    assert.match(
        src,
        /const validParams = \['id', 'refreshedDate', 'record', 'recordType'\];/,
        'formatTab whitelist must be id, refreshedDate, record, recordType'
    );
    assert.match(src, /if \(key in payload && payload\[key\] !== undefined\)/);

    // initialState shape.
    assert.match(src, /tabs: \[\],/);
    assert.match(src, /currentTab: null,/);
    assert.match(src, /recentPanelToggled: false,/);

    // updateRecentPanel: strict === true check.
    assert.match(
        src,
        /updateRecentPanel:[\s\S]+?state\.recentPanelToggled = value === true;/,
        'updateRecentPanel must use a strict === true check'
    );

    // upsertTab: insert-or-merge by id.
    assert.match(src, /upsertTab:[\s\S]+?state\.tabs\.findIndex\(x => x\.id === tab\.id\)/);
    assert.match(src, /upsertTab:[\s\S]+?Object\.assign\(originalTab, tab\)/);

    // removeTab: reducer name is `removeTab`, reassigns currentTab only if it
    // WAS the removed tab (non-strict `==`), and nulls out when tabs is empty.
    assert.match(
        src,
        /removeTab:[\s\S]+?state\.tabs\.length > 0 && state\.currentTab\.id == id/,
        'removeTab must only reassign currentTab if the removed tab was the current one'
    );
    assert.match(
        src,
        /removeTab:[\s\S]+?state\.tabs\.length == 0\) \{\s*state\.currentTab = null;/
    );

    // selectionTab (NOT selectTab): find-by-id with `==`, no-op if not found.
    assert.match(
        src,
        /selectionTab: \(state, action\) => \{/,
        'reducer must be named selectionTab'
    );
    assert.match(src, /selectionTab:[\s\S]+?state\.tabs\.find\(x => x\.id == id\)/);

    // recentPanelToggled + updateRecentPanel exist (extra field vs. sobjectExplorer sibling).
    assert.match(src, /updateRecentPanel: \(state, action\) => \{/);

    // saveCacheSettings persists tabs + recentPanelToggled, NOT currentTab.
    assert.match(
        src,
        /const \{ tabs, recentPanelToggled \} = state;[\s\S]+?JSON\.stringify\(\{\s*tabs,\s*recentPanelToggled,?\s*\}\)/,
        'saveCacheSettings must persist only tabs + recentPanelToggled'
    );
});
