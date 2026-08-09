/**
 * Slice-behavior tests for the metadata `metadataSlice` — focused on the
 * synchronous `reducers: {...}` block (tab lifecycle, attribute assignment,
 * cache persistence, sync job bookkeeping).
 *
 * Why we don't import `../metadata.ts` directly
 * -----------------------------------------------
 * The slice file imports `host-api/store` (for `DESCRIBE`, `BACKGROUNDJOB`,
 * `ERROR`, `SOBJECT`) and `core/store/storeRef` (for `getStore`).
 * `host-api/store` transitively loads the full core store graph, including
 * LWC components decorated with `@api`/`@wire` — invalid syntax under plain
 * Node, since this test runner only strips TypeScript types and cannot parse
 * LWC decorator syntax. Importing the real module throws
 * `SyntaxError: Invalid or unexpected token`. This has been verified
 * empirically in this repo (see `platformevent/slices/__tests__/platformEvent.test.ts`
 * and `recordviewer/slices/__tests__/recordViewer.test.ts`, which document
 * the same constraint).
 *
 * Pragmatic alternative: re-construct the same reducers the slice uses as a
 * "faithful clone" built with `createSlice` from `@reduxjs/toolkit` (the same
 * library the real slice uses), and pin the clone's fidelity with "source
 * contract" tests that `readFileSync` the real `../metadata.ts` and
 * `assert.match` against regexes pinning reducer names and key logic (the
 * `_setAttributes` whitelist, `_addTab`/`_updateTab` helpers, etc). Any drift
 * between the clone and the real file gets caught by those contract tests.
 *
 * SCOPE: this file intentionally does NOT cover `extraReducers` (the
 * `fetchGlobalMetadata`/`fetchSpecificMetadata`/`fetchMetadataRecord`/
 * `startMetadataBackgroundSync`/`cancelMetadataBackgroundSync` pending/
 * fulfilled/rejected cases) or the `createAsyncThunk` bodies themselves —
 * those call the real Salesforce Metadata/Tooling API and worker code and
 * aren't worth faithfully cloning/mocking for this pass. The pure standalone
 * helpers (`getMetadataSyncJobId`, `getMetadataResultSummary`,
 * `_auraNameMapping`, `normalizeMetadataTypes`, `shouldPersistMetadata`) are
 * covered separately in `./metadataHelpers.test.ts`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createSlice } from '@reduxjs/toolkit';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../metadata.ts'), 'utf8');

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

const METADATA_SETTINGS_KEY = 'METADATA_SETTINGS_KEY';

function isNotUndefinedOrNull(value: unknown): boolean {
    return value !== undefined && value !== null;
}

// Faithful clone of loadCacheSettings/saveCacheSettings from ../metadata.ts,
// minus the ERROR.reduxSlice.actions.addError dispatch on failure (that
// requires host-api/store, which we cannot import here — see file header).
function loadCacheSettingsClone(alias: string) {
    try {
        const configText = (globalThis as any).localStorage.getItem(
            `${alias}-${METADATA_SETTINGS_KEY}`
        );
        if (configText) return JSON.parse(configText);
    } catch (e) {
        // Real implementation dispatches an ERROR action here; omitted in the clone.
    }
    return null;
}

function saveCacheSettingsClone(alias: string, state: any) {
    try {
        const { tabs } = state;
        (globalThis as any).localStorage.setItem(
            `${alias}-${METADATA_SETTINGS_KEY}`,
            JSON.stringify({ tabs })
        );
    } catch (e) {
        // Real implementation dispatches an ERROR action here; omitted in the clone.
    }
}

// ---------------------------------------------------------------------------
// Test rig: faithful clone of the metadata slice's synchronous reducers.
// MUST stay in sync with `../metadata.ts`. Each reducer below mirrors the
// real implementation; the "source contract" tests at the bottom pin the
// real source against regexes so drift is caught.
// ---------------------------------------------------------------------------

const VALID_ATTRIBUTE_PARAMS = [
    'param1',
    'param2',
    'label1',
    'label2',
    'sobject',
    'developerName',
    'flowVersionOptions',
    'flowVersionValue',
    'selectedRecord',
    'files',
    'currentTabId',
];

function setAttributesClone(state: any, payload: Record<string, unknown>) {
    VALID_ATTRIBUTE_PARAMS.forEach(key => {
        if (key in payload && (payload as any)[key] !== undefined) {
            state[key] = (payload as any)[key];
        }
    });
}

function addTabClone(state: any, { tab }: { tab: any }) {
    state.tabs.push(tab);
    state.currentTabId = tab.id;
}

function updateTabClone(state: any, { tab }: { tab: any }) {
    const tabIndex = state.tabs.findIndex((x: any) => x.id == tab.id);
    if (tabIndex > -1) {
        state.tabs[tabIndex] = tab;
        state.currentTabId = tab.id;
    }
}

const initialState = {
    tabs: [] as any[],
    currentTab: null as any,
    param1: null as any,
    param2: null as any,
    label1: null as any,
    label2: null as any,
    sobject: null as any,
    developerName: null as any,
    flowVersionOptions: [] as any[],
    flowVersionValue: null as any,
    metadata: [] as any,
    isLoading: false,
    isLoadingRecord: false,
    loadingMessage: '',
    error: null as any,
    currentTabId: null as any,
    files: null as any,
    selectedRecord: null as any,
    metadata_global: null as any,
    metadata_records: null as any,
    currentMetadata: null as any,
    syncJob: {
        jobId: null as any,
        status: 'idle',
        phase: null as any,
        progress: null as any,
        metadataType: null as any,
        message: null as any,
        error: null as any,
        lastRun: null as any,
        result: null as any,
    },
};

const testSlice = createSlice({
    name: 'metadataTest',
    initialState,
    reducers: {
        loadCacheSettings: (state, action: { payload: { alias: string } }) => {
            const { alias } = action.payload;
            const cachedConfig = loadCacheSettingsClone(alias);
            if (cachedConfig) {
                const { tabs } = cachedConfig;
                Object.assign(state, { tabs });
            }
        },
        saveCacheSettings: (state, action: { payload: { alias?: string } }) => {
            const { alias } = action.payload;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsClone(alias as string, state);
            }
        },
        setAttributes: (state, action: { payload: Record<string, unknown> }) => {
            setAttributesClone(state, action.payload);
        },
        initTabs: (state, _action: { payload: unknown }) => {
            if (state.tabs.length > 0) {
                state.currentTabId = state.tabs[0].id;
            }
        },
        addTab: (state, action: { payload: { tab: any } }) => {
            addTabClone(state, action.payload);
        },
        updateTab: (state, action: { payload: { tab: any } }) => {
            updateTabClone(state, action.payload);
        },
        removeTab: (state, action: { payload: { id: any; alias?: string } }) => {
            const { id, alias } = action.payload;
            state.tabs = state.tabs.filter((x: any) => x.id != id);
            if (state.tabs.length > 0 && state.currentTabId == id) {
                const lastTab = state.tabs[state.tabs.length - 1];
                state.currentTabId = lastTab.id;
                setAttributesClone(state, {
                    ...lastTab.attributes,
                    ...lastTab.data,
                    ...lastTab.flowVersions,
                });
            }
            if (state.tabs.length == 0) {
                state.currentTabId = null;
                state.selectedRecord = null;
                state.files = null;
            }
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsClone(alias as string, state);
            }
        },
        selectionTab: (state, action: { payload: { id: any } }) => {
            const { id } = action.payload;
            const tab = state.tabs.find((x: any) => x.id == id);
            if (tab) {
                state.currentTabId = id;
                setAttributesClone(state, {
                    ...tab.attributes,
                    ...tab.data,
                    ...tab.flowVersions,
                });
            }
        },
        goBack: (state, _action: { payload: unknown }) => {
            state.metadata_records = null;
            state.currentMetadata = null;
            state.param1 = null;
            state.label1 = null;
        },
        updateMetadata: (state, action: { payload: { metadata: any } }) => {
            const { metadata } = action.payload;
            state.metadata = metadata;
        },
        updateSyncJob: (state, action: { payload: Record<string, unknown> }) => {
            state.syncJob = {
                ...state.syncJob,
                ...action.payload,
            };
        },
    },
});

function makeState(overrides: Partial<typeof initialState> = {}): typeof initialState {
    return {
        ...initialState,
        ...overrides,
        syncJob: { ...initialState.syncJob, ...overrides.syncJob },
    };
}

// ---------------------------------------------------------------------------
// setAttributes
// ---------------------------------------------------------------------------

test('setAttributes: whitelist-copies only known keys', () => {
    const before = makeState();
    const next = testSlice.reducer(
        before,
        testSlice.actions.setAttributes({
            param1: '001xx',
            label1: 'Acme',
            notWhitelisted: 'should be dropped',
        })
    );
    assert.equal(next.param1, '001xx');
    assert.equal(next.label1, 'Acme');
    assert.ok(!('notWhitelisted' in next));
});

test('setAttributes: drops whitelisted keys whose value is undefined', () => {
    const before = makeState({ param1: 'keep-me' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.setAttributes({ param1: undefined, label1: 'Acme' })
    );
    assert.equal(
        next.param1,
        'keep-me',
        'undefined-valued whitelisted key must not overwrite state'
    );
    assert.equal(next.label1, 'Acme');
});

test('setAttributes: allows explicit null to overwrite (only undefined is excluded)', () => {
    const before = makeState({ param1: 'was-set' });
    const next = testSlice.reducer(before, testSlice.actions.setAttributes({ param1: null }));
    assert.equal(next.param1, null);
});

test('setAttributes: is a no-op when payload has no whitelisted keys', () => {
    const before = makeState({ param1: 'unchanged' });
    const next = testSlice.reducer(before, testSlice.actions.setAttributes({ foo: 'bar' }));
    assert.equal(next.param1, 'unchanged');
});

// ---------------------------------------------------------------------------
// initTabs
// ---------------------------------------------------------------------------

test('initTabs: sets currentTabId to the first tab when tabs exist', () => {
    const before = makeState({ tabs: [{ id: 't1' }, { id: 't2' }] });
    const next = testSlice.reducer(before, testSlice.actions.initTabs({}));
    assert.equal(next.currentTabId, 't1');
});

test('initTabs: no-op when there are no tabs', () => {
    const before = makeState({ tabs: [], currentTabId: 'sentinel' });
    const next = testSlice.reducer(before, testSlice.actions.initTabs({}));
    assert.equal(next.currentTabId, 'sentinel');
});

// ---------------------------------------------------------------------------
// addTab / updateTab
// ---------------------------------------------------------------------------

test('addTab: appends the tab and sets it as currentTabId', () => {
    const before = makeState();
    const tab = { id: 't1', name: 'ApexClass' };
    const next = testSlice.reducer(before, testSlice.actions.addTab({ tab }));
    assert.deepEqual(next.tabs, [tab]);
    assert.equal(next.currentTabId, 't1');
});

test('updateTab: replaces the tab in place by id and sets it as currentTabId', () => {
    const existing = { id: 't1', name: 'Old' };
    const before = makeState({ tabs: [existing], currentTabId: 'other' });
    const updated = { id: 't1', name: 'New' };
    const next = testSlice.reducer(before, testSlice.actions.updateTab({ tab: updated }));
    assert.deepEqual(next.tabs, [updated]);
    assert.equal(next.currentTabId, 't1');
});

test('updateTab: no-op when the tab id is not found', () => {
    const existing = { id: 't1', name: 'Old' };
    const before = makeState({ tabs: [existing], currentTabId: 't1' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.updateTab({ tab: { id: 'missing', name: 'New' } })
    );
    assert.deepEqual(next.tabs, [existing]);
    assert.equal(next.currentTabId, 't1', 'currentTabId must be untouched when tab is not found');
});

// ---------------------------------------------------------------------------
// removeTab
// ---------------------------------------------------------------------------

test('removeTab: removing the current tab reassigns currentTabId to the new last tab and restores its attributes', () => {
    const tabA = {
        id: 'a',
        attributes: { param1: 'A1', label1: 'LabelA', sobject: 'ApexClass', developerName: 'A' },
        data: { selectedRecord: { Id: 'a' }, files: null },
        flowVersions: { flowVersionOptions: [], flowVersionValue: null },
    };
    const tabB = { id: 'b', attributes: {}, data: {}, flowVersions: {} };
    const before = makeState({
        tabs: [tabA, tabB],
        currentTabId: 'b',
        param1: 'B1',
    });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'b' }));

    assert.deepEqual(next.tabs, [tabA]);
    assert.equal(next.currentTabId, 'a');
    assert.equal(next.param1, 'A1', 'restored from lastTab.attributes');
    assert.equal(next.label1, 'LabelA');
    assert.deepEqual(next.selectedRecord, { Id: 'a' }, 'restored from lastTab.data');
});

test('removeTab: removing a non-current tab leaves currentTabId and attributes untouched', () => {
    const tabA = { id: 'a' };
    const tabB = { id: 'b' };
    const before = makeState({ tabs: [tabA, tabB], currentTabId: 'b', param1: 'unchanged' });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'a' }));

    assert.deepEqual(next.tabs, [tabB]);
    assert.equal(next.currentTabId, 'b');
    assert.equal(next.param1, 'unchanged');
});

test('removeTab: clears currentTabId, selectedRecord, and files when tabs becomes empty', () => {
    const tabA = { id: 'a' };
    const before = makeState({
        tabs: [tabA],
        currentTabId: 'a',
        selectedRecord: { Id: 'x' },
        files: [{ name: 'Foo.cls' }],
    });

    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 'a' }));

    assert.deepEqual(next.tabs, []);
    assert.equal(next.currentTabId, null);
    assert.equal(next.selectedRecord, null);
    assert.equal(next.files, null);
});

test('removeTab: persists to localStorage when an alias is provided', () => {
    const originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = makeLocalStorageStub();
    try {
        const tabA = { id: 'a' };
        const tabB = { id: 'b' };
        const before = makeState({ tabs: [tabA, tabB], currentTabId: 'b' });

        testSlice.reducer(before, testSlice.actions.removeTab({ id: 'b', alias: 'myOrg' }));

        const raw = (globalThis as any).localStorage.getItem(`myOrg-${METADATA_SETTINGS_KEY}`);
        assert.ok(raw, 'removeTab with an alias must persist settings');
        assert.deepEqual(JSON.parse(raw), { tabs: [tabA] });
    } finally {
        (globalThis as any).localStorage = originalLocalStorage;
    }
});

// ---------------------------------------------------------------------------
// selectionTab
// ---------------------------------------------------------------------------

test('selectionTab: switches currentTabId and restores attributes/data/flowVersions from the tab', () => {
    const tabA = {
        id: 'a',
        attributes: { param1: 'A1', sobject: 'ApexClass' },
        data: { selectedRecord: { Id: 'a' } },
        flowVersions: {
            flowVersionOptions: [{ value: 'v1', label: 'V1' }],
            flowVersionValue: 'v1',
        },
    };
    const before = makeState({ tabs: [tabA], currentTabId: null, param1: 'stale' });

    const next = testSlice.reducer(before, testSlice.actions.selectionTab({ id: 'a' }));

    assert.equal(next.currentTabId, 'a');
    assert.equal(next.param1, 'A1');
    assert.equal(next.sobject, 'ApexClass');
    assert.deepEqual(next.selectedRecord, { Id: 'a' });
    assert.equal(next.flowVersionValue, 'v1');
});

test('selectionTab: no-op when no tab matches the id', () => {
    const before = makeState({ tabs: [{ id: 'a' }], currentTabId: 'a', param1: 'unchanged' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.selectionTab({ id: 'does-not-exist' })
    );
    assert.equal(next.currentTabId, 'a');
    assert.equal(next.param1, 'unchanged');
});

// ---------------------------------------------------------------------------
// goBack
// ---------------------------------------------------------------------------

test('goBack: resets metadata_records, currentMetadata, param1, and label1', () => {
    const before = makeState({
        metadata_records: { records: [{ name: 'Foo' }], label: 'ApexClass' },
        currentMetadata: 'ApexClass',
        param1: '001xx',
        label1: 'Foo',
        // Fields NOT reset by goBack must survive untouched.
        sobject: 'ApexClass',
        metadata_global: { records: [], label: 'Metadata' },
    });

    const next = testSlice.reducer(before, testSlice.actions.goBack({}));

    assert.equal(next.metadata_records, null);
    assert.equal(next.currentMetadata, null);
    assert.equal(next.param1, null);
    assert.equal(next.label1, null);
    assert.equal(next.sobject, 'ApexClass', 'goBack must not touch sobject');
    assert.deepEqual(next.metadata_global, { records: [], label: 'Metadata' });
});

// ---------------------------------------------------------------------------
// updateMetadata
// ---------------------------------------------------------------------------

test('updateMetadata: overwrites state.metadata with the payload', () => {
    const before = makeState({ metadata: [] });
    const next = testSlice.reducer(
        before,
        testSlice.actions.updateMetadata({ metadata: { records: [{ name: 'Foo' }], label: 'X' } })
    );
    assert.deepEqual(next.metadata, { records: [{ name: 'Foo' }], label: 'X' });
});

// ---------------------------------------------------------------------------
// updateSyncJob
// ---------------------------------------------------------------------------

test('updateSyncJob: shallow-merges the payload into state.syncJob, preserving untouched fields', () => {
    const before = makeState({
        syncJob: {
            jobId: 'job-1',
            status: 'running',
            phase: 'init',
            progress: { completed: 0, total: 10, percent: 0 },
            metadataType: null,
            message: 'starting',
            error: null,
            lastRun: 111,
            result: null,
        },
    });

    const next = testSlice.reducer(
        before,
        testSlice.actions.updateSyncJob({
            status: 'running',
            phase: 'fetching',
            message: 'Fetching Flow',
        })
    );

    assert.equal(next.syncJob.jobId, 'job-1', 'jobId must be preserved (not in payload)');
    assert.equal(next.syncJob.phase, 'fetching');
    assert.equal(next.syncJob.message, 'Fetching Flow');
    assert.equal(next.syncJob.lastRun, 111, 'lastRun must be preserved');
});

// ---------------------------------------------------------------------------
// loadCacheSettings / saveCacheSettings — exercised via a stubbed localStorage
// ---------------------------------------------------------------------------

test('saveCacheSettings then loadCacheSettings: persists and restores only tabs', () => {
    const originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = makeLocalStorageStub();
    try {
        const tabs = [{ id: 't1', name: 'ApexClass' }];
        const before = makeState({ tabs, currentTabId: 't1' });

        testSlice.reducer(before, testSlice.actions.saveCacheSettings({ alias: 'myOrg' }));

        const raw = (globalThis as any).localStorage.getItem(`myOrg-${METADATA_SETTINGS_KEY}`);
        assert.ok(raw, 'expected settings to be persisted to localStorage');
        const parsed = JSON.parse(raw);
        assert.deepEqual(parsed, { tabs });
        assert.ok(!('currentTabId' in parsed), 'currentTabId must NOT be persisted');

        const fresh = makeState({ tabs: [], currentTabId: 'sentinel' });
        const afterLoad = testSlice.reducer(
            fresh,
            testSlice.actions.loadCacheSettings({ alias: 'myOrg' })
        );

        assert.deepEqual(afterLoad.tabs, tabs);
        assert.equal(
            afterLoad.currentTabId,
            'sentinel',
            'loadCacheSettings must not touch currentTabId (not part of the cached shape)'
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

test('saveCacheSettings: no-op (does not throw) when alias is undefined/null', () => {
    const originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).localStorage = makeLocalStorageStub();
    try {
        const before = makeState({ tabs: [{ id: 't1' }] });
        assert.doesNotThrow(() => {
            testSlice.reducer(before, testSlice.actions.saveCacheSettings({}));
        });
        assert.equal(
            (globalThis as any).localStorage.getItem(`undefined-${METADATA_SETTINGS_KEY}`),
            null
        );
    } finally {
        (globalThis as any).localStorage = originalLocalStorage;
    }
});

// ---------------------------------------------------------------------------
// Source contract tests — pin the real `../metadata.ts` against regexes so
// drift between this clone and the real implementation is caught.
// ---------------------------------------------------------------------------

test('source contract: _setAttributes whitelist matches the documented set of valid params', () => {
    assert.match(
        SRC,
        /const validParams = \[\s*\n\s*'param1',\s*\n\s*'param2',\s*\n\s*'label1',\s*\n\s*'label2',\s*\n\s*'sobject',\s*\n\s*'developerName',\s*\n\s*'flowVersionOptions',\s*\n\s*'flowVersionValue',\s*\n\s*'selectedRecord',\s*\n\s*'files',\s*\n\s*'currentTabId',\s*\n\s*\];/
    );
    assert.match(SRC, /if \(key in payload && payload\[key\] !== undefined\)/);
});

test('source contract: _addTab pushes the tab and sets currentTabId', () => {
    assert.match(
        SRC,
        /const _addTab = \(state, \{ tab \}\) => \{\s*\n\s*state\.tabs\.push\(tab\);[\s\S]+?state\.currentTabId = tab\.id;/
    );
});

test('source contract: _updateTab replaces by id via findIndex, guarded by `tabIndex > -1`', () => {
    assert.match(
        SRC,
        /const _updateTab = \(state, \{ tab \}\) => \{\s*\n\s*const tabIndex = state\.tabs\.findIndex\(x => x\.id == tab\.id\);[\s\S]+?if \(tabIndex > -1\) \{/
    );
});

test('source contract: removeTab restores lastTab.attributes/data/flowVersions when the current tab is removed', () => {
    assert.match(
        SRC,
        /removeTab: \(state, action\) => \{[\s\S]+?state\.tabs = state\.tabs\.filter\(x => x\.id != id\);[\s\S]+?if \(state\.tabs\.length > 0 && state\.currentTabId == id\) \{[\s\S]+?_setAttributes\(state, \{\s*\n\s*\.\.\.lastTab\.attributes,\s*\n\s*\.\.\.lastTab\.data,\s*\n\s*\.\.\.lastTab\.flowVersions,/
    );
    assert.match(
        SRC,
        /if \(state\.tabs\.length == 0\) \{\s*\n\s*state\.currentTabId = null;\s*\n\s*state\.selectedRecord = null;\s*\n\s*state\.files = null;/
    );
});

test('source contract: selectionTab finds the tab with `==` and restores attributes/data/flowVersions', () => {
    assert.match(
        SRC,
        /selectionTab: \(state, action\) => \{[\s\S]+?const tab = state\.tabs\.find\(x => x\.id == id\);[\s\S]+?if \(tab\) \{\s*\n\s*state\.currentTabId = id;\s*\n\s*_setAttributes\(state, \{\s*\n\s*\.\.\.tab\.attributes,\s*\n\s*\.\.\.tab\.data,\s*\n\s*\.\.\.tab\.flowVersions,/
    );
});

test('source contract: goBack resets exactly metadata_records, currentMetadata, param1, label1', () => {
    assert.match(
        SRC,
        /goBack: \(state, action\) => \{[\s\S]*?state\.metadata_records = null;\s*\n\s*state\.currentMetadata = null;\s*\n\s*state\.param1 = null;\s*\n\s*state\.label1 = null;\s*\n\s*\},/
    );
});

test('source contract: updateSyncJob shallow-merges action.payload over state.syncJob', () => {
    assert.match(
        SRC,
        /updateSyncJob: \(state, action\) => \{\s*\n\s*state\.syncJob = \{\s*\n\s*\.\.\.state\.syncJob,\s*\n\s*\.\.\.action\.payload,\s*\n\s*\};/
    );
});

test('source contract: saveCacheSettings/loadCacheSettings key on `${alias}-${METADATA_SETTINGS_KEY}` and persist only `tabs`', () => {
    assert.match(SRC, /const METADATA_SETTINGS_KEY = 'METADATA_SETTINGS_KEY';/);
    assert.match(SRC, /localStorage\.getItem\(`\$\{alias\}-\$\{METADATA_SETTINGS_KEY\}`\)/);
    assert.match(
        SRC,
        /const \{ tabs \} = state;[\s\S]+?localStorage\.setItem\(\s*\n\s*`\$\{alias\}-\$\{METADATA_SETTINGS_KEY\}`,\s*\n\s*JSON\.stringify\(\{\s*\n\s*tabs,\s*\n\s*\}\)/
    );
});

test('source contract: initTabs sets currentTabId to the first tab when tabs is non-empty', () => {
    assert.match(
        SRC,
        /initTabs: \(state, action\) => \{[\s\S]+?if \(state\.tabs\.length > 0\) \{\s*\n\s*state\.currentTabId = state\.tabs\[0\]\.id;/
    );
});
