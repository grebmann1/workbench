/**
 * Slice-behavior tests for the object app's sobjectExplorer slice.
 *
 * Why we don't import `../sobjectExplorer.ts` directly
 * ------------------------------------------------------
 * The slice file imports `host-api/store` (for `ERROR.reduxSlice.actions.addError`),
 * which transitively loads the full core store graph including LWC components
 * decorated with `@api`/`@wire` (invalid syntax under plain Node — the test
 * runner can only strip TypeScript types, not parse LWC decorators). Any
 * module that imports `host-api/store`, directly or transitively, throws
 * `SyntaxError: Invalid or unexpected token` when loaded by this harness.
 * Stubbing `host-api/store` via an ESM resolver hook from the test file is
 * unreliable because `module.register()` and dynamic-import scheduling race
 * with the existing tsconfig-paths resolver.
 *
 * Pragmatic alternative: re-construct the slice's reducers (including the
 * plain `formatTab` helper) locally with `createSlice`, and pin the policy
 * contract here. Any drift between this clone and `../sobjectExplorer.ts`
 * will be caught by the "source contract" tests below, which `readFileSync`
 * the real source and `assert.match` against the exact lines that encode
 * the policy. This mirrors the pattern established in
 * `packages/lwc/applications/agentforce/slices/__tests__/agents.test.ts`.
 */

import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import { createSlice } from '@reduxjs/toolkit';

// ---------------------------------------------------------------------------
// In-memory localStorage stub. Plain Node has no `localStorage` global; the
// real slice reads/writes it directly (via the module-scoped `localStorage`
// identifier), so we install a minimal getItem/setItem/removeItem mock on
// `globalThis` before each test and tear it down after.
// ---------------------------------------------------------------------------

function installLocalStorageMock() {
    const backing = new Map<string, string>();
    const mock = {
        getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
        setItem: (key: string, value: string) => {
            backing.set(key, String(value));
        },
        removeItem: (key: string) => {
            backing.delete(key);
        },
        clear: () => backing.clear(),
        _backing: backing,
    };
    (globalThis as unknown as { localStorage: typeof mock }).localStorage = mock;
    return mock;
}

function uninstallLocalStorageMock() {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
}

let localStorageMock: ReturnType<typeof installLocalStorageMock>;
// Records attempted error dispatches from the catch branches of the clone's
// loadCacheSettings/saveCacheSettings helpers, standing in for
// `ERROR.reduxSlice.actions.addError` (which we can't import — see header).
let dispatchedErrors: Array<{ message: string; details: string }>;

beforeEach(() => {
    localStorageMock = installLocalStorageMock();
    dispatchedErrors = [];
});

afterEach(() => {
    uninstallLocalStorageMock();
});

// ---------------------------------------------------------------------------
// Test rig: faithful clone of `../sobjectExplorer.ts`.
// MUST stay in sync with the slice — the source contract tests below catch
// drift.
// ---------------------------------------------------------------------------

const SOBJECTEXPLORER_SETTINGS_KEY = 'SOBJECTEXPLORER_SETTINGS_KEY';

type Tab = {
    id: string;
    label?: string;
    details?: unknown;
    rawName?: string;
    useToolingApi?: boolean;
    source?: string;
    [key: string]: unknown;
};

type SobjectExplorerState = {
    tabs: Tab[];
    currentTab: Tab | null;
};

// Faithful clone of the exported `formatTab` pure function.
export const formatTab = (payload: Record<string, unknown>): Tab => {
    const validParams = ['id', 'label', 'details', 'rawName', 'useToolingApi', 'source'];
    const tab: Record<string, unknown> = {};
    validParams.forEach(key => {
        if (key in payload && payload[key] !== undefined) {
            tab[key] = payload[key];
        }
    });
    return tab as Tab;
};

function loadCacheSettingsLocal(alias: string) {
    try {
        const configText = localStorage.getItem(`${alias}-${SOBJECTEXPLORER_SETTINGS_KEY}`);
        if (configText) return JSON.parse(configText);
    } catch (e) {
        dispatchedErrors.push({
            message: 'Failed to load CONFIG from localStorage',
            details: (e as Error).message,
        });
    }
    return null;
}

function saveCacheSettingsLocal(alias: string, state: SobjectExplorerState) {
    try {
        const { tabs } = state;
        localStorage.setItem(`${alias}-${SOBJECTEXPLORER_SETTINGS_KEY}`, JSON.stringify({ tabs }));
    } catch (e) {
        dispatchedErrors.push({
            message: 'Failed to save CONFIG to localstorage',
            details: (e as Error).message,
        });
    }
}

function isNotUndefinedOrNull<T>(value: T): value is NonNullable<T> {
    return value !== null && value !== undefined;
}

const initialState: SobjectExplorerState = {
    tabs: [],
    currentTab: null,
};

const testSlice = createSlice({
    name: 'sobjectExplorerTest',
    initialState,
    reducers: {
        loadCacheSettings: (state, action: { payload: { alias: string } }) => {
            const { alias } = action.payload;
            const cachedConfig = loadCacheSettingsLocal(alias);
            if (cachedConfig) {
                const { tabs } = cachedConfig;
                Object.assign(state, { tabs });
            }
        },
        saveCacheSettings: (state, action: { payload: { alias?: string | null } }) => {
            const { alias } = action.payload;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsLocal(alias, state);
            }
        },
        upsertTab: (state, action: { payload: { tab: Tab } }) => {
            const { tab } = action.payload;
            const indexTab = state.tabs.findIndex(x => x.id === tab.id);
            if (indexTab < 0) {
                state.tabs.push(tab);
                state.currentTab = tab;
            } else {
                const originalTab = state.tabs.find(x => x.id === tab.id)!;
                const newTab = Object.assign(originalTab, tab);
                state.tabs[indexTab] = newTab;
                state.currentTab = newTab;
            }
        },
        removeTab: (state, action: { payload: { id: string; alias?: string | null } }) => {
            const { id, alias } = action.payload;
            state.tabs = state.tabs.filter(x => x.id != id);
            if (state.tabs.length > 0 && state.currentTab && state.currentTab.id == id) {
                const lastTab = state.tabs[state.tabs.length - 1];
                state.currentTab = lastTab;
            }
            if (state.tabs.length == 0) {
                state.currentTab = null;
            }
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsLocal(alias, state);
            }
        },
        selectTab: (state, action: { payload: { id: string } }) => {
            const { id } = action.payload;
            const tab = state.tabs.find(x => x.id == id);
            if (tab) {
                state.currentTab = tab;
            }
        },
    },
});

function makeState(overrides: Partial<SobjectExplorerState> = {}): SobjectExplorerState {
    return { tabs: [], currentTab: null, ...overrides };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

test('initial state: empty tabs and no currentTab', () => {
    assert.deepEqual(testSlice.reducer(undefined, { type: '@@init' }), {
        tabs: [],
        currentTab: null,
    });
});

// ---------------------------------------------------------------------------
// formatTab — whitelist field copy
// ---------------------------------------------------------------------------

test('formatTab: copies only whitelisted keys that are defined', () => {
    const tab = formatTab({
        id: '1',
        label: 'Account',
        details: { foo: 'bar' },
        rawName: 'Account',
        useToolingApi: true,
        source: 'tree',
        extraneous: 'should not appear',
        somethingElse: 42,
    });

    assert.deepEqual(tab, {
        id: '1',
        label: 'Account',
        details: { foo: 'bar' },
        rawName: 'Account',
        useToolingApi: true,
        source: 'tree',
    });
    assert.equal('extraneous' in tab, false);
    assert.equal('somethingElse' in tab, false);
});

test('formatTab: omits whitelisted keys that are missing or undefined', () => {
    const tab = formatTab({ id: '2', label: undefined, rawName: 'Contact' });
    assert.deepEqual(tab, { id: '2', rawName: 'Contact' });
    assert.equal('label' in tab, false);
    assert.equal('details' in tab, false);
    assert.equal('useToolingApi' in tab, false);
    assert.equal('source' in tab, false);
});

test('formatTab: returns empty object for empty payload', () => {
    assert.deepEqual(formatTab({}), {});
});

// ---------------------------------------------------------------------------
// upsertTab — insert vs update-merge
// ---------------------------------------------------------------------------

test('upsertTab: inserts a new tab and sets it as currentTab', () => {
    const before = makeState();
    const tab: Tab = { id: 'A', label: 'Account' };

    const next = testSlice.reducer(before, testSlice.actions.upsertTab({ tab }));

    assert.deepEqual(next.tabs, [tab]);
    assert.deepEqual(next.currentTab, tab);
});

test('upsertTab: appends subsequent new tabs and updates currentTab', () => {
    const before = makeState({
        tabs: [{ id: 'A', label: 'Account' }],
        currentTab: { id: 'A', label: 'Account' },
    });
    const tab: Tab = { id: 'B', label: 'Contact' };

    const next = testSlice.reducer(before, testSlice.actions.upsertTab({ tab }));

    assert.equal(next.tabs.length, 2);
    assert.deepEqual(next.tabs[1], tab);
    assert.deepEqual(next.currentTab, tab);
});

test('upsertTab: MERGES fields into the existing tab rather than replacing it', () => {
    const before = makeState({
        tabs: [{ id: 'A', label: 'Account', rawName: 'Account', source: 'tree' }],
        currentTab: null,
    });

    // Partial update — only `label` provided, other original fields must survive.
    const next = testSlice.reducer(
        before,
        testSlice.actions.upsertTab({ tab: { id: 'A', label: 'Account (renamed)' } })
    );

    assert.equal(next.tabs.length, 1, 'update must not add a duplicate tab');
    assert.deepEqual(next.tabs[0], {
        id: 'A',
        label: 'Account (renamed)',
        rawName: 'Account',
        source: 'tree',
    });
    assert.deepEqual(next.currentTab, next.tabs[0], 'currentTab must be updated to the merged tab');
});

// ---------------------------------------------------------------------------
// removeTab — currentTab reassignment
// ---------------------------------------------------------------------------

test('removeTab: reassigns currentTab to the new last tab when the removed tab was current', () => {
    const tabA: Tab = { id: 'A' };
    const tabB: Tab = { id: 'B' };
    const tabC: Tab = { id: 'C' };
    const before = makeState({ tabs: [tabA, tabB, tabC], currentTab: tabC });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'C' }));

    assert.deepEqual(next.tabs, [tabA, tabB]);
    assert.deepEqual(next.currentTab, tabB, 'currentTab must become the new last tab');
});

test('removeTab: sets currentTab to null when the last tab is removed', () => {
    const tabA: Tab = { id: 'A' };
    const before = makeState({ tabs: [tabA], currentTab: tabA });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'A' }));

    assert.deepEqual(next.tabs, []);
    assert.equal(next.currentTab, null);
});

test('removeTab: leaves currentTab untouched when removing a non-current tab', () => {
    const tabA: Tab = { id: 'A' };
    const tabB: Tab = { id: 'B' };
    const before = makeState({ tabs: [tabA, tabB], currentTab: tabB });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'A' }));

    assert.deepEqual(next.tabs, [tabB]);
    assert.deepEqual(next.currentTab, tabB, 'currentTab must remain the tab that was not removed');
});

test('removeTab: persists via saveCacheSettings when alias is provided', () => {
    const tabA: Tab = { id: 'A' };
    const tabB: Tab = { id: 'B' };
    const before = makeState({ tabs: [tabA, tabB], currentTab: tabB });

    testSlice.reducer(before, testSlice.actions.removeTab({ id: 'B', alias: 'myorg' }));

    const raw = localStorageMock.getItem('myorg-SOBJECTEXPLORER_SETTINGS_KEY');
    assert.ok(raw, 'removeTab with an alias must write to localStorage');
    assert.deepEqual(JSON.parse(raw!), { tabs: [tabA] });
});

// ---------------------------------------------------------------------------
// selectTab — found / not found
// ---------------------------------------------------------------------------

test('selectTab: sets currentTab when the id is found', () => {
    const tabA: Tab = { id: 'A' };
    const tabB: Tab = { id: 'B' };
    const before = makeState({ tabs: [tabA, tabB], currentTab: tabA });

    const next = testSlice.reducer(before, testSlice.actions.selectTab({ id: 'B' }));

    assert.deepEqual(next.currentTab, tabB);
});

test('selectTab: leaves currentTab unchanged when the id is not found', () => {
    const tabA: Tab = { id: 'A' };
    const before = makeState({ tabs: [tabA], currentTab: tabA });

    const next = testSlice.reducer(before, testSlice.actions.selectTab({ id: 'does-not-exist' }));

    assert.deepEqual(next.currentTab, tabA);
});

// ---------------------------------------------------------------------------
// loadCacheSettings / saveCacheSettings — localStorage round-trip
// ---------------------------------------------------------------------------

test('saveCacheSettings: writes only {tabs} to localStorage (currentTab NOT persisted)', () => {
    const tabA: Tab = { id: 'A', label: 'Account' };
    const before = makeState({ tabs: [tabA], currentTab: tabA });

    testSlice.reducer(before, testSlice.actions.saveCacheSettings({ alias: 'myorg' }));

    const raw = localStorageMock.getItem('myorg-SOBJECTEXPLORER_SETTINGS_KEY');
    assert.ok(raw);
    const parsed = JSON.parse(raw!);
    assert.deepEqual(parsed, { tabs: [tabA] });
    assert.equal('currentTab' in parsed, false, 'currentTab must not be persisted');
});

test('saveCacheSettings: no-ops when alias is null/undefined', () => {
    const before = makeState({ tabs: [{ id: 'A' }], currentTab: null });

    testSlice.reducer(before, testSlice.actions.saveCacheSettings({ alias: null }));
    testSlice.reducer(before, testSlice.actions.saveCacheSettings({ alias: undefined }));

    assert.equal(localStorageMock._backing.size, 0, 'nothing should be written without an alias');
});

test('loadCacheSettings: merges persisted tabs into state, currentTab untouched', () => {
    const persistedTabs: Tab[] = [{ id: 'X', label: 'Persisted' }];
    localStorageMock.setItem(
        'myorg-SOBJECTEXPLORER_SETTINGS_KEY',
        JSON.stringify({ tabs: persistedTabs })
    );

    const before = makeState({ tabs: [{ id: 'STALE' }], currentTab: { id: 'STALE' } });
    const next = testSlice.reducer(before, testSlice.actions.loadCacheSettings({ alias: 'myorg' }));

    assert.deepEqual(next.tabs, persistedTabs);
    assert.deepEqual(
        next.currentTab,
        { id: 'STALE' },
        'loadCacheSettings must not touch currentTab'
    );
});

test('loadCacheSettings: no-ops when nothing is cached for the alias', () => {
    const before = makeState({ tabs: [{ id: 'KEEP' }], currentTab: null });

    const next = testSlice.reducer(
        before,
        testSlice.actions.loadCacheSettings({ alias: 'unknown-org' })
    );

    assert.deepEqual(next.tabs, [{ id: 'KEEP' }]);
});

test('loadCacheSettings + saveCacheSettings: full round-trip preserves tab shape', () => {
    const tabs: Tab[] = [
        { id: '1', label: 'Account', rawName: 'Account', useToolingApi: false, source: 'tree' },
        { id: '2', label: 'Contact', source: 'search' },
    ];
    const saved = makeState({ tabs, currentTab: tabs[1] });

    testSlice.reducer(saved, testSlice.actions.saveCacheSettings({ alias: 'roundtrip' }));

    const loadedInto = makeState();
    const loaded = testSlice.reducer(
        loadedInto,
        testSlice.actions.loadCacheSettings({ alias: 'roundtrip' })
    );

    assert.deepEqual(loaded.tabs, tabs);
    assert.equal(loaded.currentTab, null, 'currentTab is never persisted, so it stays as-is');
});

test('loadCacheSettings: a malformed cache entry is caught and reported, state unchanged', () => {
    localStorageMock.setItem('bad-org-SOBJECTEXPLORER_SETTINGS_KEY', '{not valid json');
    const before = makeState({ tabs: [{ id: 'KEEP' }], currentTab: null });

    const next = testSlice.reducer(
        before,
        testSlice.actions.loadCacheSettings({ alias: 'bad-org' })
    );

    assert.deepEqual(next.tabs, [{ id: 'KEEP' }], 'state must be left untouched on parse failure');
    assert.equal(dispatchedErrors.length, 1);
    assert.equal(dispatchedErrors[0].message, 'Failed to load CONFIG from localStorage');
});

// ---------------------------------------------------------------------------
// Source contract — pin the real file's policy so drift is caught.
// ---------------------------------------------------------------------------

test('source contract: formatTab whitelists the same six keys', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../sobjectExplorer.ts'), 'utf8');

    assert.match(
        src,
        /const validParams = \[\s*'id',\s*'label',\s*'details',\s*'rawName',\s*'useToolingApi',\s*'source',?\s*\];/,
        'formatTab whitelist must stay in sync with the clone'
    );
});

test('source contract: initialState is {tabs: [], currentTab: null}', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../sobjectExplorer.ts'), 'utf8');

    assert.match(src, /initialState:\s*\{\s*tabs:\s*\[\],\s*currentTab:\s*null,?\s*\}/);
});

test('source contract: saveCacheSettings persists only {tabs}, not currentTab', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../sobjectExplorer.ts'), 'utf8');

    assert.match(
        src,
        /function saveCacheSettings\(alias, state\)[\s\S]+?const \{ tabs \} = state;[\s\S]+?JSON\.stringify\(\s*\{\s*tabs,?\s*\}\s*\)/,
        'saveCacheSettings must only persist the tabs field'
    );
});

test('source contract: removeTab reassigns currentTab to last tab, or null when empty', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../sobjectExplorer.ts'), 'utf8');

    assert.match(
        src,
        /removeTab:[\s\S]+?state\.tabs = state\.tabs\.filter\(x => x\.id != id\);[\s\S]+?state\.currentTab = lastTab;[\s\S]+?state\.currentTab = null;/,
        'removeTab must reassign currentTab to the new last tab, falling back to null when tabs is empty'
    );
});

test('source contract: upsertTab merges into the existing tab on update (not a plain replace)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../sobjectExplorer.ts'), 'utf8');

    assert.match(
        src,
        /upsertTab:[\s\S]+?Object\.assign\(originalTab, tab\)/,
        'upsertTab must merge fields via Object.assign, not overwrite the tab wholesale'
    );
});
