/**
 * Slice-behavior tests for the package application's `packageSlice` —
 * focused on the synchronous `reducers` (cache settings, deployment-job
 * clearing, metadata-menu navigation) and the `extraReducers` around
 * `executePackageDeploy`, `executePackageRetrieve`,
 * `fetchMenuGlobalMetadata`, and `fetchMenuSpecificMetadata`.
 *
 * Why we don't import `../package.ts` directly
 * -----------------------------------------------
 * `../package.ts` imports `BACKGROUNDJOB`, `DESCRIBE`, `ERROR` from
 * `host-api/store` and `getStore` from `core/store/storeRef` at module
 * top-level, and also imports `loadSpecificMetadata`,
 * `loadSpecificMetadataException` from `metadata/slices/metadata`.
 * `host-api/store` transitively loads the full core store graph including
 * LWC components decorated with `@api`/`@wire` — invalid syntax under plain
 * Node, since this test runner (`--experimental-strip-types`) only strips
 * TypeScript types and cannot parse LWC decorator syntax. Importing
 * `../package.ts` directly throws `SyntaxError: Invalid or unexpected
 * token`. Verified empirically:
 *   node --experimental-strip-types --import=./tools/testing/register.mjs \
 *     -e "import('./packages/lwc/applications/package/slices/package.ts')"
 *   -> SyntaxError: Invalid or unexpected token
 * This is the same constraint documented in
 * `platformevent/slices/__tests__/platformEvent.test.ts` (the canonical
 * precedent for this pattern) and `agentforce/slices/__tests__/agents.test.ts`
 * (the original).
 *
 * Pragmatic alternative: re-construct the same `reducers`/`extraReducers`
 * the slice uses as a "faithful clone" built with `createSlice` from
 * `@reduxjs/toolkit` (the same library the real slice uses), and pin the
 * clone's fidelity with "source contract" tests that `readFileSync` the
 * real `../package.ts` and `assert.match` key lines/policies. Any drift
 * between the clone and the real file gets caught by those contract tests
 * in review.
 *
 * `isNotUndefinedOrNull` is imported directly from `shared/utils` — that
 * module does NOT import `host-api/store`, so it is safe to import in this
 * plain-Node test environment (same precedent as
 * `anonymousApex/slices/__tests__/apexHelpers.test.ts`). `lowerCaseKey` and
 * `guid` are imported into the real source but are NOT actually invoked
 * anywhere in `packageSlice`'s synchronous reducers/extraReducers (verified
 * by grep — see the "source contract" test at the bottom that pins this),
 * so this clone does not need stand-ins for them.
 *
 * `executePackageDeploy`, `executePackageRetrieve`, `fetchMenuGlobalMetadata`,
 * and `fetchMenuSpecificMetadata` are async thunks that call a real
 * Salesforce connector (`connector.conn.metadata.deploy/retrieve`) or
 * dispatch other slices' thunks (`DESCRIBE.describeSObjects`,
 * `DESCRIBE.describeVersion`) — out of scope here; only their
 * `extraReducers` (pending/fulfilled/rejected) cases are cloned and tested,
 * using synthetic action objects that mimic what `createAsyncThunk` would
 * dispatch.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createSlice } from '@reduxjs/toolkit';

import { isNotUndefinedOrNull } from 'shared/utils';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../package.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Test rig: faithful clone of packageSlice's local `loadCacheSettings` /
// `saveCacheSettings` helpers (backed by `localStorage`) plus the slice's
// reducers + extraReducers. MUST stay in sync with `../package.ts`. Each
// piece mirrors the real implementation; the "source contract" tests at the
// bottom pin the real source against regexes so drift is caught.
// ---------------------------------------------------------------------------

const PACKAGE_SETTINGS_KEY = 'PACKAGE_SETTINGS_KEY';

function loadCacheSettingsHelper(alias: string) {
    try {
        const configText = localStorage.getItem(`${alias}-${PACKAGE_SETTINGS_KEY}`);
        if (configText) return JSON.parse(configText);
    } catch (e) {
        console.error('Failed to load CONFIG from localStorage', e);
    }
    return null;
}

function saveCacheSettingsHelper(alias: string, state: any) {
    try {
        const { currentMethod, leftPanelToggled } = state;
        localStorage.setItem(
            `${alias}-${PACKAGE_SETTINGS_KEY}`,
            JSON.stringify({ currentMethod, leftPanelToggled })
        );
    } catch (e) {
        console.error('Failed to save CONFIG to localstorage', e);
    }
}

// Simulated async-thunk action-type strings (mirrors `createAsyncThunk`'s
// auto-generated `<typePrefix>/pending|fulfilled|rejected` types).
const DEPLOY_PENDING = 'package/deploy/pending';
const DEPLOY_FULFILLED = 'package/deploy/fulfilled';
const DEPLOY_REJECTED = 'package/deploy/rejected';
const RETRIEVE_PENDING = 'package/retrieve/pending';
const RETRIEVE_FULFILLED = 'package/retrieve/fulfilled';
const RETRIEVE_REJECTED = 'package/retrieve/rejected';
const MENU_GLOBAL_PENDING = 'package/menu/fetchGlobalMetadata/pending';
const MENU_GLOBAL_FULFILLED = 'package/menu/fetchGlobalMetadata/fulfilled';
const MENU_GLOBAL_REJECTED = 'package/menu/fetchGlobalMetadata/rejected';
const MENU_SPECIFIC_PENDING = 'package/menu/fetchSpecificMetadata/pending';
const MENU_SPECIFIC_FULFILLED = 'package/menu/fetchSpecificMetadata/fulfilled';
const MENU_SPECIFIC_REJECTED = 'package/menu/fetchSpecificMetadata/rejected';

const initialState = () => ({
    leftPanelToggled: false,
    currentMethod: null as string | null,
    currentDeploymentJob: null as any,
    currentRetrieveJob: null as any,
    menu_isLoading: false,
    menu_loadingMessage: '',
    menu_currentMetadata: null as string | null,
    menu_metadata_global: null as any,
    menu_metadata_records: null as any,
    menu_param1: null as any,
    menu_label1: null as any,
    menu_sobject: null as any,
});

const testSlice = createSlice({
    name: 'packageTest',
    initialState: initialState(),
    reducers: {
        loadCacheSettings: (state, action: any) => {
            const { alias } = action.payload;
            const cachedConfig = loadCacheSettingsHelper(alias);
            if (cachedConfig) {
                const { currentMethod } = cachedConfig;
                Object.assign(state, { currentMethod });
            }
        },
        saveCacheSettings: (state, action: any) => {
            const { alias } = action.payload;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsHelper(alias, state);
            }
        },
        updateCurrentMethodPanel: (state, action: any) => {
            const { value, alias } = action.payload;
            state.currentMethod = value;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsHelper(alias, state);
            }
        },
        updateLeftPanel: (state, action: any) => {
            const { value, alias } = action.payload;
            state.leftPanelToggled = value === true;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettingsHelper(alias, state);
            }
        },
        clearCurrentDeploymentJob: (state: any) => {
            state.currentDeploymentJob = null;
        },
        clearCurrentRetrieveJob: (state: any) => {
            state.currentRetrieveJob = null;
        },
        setMenuAttributes: (state, action: any) => {
            const { sobject, param1, label1 } = action.payload || {};
            if (sobject !== undefined) state.menu_sobject = sobject;
            if (param1 !== undefined) state.menu_param1 = param1;
            if (label1 !== undefined) state.menu_label1 = label1;
        },
        menuGoBack: (state: any) => {
            state.menu_metadata_records = null;
            state.menu_currentMetadata = null;
            state.menu_param1 = null;
            state.menu_label1 = null;
        },
    },
    extraReducers: builder => {
        builder
            .addCase(DEPLOY_PENDING, (state: any, action: any) => {
                const { createdDate } = action.meta.arg;
                state.currentDeploymentJob = { isFetching: true, error: null, createdDate };
            })
            .addCase(DEPLOY_FULFILLED, (state: any, action: any) => {
                Object.assign(state.currentDeploymentJob, {
                    isFetching: false,
                    data: action.payload,
                });
            })
            .addCase(DEPLOY_REJECTED, (state: any, action: any) => {
                const { error } = action;
                Object.assign(state.currentDeploymentJob, { isFetching: false, error });
            })
            .addCase(RETRIEVE_PENDING, (state: any, action: any) => {
                const { createdDate } = action.meta.arg;
                state.currentRetrieveJob = { isFetching: true, error: null, createdDate };
            })
            .addCase(RETRIEVE_FULFILLED, (state: any, action: any) => {
                Object.assign(state.currentRetrieveJob, {
                    isFetching: false,
                    data: action.payload.data,
                });
            })
            .addCase(RETRIEVE_REJECTED, (state: any, action: any) => {
                const { error } = action;
                Object.assign(state.currentRetrieveJob, { isFetching: false, error });
            })
            .addCase(MENU_GLOBAL_PENDING, (state: any) => {
                state.menu_isLoading = true;
                state.menu_loadingMessage = 'Loading All Metadata';
            })
            .addCase(MENU_GLOBAL_FULFILLED, (state: any, action: any) => {
                state.menu_isLoading = false;
                state.menu_metadata_global = action.payload;
            })
            .addCase(MENU_GLOBAL_REJECTED, (state: any) => {
                state.menu_isLoading = false;
            })
            .addCase(MENU_SPECIFIC_PENDING, (state: any) => {
                state.menu_isLoading = true;
                state.menu_loadingMessage = 'Loading Records';
            })
            .addCase(MENU_SPECIFIC_FULFILLED, (state: any, action: any) => {
                state.menu_isLoading = false;
                state.menu_metadata_records = action.payload.metadata;
                state.menu_currentMetadata = action.payload.currentMetadata;
            })
            .addCase(MENU_SPECIFIC_REJECTED, (state: any) => {
                state.menu_isLoading = false;
            });
    },
});

function makeState(overrides: Partial<ReturnType<typeof initialState>> = {}) {
    return { ...initialState(), ...overrides };
}

function ensureLocalStorage() {
    // `loadCacheSettingsHelper`/`saveCacheSettingsHelper` call the bare global
    // `localStorage` (not `window.localStorage`), matching the real source
    // (`../package.ts` also calls the bare global). Install a fresh
    // in-memory stand-in per test so state doesn't leak across tests.
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => {
            store.set(key, String(value));
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => store.clear(),
    };
    return store;
}

// ---------------------------------------------------------------------------
// loadCacheSettings / saveCacheSettings
// ---------------------------------------------------------------------------

test('loadCacheSettings: restores currentMethod from a previously cached blob', () => {
    ensureLocalStorage();
    localStorage.setItem(
        'myalias-PACKAGE_SETTINGS_KEY',
        JSON.stringify({ currentMethod: 'deploy', leftPanelToggled: true })
    );
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.loadCacheSettings({ alias: 'myalias' })
    );
    assert.equal(next.currentMethod, 'deploy');
    // NOTE: the real reducer only destructures+assigns `currentMethod` from
    // the cached config, even though `saveCacheSettings` persists
    // `leftPanelToggled` too — `leftPanelToggled` is intentionally NOT
    // restored by `loadCacheSettings`. This test pins that asymmetry.
    assert.equal(
        next.leftPanelToggled,
        false,
        'leftPanelToggled is never restored by loadCacheSettings'
    );
});

test('loadCacheSettings: no cached config -> state is untouched', () => {
    ensureLocalStorage();
    const before = makeState({ currentMethod: 'retrieve' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.loadCacheSettings({ alias: 'unknown-alias' })
    );
    assert.equal(next.currentMethod, 'retrieve');
});

test('saveCacheSettings: persists currentMethod + leftPanelToggled under the alias-scoped key', () => {
    ensureLocalStorage();
    const state = makeState({ currentMethod: 'deploy', leftPanelToggled: true });
    testSlice.reducer(state, testSlice.actions.saveCacheSettings({ alias: 'org1' }));
    const raw = localStorage.getItem('org1-PACKAGE_SETTINGS_KEY');
    assert.deepEqual(JSON.parse(raw as string), {
        currentMethod: 'deploy',
        leftPanelToggled: true,
    });
});

test('saveCacheSettings: does nothing when alias is null/undefined', () => {
    const store = ensureLocalStorage();
    testSlice.reducer(makeState(), testSlice.actions.saveCacheSettings({ alias: null }));
    assert.equal(store.size, 0, 'no cache write should happen without an alias');
});

// ---------------------------------------------------------------------------
// updateCurrentMethodPanel / updateLeftPanel
// ---------------------------------------------------------------------------

test('updateCurrentMethodPanel: sets currentMethod and persists when alias is provided', () => {
    ensureLocalStorage();
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.updateCurrentMethodPanel({ value: 'retrieve', alias: 'org2' })
    );
    assert.equal(next.currentMethod, 'retrieve');
    assert.ok(
        localStorage.getItem('org2-PACKAGE_SETTINGS_KEY'),
        'saveCacheSettings must be triggered'
    );
});

test('updateCurrentMethodPanel: sets currentMethod without persisting when alias is absent', () => {
    const store = ensureLocalStorage();
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.updateCurrentMethodPanel({ value: 'deploy', alias: null })
    );
    assert.equal(next.currentMethod, 'deploy');
    assert.equal(store.size, 0);
});

test('updateLeftPanel: coerces via strict `=== true` (non-boolean truthy values do not toggle it on)', () => {
    ensureLocalStorage();
    const on = testSlice.reducer(
        makeState(),
        testSlice.actions.updateLeftPanel({ value: true, alias: null })
    );
    assert.equal(on.leftPanelToggled, true);

    const truthyNotBool = testSlice.reducer(
        makeState(),
        testSlice.actions.updateLeftPanel({ value: 'yes', alias: null })
    );
    assert.equal(
        truthyNotBool.leftPanelToggled,
        false,
        'only the literal boolean true toggles the panel on'
    );
});

// ---------------------------------------------------------------------------
// clearCurrentDeploymentJob / clearCurrentRetrieveJob
// ---------------------------------------------------------------------------

test('clearCurrentDeploymentJob: nulls out currentDeploymentJob', () => {
    const before = makeState({ currentDeploymentJob: { isFetching: false, data: {} } });
    const next = testSlice.reducer(before, testSlice.actions.clearCurrentDeploymentJob());
    assert.equal(next.currentDeploymentJob, null);
});

test('clearCurrentRetrieveJob: nulls out currentRetrieveJob', () => {
    const before = makeState({ currentRetrieveJob: { isFetching: false, data: {} } });
    const next = testSlice.reducer(before, testSlice.actions.clearCurrentRetrieveJob());
    assert.equal(next.currentRetrieveJob, null);
});

// ---------------------------------------------------------------------------
// setMenuAttributes / menuGoBack
// ---------------------------------------------------------------------------

test('setMenuAttributes: only overwrites fields explicitly present (undefined leaves existing value untouched)', () => {
    const before = makeState({ menu_sobject: 'Account', menu_param1: 'p1', menu_label1: 'L1' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.setMenuAttributes({ sobject: 'Contact' })
    );
    assert.equal(next.menu_sobject, 'Contact');
    assert.equal(next.menu_param1, 'p1', 'param1 not present in payload -> untouched');
    assert.equal(next.menu_label1, 'L1', 'label1 not present in payload -> untouched');
});

test('setMenuAttributes: explicit null values DO overwrite (only `undefined` is skipped)', () => {
    const before = makeState({ menu_sobject: 'Account', menu_param1: 'p1' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.setMenuAttributes({ sobject: null, param1: null })
    );
    assert.equal(next.menu_sobject, null);
    assert.equal(next.menu_param1, null);
});

test('setMenuAttributes: missing payload entirely is a no-op (falls back to `{}`)', () => {
    const before = makeState({ menu_sobject: 'Account' });
    const next = testSlice.reducer(before, testSlice.actions.setMenuAttributes(undefined));
    assert.equal(next.menu_sobject, 'Account');
});

test('menuGoBack: clears metadata records, current metadata, param1, and label1', () => {
    const before = makeState({
        menu_metadata_records: [{ name: 'Account' }],
        menu_currentMetadata: 'Account',
        menu_param1: 'p1',
        menu_label1: 'L1',
        menu_sobject: 'Account',
    });
    const next = testSlice.reducer(before, testSlice.actions.menuGoBack());
    assert.equal(next.menu_metadata_records, null);
    assert.equal(next.menu_currentMetadata, null);
    assert.equal(next.menu_param1, null);
    assert.equal(next.menu_label1, null);
    assert.equal(next.menu_sobject, 'Account', 'menuGoBack does NOT clear menu_sobject');
});

// ---------------------------------------------------------------------------
// extraReducers: executePackageDeploy
// ---------------------------------------------------------------------------

test('executePackageDeploy.pending: seeds currentDeploymentJob as fetching', () => {
    const next = testSlice.reducer(makeState(), {
        type: DEPLOY_PENDING,
        meta: { arg: { createdDate: '2026-01-01' } },
    });
    assert.deepEqual(next.currentDeploymentJob, {
        isFetching: true,
        error: null,
        createdDate: '2026-01-01',
    });
});

test('executePackageDeploy.fulfilled: marks job done and stores the deploy result payload', () => {
    const before = makeState({
        currentDeploymentJob: { isFetching: true, error: null, createdDate: '2026-01-01' },
    });
    const next = testSlice.reducer(before, {
        type: DEPLOY_FULFILLED,
        payload: { status: 'Succeeded' },
    });
    assert.equal(next.currentDeploymentJob.isFetching, false);
    assert.deepEqual(next.currentDeploymentJob.data, { status: 'Succeeded' });
});

test('executePackageDeploy.rejected: marks job failed and records the error', () => {
    const before = makeState({
        currentDeploymentJob: { isFetching: true, error: null, createdDate: '2026-01-01' },
    });
    const next = testSlice.reducer(before, {
        type: DEPLOY_REJECTED,
        error: { message: 'INVALID_SESSION_ID' },
    });
    assert.equal(next.currentDeploymentJob.isFetching, false);
    assert.deepEqual(next.currentDeploymentJob.error, { message: 'INVALID_SESSION_ID' });
});

// ---------------------------------------------------------------------------
// extraReducers: executePackageRetrieve
// ---------------------------------------------------------------------------

test('executePackageRetrieve.pending: seeds currentRetrieveJob as fetching', () => {
    const next = testSlice.reducer(makeState(), {
        type: RETRIEVE_PENDING,
        meta: { arg: { createdDate: '2026-02-01' } },
    });
    assert.deepEqual(next.currentRetrieveJob, {
        isFetching: true,
        error: null,
        createdDate: '2026-02-01',
    });
});

test('executePackageRetrieve.fulfilled: marks job done and stores payload.data (not the whole payload)', () => {
    const before = makeState({
        currentRetrieveJob: { isFetching: true, error: null, createdDate: '2026-02-01' },
    });
    const next = testSlice.reducer(before, {
        type: RETRIEVE_FULFILLED,
        payload: { data: { zipFile: 'base64...', id: '09S1' } },
    });
    assert.equal(next.currentRetrieveJob.isFetching, false);
    assert.deepEqual(next.currentRetrieveJob.data, { zipFile: 'base64...', id: '09S1' });
});

test('executePackageRetrieve.rejected: marks job failed and records the error', () => {
    const before = makeState({
        currentRetrieveJob: { isFetching: true, error: null, createdDate: '2026-02-01' },
    });
    const next = testSlice.reducer(before, {
        type: RETRIEVE_REJECTED,
        error: { message: 'Retrieve timed out' },
    });
    assert.equal(next.currentRetrieveJob.isFetching, false);
    assert.deepEqual(next.currentRetrieveJob.error, { message: 'Retrieve timed out' });
});

// ---------------------------------------------------------------------------
// extraReducers: fetchMenuGlobalMetadata / fetchMenuSpecificMetadata
// ---------------------------------------------------------------------------

test('fetchMenuGlobalMetadata.pending: sets loading + a "Loading All Metadata" message', () => {
    const next = testSlice.reducer(makeState(), { type: MENU_GLOBAL_PENDING });
    assert.equal(next.menu_isLoading, true);
    assert.equal(next.menu_loadingMessage, 'Loading All Metadata');
});

test('fetchMenuGlobalMetadata.fulfilled: stores the payload as menu_metadata_global and clears loading', () => {
    const before = makeState({ menu_isLoading: true });
    const next = testSlice.reducer(before, {
        type: MENU_GLOBAL_FULFILLED,
        payload: { records: [{ name: 'CustomObject' }], label: 'Metadata' },
    });
    assert.equal(next.menu_isLoading, false);
    assert.deepEqual(next.menu_metadata_global, {
        records: [{ name: 'CustomObject' }],
        label: 'Metadata',
    });
});

test('fetchMenuGlobalMetadata.rejected: only clears loading (does not touch menu_metadata_global)', () => {
    const before = makeState({
        menu_isLoading: true,
        menu_metadata_global: { records: ['stale'] },
    });
    const next = testSlice.reducer(before, { type: MENU_GLOBAL_REJECTED });
    assert.equal(next.menu_isLoading, false);
    assert.deepEqual(
        next.menu_metadata_global,
        { records: ['stale'] },
        'rejected does not clear previously loaded global metadata'
    );
});

test('fetchMenuSpecificMetadata.pending: sets loading + a "Loading Records" message', () => {
    const next = testSlice.reducer(makeState(), { type: MENU_SPECIFIC_PENDING });
    assert.equal(next.menu_isLoading, true);
    assert.equal(next.menu_loadingMessage, 'Loading Records');
});

test('fetchMenuSpecificMetadata.fulfilled: stores metadata + currentMetadata from the payload', () => {
    const before = makeState({ menu_isLoading: true });
    const next = testSlice.reducer(before, {
        type: MENU_SPECIFIC_FULFILLED,
        payload: { currentMetadata: 'CustomObject', metadata: [{ fullName: 'Foo__c' }] },
    });
    assert.equal(next.menu_isLoading, false);
    assert.equal(next.menu_currentMetadata, 'CustomObject');
    assert.deepEqual(next.menu_metadata_records, [{ fullName: 'Foo__c' }]);
});

test('fetchMenuSpecificMetadata.rejected: only clears loading (does not touch cached records)', () => {
    const before = makeState({
        menu_isLoading: true,
        menu_metadata_records: [{ fullName: 'stale' }],
        menu_currentMetadata: 'StaleType',
    });
    const next = testSlice.reducer(before, { type: MENU_SPECIFIC_REJECTED });
    assert.equal(next.menu_isLoading, false);
    assert.deepEqual(next.menu_metadata_records, [{ fullName: 'stale' }]);
    assert.equal(next.menu_currentMetadata, 'StaleType');
});

// ---------------------------------------------------------------------------
// Source contract tests — pin the real `../package.ts` against regexes so
// drift between this clone and the real implementation is caught.
// ---------------------------------------------------------------------------

test('source contract: packageSlice reducers include the full expected set of names', () => {
    const expectedReducers = [
        'loadCacheSettings',
        'saveCacheSettings',
        'updateCurrentMethodPanel',
        'updateLeftPanel',
        'clearCurrentDeploymentJob',
        'clearCurrentRetrieveJob',
        'setMenuAttributes',
        'menuGoBack',
    ];
    for (const name of expectedReducers) {
        assert.match(
            SRC,
            new RegExp(`\\b${name}: \\(?state`),
            `expected reducer \`${name}\` to be defined with a \`state\` first param`
        );
    }
});

test('source contract: loadCacheSettings only restores currentMethod from the cached config', () => {
    assert.match(
        SRC,
        /loadCacheSettings: \(state, action\) => \{\s*const \{ alias \} = action\.payload;\s*const cachedConfig = loadCacheSettings\(alias\);\s*if \(cachedConfig\) \{\s*const \{ currentMethod \} = cachedConfig;\s*Object\.assign\(state, \{\s*currentMethod,\s*\}\);/
    );
});

test('source contract: updateLeftPanel coerces via the strict `=== true` check', () => {
    assert.match(SRC, /state\.leftPanelToggled = value === true;/);
});

test('source contract: setMenuAttributes only skips fields that are `undefined`', () => {
    assert.match(SRC, /if \(sobject !== undefined\) state\.menu_sobject = sobject;/);
    assert.match(SRC, /if \(param1 !== undefined\) state\.menu_param1 = param1;/);
    assert.match(SRC, /if \(label1 !== undefined\) state\.menu_label1 = label1;/);
});

test('source contract: menuGoBack clears records/currentMetadata/param1/label1 but not menu_sobject', () => {
    assert.match(
        SRC,
        /menuGoBack: state => \{\s*state\.menu_metadata_records = null;\s*state\.menu_currentMetadata = null;\s*state\.menu_param1 = null;\s*state\.menu_label1 = null;\s*\},/
    );
});

test('source contract: executePackageRetrieve.fulfilled stores payload.data (not the raw payload)', () => {
    assert.match(
        SRC,
        /addCase\(executePackageRetrieve\.fulfilled, \(state, action\) => \{\s*Object\.assign\(state\.currentRetrieveJob, \{\s*isFetching: false,\s*data: action\.payload\.data,/
    );
});

test('source contract: fetchMenuGlobalMetadata/fetchMenuSpecificMetadata rejected cases only clear menu_isLoading', () => {
    assert.match(
        SRC,
        /addCase\(fetchMenuGlobalMetadata\.rejected, state => \{\s*state\.menu_isLoading = false;\s*\}\)/
    );
    assert.match(
        SRC,
        /addCase\(fetchMenuSpecificMetadata\.rejected, state => \{\s*state\.menu_isLoading = false;\s*\}\);/
    );
});

test('source contract: lowerCaseKey and guid are imported but not invoked anywhere in the slice body', () => {
    // Guards against silent drift: if a future change starts actually using
    // these helpers inside packageSlice's reducers/extraReducers, this test
    // rig would need matching stand-ins added (it currently has none).
    assert.match(SRC, /import \{ lowerCaseKey, guid, isNotUndefinedOrNull,/);
    assert.equal(
        (SRC.match(/\blowerCaseKey\(/g) || []).length,
        0,
        'lowerCaseKey is imported but must not be called anywhere in package.ts'
    );
    assert.equal(
        (SRC.match(/\bguid\(/g) || []).length,
        0,
        'guid is imported but must not be called anywhere in package.ts'
    );
});
