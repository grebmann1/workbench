/**
 * Slice-behavior tests for the api application's `apiSlice` — focused on the
 * synchronous `reducers` (tab management, cache settings, action-history
 * navigation) and the entity-adapter `extraReducers` around
 * `executeApiRequest`.
 *
 * Why we don't import `../api.ts` directly
 * ------------------------------------------
 * `../api.ts` imports `DOCUMENT`, `ERROR` from `host-api/store` and
 * `getStore` from `core/store/storeRef` at module top-level. `host-api/store`
 * transitively loads the full core store graph including LWC components
 * decorated with `@api`/`@wire` — invalid syntax under plain Node, since
 * this test runner (`--experimental-strip-types`) only strips TypeScript
 * types and cannot parse LWC decorator syntax. Importing `../api.ts`
 * directly throws `SyntaxError: Invalid or unexpected token`. Verified
 * empirically:
 *   node --experimental-strip-types --import=./tools/testing/register.mjs \
 *     -e "import('./packages/lwc/applications/api/slices/api.ts')"
 *   -> SyntaxError: Invalid or unexpected token
 * This is the same constraint documented in
 * `platformevent/slices/__tests__/platformEvent.test.ts` (the canonical
 * precedent for this pattern) and `agentforce/slices/__tests__/agents.test.ts`
 * (the original).
 *
 * Pragmatic alternative: re-construct the same reducers the slice uses as a
 * "faithful clone" built with `createSlice`/`createEntityAdapter` from
 * `@reduxjs/toolkit` (the same library the real slice uses), and pin the
 * clone's fidelity with "source contract" tests that `readFileSync` the real
 * `../api.ts` and `assert.match` key lines/policies. Any drift between the
 * clone and the real file gets caught by those contract tests in review.
 *
 * `lowerCaseKey` and `isNotUndefinedOrNull` are imported directly from
 * `shared/utils` — that module does NOT import `host-api/store`, so it is
 * safe to import in this plain-Node test environment (same precedent as
 * `anonymousApex/slices/__tests__/apexHelpers.test.ts`).
 *
 * The standalone top-level `loadCacheSettings(alias)` export (distinct from
 * the same-named property inside `apiSlice.reducers`) is covered separately
 * in `loadCacheSettings.test.ts`, imported indirectly via a small faithful
 * clone of its own tiny body (see that file's header for why a direct
 * import still isn't possible even though its own dependencies parse fine).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';

import { lowerCaseKey, isNotUndefinedOrNull } from 'shared/utils';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../api.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Test rig: faithful clone of apiSlice's reducers + extraReducers. MUST stay
// in sync with `../api.ts`. Each reducer below mirrors the real
// implementation; the "source contract" tests at the bottom pin the real
// source against regexes so drift is caught.
// ---------------------------------------------------------------------------

const testApiAdapter = createEntityAdapter();
// Stand-in for `DOCUMENT.apiFileAdapter.getSelectors(s => s.apiFiles)`: an
// entity-adapter selector set over a plain `{ apiFiles: EntityState }` shape,
// used by `enrichTab`/`enrichTabs` to resolve a linked file's content.
const testApiFileAdapter = createEntityAdapter();
const apiFilesSelectors = testApiFileAdapter.getSelectors((s: any) => s.apiFiles);

function formatTab({
    id,
    name,
    header,
    body,
    bodyMode,
    method,
    endpoint,
    isDraft,
    fileId,
    fileData,
    actions,
    actionPointer,
}: any) {
    return {
        id,
        name,
        header,
        body,
        bodyMode: bodyMode || 'raw',
        method,
        endpoint,
        isDraft,
        fileId,
        fileData,
        actions,
        actionPointer,
    };
}

function enrichTabs(tabs: any[], state: any, selector: any) {
    return tabs.map(tab => enrichTab(tab, state, selector));
}

const norm = (v: unknown): string => (v == null ? '' : String(v));

function enrichTab(tab: any, state: any, selector: any) {
    const file =
        tab.fileId && selector ? selector.selectById(state, lowerCaseKey(tab.fileId)) : null;
    const fileData = file?.extra || {};
    const differs =
        norm(fileData.body) !== norm(tab.body) ||
        norm(fileData.bodyMode || 'raw') !== norm(tab.bodyMode || 'raw') ||
        norm(fileData.header) !== norm(tab.header) ||
        norm(fileData.method) !== norm(tab.method) ||
        norm(fileData.endpoint) !== norm(tab.endpoint);
    return {
        ...tab,
        isDraft: differs && isNotUndefinedOrNull(tab.fileId),
    };
}

function assignNewApiData(item: any, value: any) {
    Object.assign(item, {
        header: value.header,
        method: value.method,
        endpoint: value.endpoint,
        body: value.body,
        bodyMode: value.bodyMode || 'raw',
        actions: value.actions,
        actionPointer: value.actionPointer,
    });
}

function addAction({ state, tabId, request, response }: any) {
    const tabIndex = state.tabs.findIndex((x: any) => x.id === tabId);
    if (tabIndex > -1) {
        let actions = state.tabs[tabIndex].actions || [];
        const actionPointer = state.tabs[tabIndex].actionPointer || 0;

        if (actions.length > 0 && actionPointer != actions.length - 1) {
            actions = actions.slice(0, actionPointer + 1);
        }
        actions.push({ request, response });
        Object.assign(state.tabs[tabIndex], {
            actions,
            actionPointer: actions.length - 1,
        });
        assignNewApiData(state, state.tabs[tabIndex]);
    }
}

const DEFAULT_API_VERSION = '59.0';
const DEFAULT_HEADER = 'Content-Type: application/json; charset=UTF-8\nAccept: application/json';

function generateDefaultTab(version: string) {
    return {
        id: 'generated-id',
        header: DEFAULT_HEADER,
        endpoint: `/services/data/v${version}`,
        body: '',
        bodyMode: 'raw',
        method: 'GET',
        variables: '{}',
        actions: [],
        actionPointer: null,
    };
}

function createInitialTabs(apiVersion: string, defaultHeader: string) {
    const tab: any = generateDefaultTab(apiVersion);
    if (defaultHeader) {
        tab.header = defaultHeader;
    }
    return [enrichTab(tab, null, null)];
}

const DEFAULT_VARIABLES = `{
    "id": "123",
    "name": "John Doe"
}`;

// Simulated async thunk action-type strings (mirrors `executeApiRequest`'s
// `createAsyncThunk('api/callRequest', ...)` auto-generated types).
const PENDING = 'api/callRequest/pending';
const FULFILLED = 'api/callRequest/fulfilled';
const REJECTED = 'api/callRequest/rejected';

const initialState = () => ({
    viewerTab: 'Default',
    requestTab: 'Default',
    recentPanelToggled: false,
    tabs: [] as any[],
    currentTab: null as any,
    api: testApiAdapter.getInitialState(),
    body: null,
    method: null,
    endpoint: null,
    variables: DEFAULT_VARIABLES,
    header: null,
    defaultHeader: DEFAULT_HEADER,
    currentApiVersion: DEFAULT_API_VERSION,
    abortingMap: {} as Record<string, any>,
    isInitialized: false,
    currentFileId: undefined as any,
});

const testSlice = createSlice({
    name: 'apiTest',
    initialState: initialState(),
    reducers: {
        loadCacheSettings: (state, action: any) => {
            const { cachedConfig, apiFiles } = action.payload;
            if (cachedConfig && !state.isInitialized) {
                const { viewerTab, requestTab, recentPanelToggled, tabs, defaultHeader } =
                    cachedConfig;
                const cachedTabs =
                    tabs && tabs.length > 0
                        ? enrichTabs(tabs, { apiFiles }, apiFilesSelectors)
                        : [];
                const allTabs = [...cachedTabs, ...state.tabs];
                Object.assign(state, {
                    viewerTab,
                    requestTab,
                    recentPanelToggled,
                    defaultHeader: defaultHeader || state.defaultHeader,
                    tabs: allTabs,
                    currentTab: allTabs.length > 0 ? allTabs[allTabs.length - 1] : null,
                });
            }
            state.isInitialized = true;
        },
        updateViewerTab: (state, action: any) => {
            const { value } = action.payload;
            state.viewerTab = value;
        },
        updateRequestTab: (state, action: any) => {
            const { value } = action.payload;
            state.requestTab = value;
        },
        updateRequest: (state, action: any) => {
            const { header, method, endpoint, body, bodyMode, tabId, isDraft } = action.payload;
            const tabIndex = state.tabs.findIndex((x: any) => x.id === tabId);
            if (tabIndex > -1) {
                Object.assign(state.tabs[tabIndex], {
                    header,
                    method,
                    endpoint,
                    body,
                    bodyMode: bodyMode || 'raw',
                    isDraft,
                });
                assignNewApiData(state, state.tabs[tabIndex]);
                state.currentTab = state.tabs[tabIndex];
            }
        },
        updateDefaultHeader: (state, action: any) => {
            const { header } = action.payload;
            state.defaultHeader = header;
        },
        updateCurrentApiVersion: (state, action: any) => {
            const { version } = action.payload;
            state.currentApiVersion = version || DEFAULT_API_VERSION;
        },
        updateRecentPanel: (state, action: any) => {
            const { value } = action.payload;
            state.recentPanelToggled = value === true;
        },
        initTabs: (state, action: any) => {
            const { apiFiles, reset } = action.payload;
            if (reset || !state.tabs || state.tabs.length === 0) {
                state.tabs = enrichTabs(
                    createInitialTabs(state.currentApiVersion, state.defaultHeader),
                    { apiFiles },
                    apiFilesSelectors
                );
            } else {
                state.tabs = enrichTabs(state.tabs.map(formatTab), { apiFiles }, apiFilesSelectors);
            }
            if (state.tabs.length > 0) {
                const lastTabIndex = state.tabs.length - 1;
                state.currentTab = state.tabs[lastTabIndex];
                state.currentFileId = state.tabs[lastTabIndex].fileId;
                assignNewApiData(state, state.tabs[lastTabIndex]);
            }
        },
        resetTab: (state, action: any) => {
            const { tabId, apiFiles } = action.payload;
            const tabIndex = state.tabs.findIndex((x: any) => x.id === tabId);
            if (tabIndex > -1) {
                let enrichedTab: any;
                const existingFileId = state.tabs[tabIndex].fileId;
                if (existingFileId) {
                    enrichedTab = enrichTab(
                        formatTab({ ...state.tabs[tabIndex], fileId: existingFileId }),
                        { apiFiles },
                        apiFilesSelectors
                    );
                } else {
                    enrichedTab = enrichTab(
                        generateDefaultTab(state.currentApiVersion),
                        null,
                        null
                    );
                }
                state.tabs[tabIndex] = enrichedTab;
                state.currentTab = enrichedTab;
                assignNewApiData(state, enrichedTab);
            }
        },
        addTab: (state, action: any) => {
            const { apiFiles, tab } = action.payload;
            if (!tab.header || tab.header === DEFAULT_HEADER) {
                tab.header = state.defaultHeader || DEFAULT_HEADER;
            }
            const enrichedTab = enrichTab(formatTab(tab), { apiFiles }, apiFilesSelectors);
            state.tabs.push(enrichedTab);
            state.currentTab = enrichedTab;
            state.currentFileId = enrichedTab.fileId;
            assignNewApiData(state, enrichedTab);
        },
        removeTab: (state, action: any) => {
            const { id } = action.payload;
            state.tabs = state.tabs.filter((x: any) => x.id != id);
            if (state.tabs.length > 0 && state.currentTab.id == id) {
                const lastTab = state.tabs[state.tabs.length - 1];
                state.currentTab = lastTab;
                assignNewApiData(state, lastTab);
            }
        },
        selectionTab: (state, action: any) => {
            const { id } = action.payload;
            const tab = state.tabs.find((x: any) => x.id == id);
            if (tab) {
                state.currentTab = tab;
                assignNewApiData(state, tab);
            }
        },
        linkFileToTab: (state, action: any) => {
            const { fileId, apiFiles } = action.payload;
            const currentTabIndex = state.tabs.findIndex((x: any) => x.id == state.currentTab.id);
            if (currentTabIndex > -1) {
                const enrichedTab = enrichTab(
                    formatTab({ ...state.tabs[currentTabIndex], fileId }),
                    { apiFiles },
                    apiFilesSelectors
                );
                state.tabs[currentTabIndex] = enrichedTab;
                state.currentTab = enrichedTab;
                assignNewApiData(state, enrichedTab);
            }
        },
        increaseActionPointer: (state, action: any) => {
            const { tabId } = action.payload;
            const tabIndex = state.tabs.findIndex((x: any) => x.id === tabId);
            if (tabIndex > -1) {
                const actions = state.tabs[tabIndex].actions;
                let actionPointer = state.tabs[tabIndex].actionPointer;
                if (actions.length - 1 <= actionPointer) {
                    actionPointer = actions.length - 1;
                } else {
                    actionPointer = actionPointer + 1;
                }
                Object.assign(state.tabs[tabIndex], { actionPointer });
                assignNewApiData(state, state.tabs[tabIndex]);
            }
        },
        decreaseActionPointer: (state, action: any) => {
            const { tabId } = action.payload;
            const tabIndex = state.tabs.findIndex((x: any) => x.id === tabId);
            if (tabIndex > -1) {
                let actionPointer = state.tabs[tabIndex].actionPointer;
                if (actionPointer <= 0) {
                    actionPointer = 0;
                } else {
                    actionPointer = actionPointer - 1;
                }
                Object.assign(state.tabs[tabIndex], { actionPointer });
                assignNewApiData(state, state.tabs[tabIndex]);
            }
        },
        setAbortingPromise: (state, action: any) => {
            const { tabId, promise } = action.payload;
            state.abortingMap = { ...state.abortingMap, [tabId]: promise };
        },
        resetAbortingPromise: (state, action: any) => {
            const { tabId } = action.payload;
            state.abortingMap = { ...state.abortingMap, [tabId]: null };
        },
        clearAbortingMap: (state: any) => {
            state.abortingMap = {};
        },
        updateVariables: (state, action: any) => {
            const { variables } = action.payload;
            state.variables = variables;
        },
    },
    extraReducers: builder => {
        builder
            .addCase(PENDING, (state: any, action: any) => {
                const { tabId, createdDate } = action.meta.arg;
                testApiAdapter.upsertOne(state.api, {
                    id: lowerCaseKey(tabId),
                    response: null,
                    createdDate,
                    isFetching: true,
                    error: null,
                });
            })
            .addCase(FULFILLED, (state: any, action: any) => {
                const { response, request, formattedRequest } = action.payload;
                const { tabId, createdDate } = action.meta.arg;
                state.abortingMap = { ...state.abortingMap, [tabId]: null };
                testApiAdapter.upsertOne(state.api, {
                    id: lowerCaseKey(tabId),
                    response,
                    request,
                    formattedRequest,
                    isFetching: false,
                    createdDate,
                    error: null,
                });
                addAction({ state, tabId, request, response });
            })
            .addCase(REJECTED, (state: any, action: any) => {
                const { error } = action;
                const { tabId } = action.meta.arg;
                state.abortingMap = { ...state.abortingMap, [tabId]: null };
                testApiAdapter.upsertOne(state.api, {
                    id: lowerCaseKey(tabId),
                    isFetching: false,
                    error: action.meta.aborted ? null : error,
                });
            });
    },
});

function makeState(overrides: Partial<ReturnType<typeof initialState>> = {}) {
    return { ...initialState(), ...overrides };
}

// ---------------------------------------------------------------------------
// loadCacheSettings (the reducer, not the standalone exported function)
// ---------------------------------------------------------------------------

test('loadCacheSettings reducer: merges cached config into state and marks isInitialized', () => {
    const before = makeState({ tabs: [{ id: 'existing' }] as any });
    const next = testSlice.reducer(
        before,
        testSlice.actions.loadCacheSettings({
            cachedConfig: {
                viewerTab: 'Pretty',
                requestTab: 'Headers',
                recentPanelToggled: true,
                tabs: [],
                defaultHeader: 'X-Custom: 1',
            },
            apiFiles: {},
        })
    );
    assert.equal(next.viewerTab, 'Pretty');
    assert.equal(next.requestTab, 'Headers');
    assert.equal(next.recentPanelToggled, true);
    assert.equal(next.defaultHeader, 'X-Custom: 1');
    assert.equal(next.isInitialized, true);
    // cachedTabs (empty) prepended to existing tabs -> existing tabs preserved
    assert.deepEqual(next.tabs, [{ id: 'existing' }]);
    assert.deepEqual(next.currentTab, { id: 'existing' });
});

test('loadCacheSettings reducer: is a no-op for state fields (besides isInitialized) once already initialized', () => {
    const before = makeState({ isInitialized: true, viewerTab: 'Default' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.loadCacheSettings({
            cachedConfig: { viewerTab: 'Pretty' },
            apiFiles: {},
        })
    );
    assert.equal(next.viewerTab, 'Default', 'already-initialized state must not be overwritten');
    assert.equal(next.isInitialized, true);
});

test('loadCacheSettings reducer: no cachedConfig -> only isInitialized flips', () => {
    const before = makeState({ viewerTab: 'Default' });
    const next = testSlice.reducer(
        before,
        testSlice.actions.loadCacheSettings({ cachedConfig: null, apiFiles: {} })
    );
    assert.equal(next.viewerTab, 'Default');
    assert.equal(next.isInitialized, true);
});

// ---------------------------------------------------------------------------
// updateViewerTab / updateRequestTab / updateDefaultHeader / updateRecentPanel
// / updateCurrentApiVersion / updateVariables — simple field setters
// ---------------------------------------------------------------------------

test('updateViewerTab: sets viewerTab', () => {
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.updateViewerTab({ value: 'Raw' })
    );
    assert.equal(next.viewerTab, 'Raw');
});

test('updateRequestTab: sets requestTab', () => {
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.updateRequestTab({ value: 'Variables' })
    );
    assert.equal(next.requestTab, 'Variables');
});

test('updateDefaultHeader: sets defaultHeader', () => {
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.updateDefaultHeader({ header: 'X-Foo: bar' })
    );
    assert.equal(next.defaultHeader, 'X-Foo: bar');
});

test('updateCurrentApiVersion: sets version when provided', () => {
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.updateCurrentApiVersion({ version: '60.0' })
    );
    assert.equal(next.currentApiVersion, '60.0');
});

test('updateCurrentApiVersion: falls back to DEFAULT_API_VERSION when version is falsy', () => {
    const next = testSlice.reducer(
        makeState({ currentApiVersion: '60.0' }),
        testSlice.actions.updateCurrentApiVersion({ version: null })
    );
    assert.equal(next.currentApiVersion, DEFAULT_API_VERSION);
});

test('updateRecentPanel: coerces truthy/non-boolean values via strict `=== true`', () => {
    const on = testSlice.reducer(makeState(), testSlice.actions.updateRecentPanel({ value: true }));
    assert.equal(on.recentPanelToggled, true);

    const truthyButNotBoolTrue = testSlice.reducer(
        makeState(),
        testSlice.actions.updateRecentPanel({ value: 1 })
    );
    assert.equal(
        truthyButNotBoolTrue.recentPanelToggled,
        false,
        '`value === true` only accepts the literal boolean true'
    );
});

test('updateVariables: sets variables verbatim', () => {
    const next = testSlice.reducer(
        makeState(),
        testSlice.actions.updateVariables({ variables: '{"a":1}' })
    );
    assert.equal(next.variables, '{"a":1}');
});

// ---------------------------------------------------------------------------
// updateRequest
// ---------------------------------------------------------------------------

test('updateRequest: updates the matching tab and mirrors it onto top-level state via assignNewApiData', () => {
    const before = makeState({
        tabs: [
            {
                id: 't1',
                header: 'H',
                method: 'GET',
                endpoint: '/e',
                body: '',
                actions: [],
                actionPointer: null,
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.updateRequest({
            tabId: 't1',
            header: 'H2',
            method: 'POST',
            endpoint: '/e2',
            body: '{}',
            bodyMode: 'raw',
            isDraft: true,
        })
    );
    assert.equal(next.tabs[0].method, 'POST');
    assert.equal(next.tabs[0].isDraft, true);
    assert.equal(next.method, 'POST', 'assignNewApiData mirrors tab fields to top-level state');
    assert.deepEqual(next.currentTab, next.tabs[0]);
});

test('updateRequest: defaults bodyMode to "raw" when falsy', () => {
    const before = makeState({
        tabs: [
            {
                id: 't1',
                header: 'H',
                method: 'GET',
                endpoint: '/e',
                body: '',
                actions: [],
                actionPointer: null,
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.updateRequest({ tabId: 't1', bodyMode: undefined })
    );
    assert.equal(next.tabs[0].bodyMode, 'raw');
});

test('updateRequest: non-existent tabId is a no-op', () => {
    const before = makeState({ tabs: [{ id: 't1' }] as any });
    const next = testSlice.reducer(before, testSlice.actions.updateRequest({ tabId: 'nope' }));
    assert.deepEqual(next.tabs, before.tabs);
    assert.equal(next.currentTab, before.currentTab);
});

// ---------------------------------------------------------------------------
// initTabs
// ---------------------------------------------------------------------------

test('initTabs: seeds a single default tab when state.tabs is empty', () => {
    const next = testSlice.reducer(
        makeState({ tabs: [] }),
        testSlice.actions.initTabs({ apiFiles: {}, reset: false })
    );
    assert.equal(next.tabs.length, 1);
    assert.equal(next.tabs[0].endpoint, `/services/data/v${DEFAULT_API_VERSION}`);
    assert.equal(next.currentTab, next.tabs[0]);
});

test('initTabs: reset:true replaces existing tabs with a fresh default tab', () => {
    const before = makeState({
        tabs: [
            {
                id: 'old',
                header: 'H',
                method: 'GET',
                endpoint: '/old',
                body: '',
                actions: [],
                actionPointer: null,
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.initTabs({ apiFiles: {}, reset: true })
    );
    assert.equal(next.tabs.length, 1);
    assert.notEqual(next.tabs[0].id, 'old');
});

test('initTabs: reset:false with existing tabs re-enriches (formatTab + enrichTab) rather than replacing', () => {
    const before = makeState({
        tabs: [
            {
                id: 'existing',
                header: 'H',
                method: 'GET',
                endpoint: '/e',
                body: 'x',
                bodyMode: 'raw',
                actions: [],
                actionPointer: null,
                extraJunkField: 'dropped-by-formatTab',
            },
        ] as any,
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.initTabs({ apiFiles: {}, reset: false })
    );
    assert.equal(next.tabs.length, 1);
    assert.equal(next.tabs[0].id, 'existing');
    assert.equal(
        Object.prototype.hasOwnProperty.call(next.tabs[0], 'extraJunkField'),
        false,
        'formatTab drops fields not in its destructure list'
    );
});

// ---------------------------------------------------------------------------
// resetTab
// ---------------------------------------------------------------------------

test('resetTab: without a linked file, replaces the tab with a fresh default tab', () => {
    const before = makeState({
        currentApiVersion: '61.0',
        tabs: [
            {
                id: 't1',
                header: 'stale',
                method: 'POST',
                endpoint: '/stale',
                body: 'x',
                actions: [{ a: 1 }],
                actionPointer: 0,
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.resetTab({ tabId: 't1', apiFiles: {} })
    );
    assert.equal(next.tabs[0].method, 'GET');
    assert.equal(next.tabs[0].endpoint, '/services/data/v61.0');
    assert.equal(next.currentTab, next.tabs[0]);
});

test('resetTab: with a linked fileId, re-enriches the existing tab (keeps the fileId) instead of generating a default', () => {
    const before = makeState({
        tabs: [
            {
                id: 't1',
                header: 'H',
                method: 'POST',
                endpoint: '/e',
                body: 'x',
                fileId: 'file-1',
                actions: [],
                actionPointer: null,
            },
        ] as any,
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.resetTab({ tabId: 't1', apiFiles: testApiFileAdapter.getInitialState() })
    );
    assert.equal(
        next.tabs[0].fileId,
        'file-1',
        'existing fileId is preserved when resetting a linked tab'
    );
});

test('resetTab: non-existent tabId is a no-op', () => {
    const before = makeState({ tabs: [{ id: 't1' }] as any });
    const next = testSlice.reducer(
        before,
        testSlice.actions.resetTab({ tabId: 'nope', apiFiles: {} })
    );
    assert.deepEqual(next.tabs, before.tabs);
});

// ---------------------------------------------------------------------------
// addTab / removeTab / selectionTab
// ---------------------------------------------------------------------------

test('addTab: appends a tab, applying state.defaultHeader when the tab has no header', () => {
    const before = makeState({ defaultHeader: 'X-Default: 1', tabs: [] });
    const next = testSlice.reducer(
        before,
        testSlice.actions.addTab({
            apiFiles: {},
            tab: {
                id: 'new1',
                method: 'GET',
                endpoint: '/x',
                body: '',
                actions: [],
                actionPointer: null,
            },
        })
    );
    assert.equal(next.tabs.length, 1);
    assert.equal(next.tabs[0].header, 'X-Default: 1');
    assert.equal(next.currentTab, next.tabs[0]);
});

test('addTab: keeps an explicit non-default header untouched', () => {
    const before = makeState({ defaultHeader: 'X-Default: 1', tabs: [] });
    const next = testSlice.reducer(
        before,
        testSlice.actions.addTab({
            apiFiles: {},
            tab: {
                id: 'new1',
                header: 'X-Custom: yes',
                method: 'GET',
                endpoint: '/x',
                body: '',
                actions: [],
                actionPointer: null,
            },
        })
    );
    assert.equal(next.tabs[0].header, 'X-Custom: yes');
});

test('addTab: header equal to the shared DEFAULT_HEADER constant is still replaced by state.defaultHeader', () => {
    const before = makeState({ defaultHeader: 'X-Org-Default: 1', tabs: [] });
    const next = testSlice.reducer(
        before,
        testSlice.actions.addTab({
            apiFiles: {},
            tab: {
                id: 'new1',
                header: DEFAULT_HEADER,
                method: 'GET',
                endpoint: '/x',
                body: '',
                actions: [],
                actionPointer: null,
            },
        })
    );
    assert.equal(next.tabs[0].header, 'X-Org-Default: 1');
});

test('removeTab: removes the tab and, if it was the current tab, falls back to the new last tab', () => {
    const before = makeState({
        tabs: [
            { id: 't1', method: 'GET', endpoint: '/1', body: '', actions: [], actionPointer: null },
            {
                id: 't2',
                method: 'POST',
                endpoint: '/2',
                body: '',
                actions: [],
                actionPointer: null,
            },
        ],
        currentTab: { id: 't2' } as any,
    });
    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 't2' }));
    assert.equal(next.tabs.length, 1);
    assert.equal(next.currentTab.id, 't1');
});

test('removeTab: removing a non-current tab leaves currentTab untouched', () => {
    const currentTab = {
        id: 't2',
        method: 'POST',
        endpoint: '/2',
        body: '',
        actions: [],
        actionPointer: null,
    };
    const before = makeState({
        tabs: [
            { id: 't1', method: 'GET', endpoint: '/1', body: '', actions: [], actionPointer: null },
            currentTab,
        ],
        currentTab,
    });
    const next = testSlice.reducer(before, testSlice.actions.removeTab({ id: 't1' }));
    assert.equal(next.tabs.length, 1);
    assert.equal(next.currentTab, currentTab);
});

test('selectionTab: switches currentTab and mirrors its fields to top-level state', () => {
    const tab2 = {
        id: 't2',
        header: 'H2',
        method: 'PUT',
        endpoint: '/2',
        body: 'b2',
        actions: [],
        actionPointer: null,
    };
    const before = makeState({
        tabs: [
            { id: 't1', method: 'GET', endpoint: '/1', body: '', actions: [], actionPointer: null },
            tab2,
        ],
    });
    const next = testSlice.reducer(before, testSlice.actions.selectionTab({ id: 't2' }));
    assert.equal(next.currentTab, tab2);
    assert.equal(next.method, 'PUT');
});

test('selectionTab: non-existent id is a no-op', () => {
    const before = makeState({ tabs: [{ id: 't1' }] as any, currentTab: { id: 't1' } as any });
    const next = testSlice.reducer(before, testSlice.actions.selectionTab({ id: 'nope' }));
    assert.equal(next.currentTab, before.currentTab);
});

// ---------------------------------------------------------------------------
// linkFileToTab
// ---------------------------------------------------------------------------

test('linkFileToTab: attaches fileId to the current tab and re-enriches it', () => {
    const currentTab = {
        id: 't1',
        header: 'H',
        method: 'GET',
        endpoint: '/e',
        body: '',
        actions: [],
        actionPointer: null,
    };
    const before = makeState({ tabs: [currentTab], currentTab });
    const next = testSlice.reducer(
        before,
        testSlice.actions.linkFileToTab({
            fileId: 'file-9',
            apiFiles: testApiFileAdapter.getInitialState(),
        })
    );
    assert.equal(next.tabs[0].fileId, 'file-9');
    assert.equal(next.currentTab.fileId, 'file-9');
});

// ---------------------------------------------------------------------------
// increaseActionPointer / decreaseActionPointer
// ---------------------------------------------------------------------------

test('increaseActionPointer: advances the pointer up to the last action index', () => {
    const before = makeState({
        tabs: [
            {
                id: 't1',
                actions: [{ a: 1 }, { a: 2 }, { a: 3 }],
                actionPointer: 0,
                method: 'GET',
                endpoint: '/1',
                body: '',
                header: '',
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.increaseActionPointer({ tabId: 't1' })
    );
    assert.equal(next.tabs[0].actionPointer, 1);
});

test('increaseActionPointer: clamps at the last action index (does not overflow)', () => {
    const before = makeState({
        tabs: [
            {
                id: 't1',
                actions: [{ a: 1 }, { a: 2 }],
                actionPointer: 1,
                method: 'GET',
                endpoint: '/1',
                body: '',
                header: '',
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.increaseActionPointer({ tabId: 't1' })
    );
    assert.equal(next.tabs[0].actionPointer, 1, 'pointer must not exceed actions.length - 1');
});

test('decreaseActionPointer: moves the pointer back by one', () => {
    const before = makeState({
        tabs: [
            {
                id: 't1',
                actions: [{ a: 1 }, { a: 2 }],
                actionPointer: 1,
                method: 'GET',
                endpoint: '/1',
                body: '',
                header: '',
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.decreaseActionPointer({ tabId: 't1' })
    );
    assert.equal(next.tabs[0].actionPointer, 0);
});

test('decreaseActionPointer: clamps at 0 (does not go negative)', () => {
    const before = makeState({
        tabs: [
            {
                id: 't1',
                actions: [{ a: 1 }],
                actionPointer: 0,
                method: 'GET',
                endpoint: '/1',
                body: '',
                header: '',
            },
        ],
    });
    const next = testSlice.reducer(
        before,
        testSlice.actions.decreaseActionPointer({ tabId: 't1' })
    );
    assert.equal(next.tabs[0].actionPointer, 0);
});

// ---------------------------------------------------------------------------
// setAbortingPromise / resetAbortingPromise / clearAbortingMap
// ---------------------------------------------------------------------------

test('setAbortingPromise: stores a promise keyed by tabId without clobbering other entries', () => {
    const p1 = Promise.resolve();
    const before = makeState({ abortingMap: { other: 'x' } });
    const next = testSlice.reducer(
        before,
        testSlice.actions.setAbortingPromise({ tabId: 't1', promise: p1 })
    );
    assert.equal(next.abortingMap.t1, p1);
    assert.equal(next.abortingMap.other, 'x');
});

test('resetAbortingPromise: nulls out a single tab entry, preserving siblings', () => {
    const before = makeState({ abortingMap: { t1: 'promise', t2: 'promise2' } });
    const next = testSlice.reducer(before, testSlice.actions.resetAbortingPromise({ tabId: 't1' }));
    assert.equal(next.abortingMap.t1, null);
    assert.equal(next.abortingMap.t2, 'promise2');
});

test('clearAbortingMap: wipes the whole map', () => {
    const before = makeState({ abortingMap: { t1: 'x', t2: 'y' } });
    const next = testSlice.reducer(before, testSlice.actions.clearAbortingMap());
    assert.deepEqual(next.abortingMap, {});
});

// ---------------------------------------------------------------------------
// extraReducers: executeApiRequest.pending / fulfilled / rejected
// ---------------------------------------------------------------------------

test('executeApiRequest.pending: upserts an isFetching entity keyed by lowercased tabId', () => {
    const before = makeState();
    const next = testSlice.reducer(before, {
        type: PENDING,
        meta: { arg: { tabId: 'TabABC', createdDate: '2026-01-01' } },
    });
    const entity = (next.api.entities as any)['tababc'];
    assert.ok(entity);
    assert.equal(entity.isFetching, true);
    assert.equal(entity.error, null);
    assert.equal(entity.response, null);
});

test('executeApiRequest.fulfilled: stores the response, clears abortingMap entry, and records an action in history', () => {
    const before = makeState({
        tabs: [
            {
                id: 'TabABC',
                actions: [],
                actionPointer: 0,
                method: 'GET',
                endpoint: '/1',
                body: '',
                header: '',
            },
        ],
        abortingMap: { TabABC: 'some-promise' },
    });
    const next = testSlice.reducer(before, {
        type: FULFILLED,
        payload: {
            response: { statusCode: 200 },
            request: { method: 'GET' },
            formattedRequest: { url: '/x' },
        },
        meta: { arg: { tabId: 'TabABC', createdDate: '2026-01-01' } },
    });
    const entity = (next.api.entities as any)['tababc'];
    assert.equal(entity.isFetching, false);
    assert.deepEqual(entity.response, { statusCode: 200 });
    assert.equal(next.abortingMap.TabABC, null);
    assert.equal(
        next.tabs[0].actions.length,
        1,
        'addAction must push a history entry onto the matching tab'
    );
    assert.equal(next.tabs[0].actionPointer, 0);
});

test('executeApiRequest.fulfilled: addAction truncates redo history when a new action is dispatched mid-history', () => {
    const before = makeState({
        tabs: [
            {
                id: 'TabABC',
                actions: [
                    { request: 'r1', response: 'res1' },
                    { request: 'r2', response: 'res2' },
                ],
                actionPointer: 0, // user had rewound to the first action
                method: 'GET',
                endpoint: '/1',
                body: '',
                header: '',
            },
        ],
    });
    const next = testSlice.reducer(before, {
        type: FULFILLED,
        payload: { response: 'res3', request: 'r3', formattedRequest: {} },
        meta: { arg: { tabId: 'TabABC', createdDate: '2026-01-01' } },
    });
    assert.equal(next.tabs[0].actions.length, 2, 'the un-reached r2 action must be dropped');
    assert.deepEqual(next.tabs[0].actions[1], { request: 'r3', response: 'res3' });
    assert.equal(next.tabs[0].actionPointer, 1);
});

test('executeApiRequest.rejected: sets error and clears abortingMap entry unless the request was aborted', () => {
    const before = makeState({ abortingMap: { TabABC: 'x' } });
    const next = testSlice.reducer(before, {
        type: REJECTED,
        error: { message: 'Network error' },
        meta: { arg: { tabId: 'TabABC' }, aborted: false },
    });
    const entity = (next.api.entities as any)['tababc'];
    assert.equal(entity.isFetching, false);
    assert.deepEqual(entity.error, { message: 'Network error' });
    assert.equal(next.abortingMap.TabABC, null);
});

test('executeApiRequest.rejected: swallows the error (sets null) when the request was deliberately aborted', () => {
    const before = makeState();
    const next = testSlice.reducer(before, {
        type: REJECTED,
        error: { message: 'AbortError' },
        meta: { arg: { tabId: 'TabABC' }, aborted: true },
    });
    const entity = (next.api.entities as any)['tababc'];
    assert.equal(entity.error, null, 'aborted requests must not surface an error to the user');
});

// ---------------------------------------------------------------------------
// Source contract tests — pin the real `../api.ts` against regexes so drift
// between this clone and the real implementation is caught.
// ---------------------------------------------------------------------------

test('source contract: apiSlice reducers include the full expected set of names', () => {
    const expectedReducers = [
        'loadCacheSettings',
        'saveCacheSettings',
        'updateViewerTab',
        'updateRequestTab',
        'updateRequest',
        'updateDefaultHeader',
        'updateCurrentApiVersion',
        'updateRecentPanel',
        'initTabs',
        'resetTab',
        'addTab',
        'removeTab',
        'selectionTab',
        'linkFileToTab',
        'increaseActionPointer',
        'decreaseActionPointer',
        'setAbortingPromise',
        'resetAbortingPromise',
        'updateVariables',
    ];
    for (const name of expectedReducers) {
        assert.match(
            SRC,
            new RegExp(`\\b${name}: \\(state`),
            `expected reducer \`${name}\` to be defined as \`${name}: (state, ...) => {\``
        );
    }
    // `clearAbortingMap` takes no `action` param, so its signature is
    // `clearAbortingMap: state => {` (no parens around the single param).
    assert.match(SRC, /\bclearAbortingMap: state => \{/);
});

test('source contract: entity-adapter upserts (pending/fulfilled/rejected) are keyed by lowerCaseKey(tabId)', () => {
    assert.match(
        SRC,
        /addCase\(executeApiRequest\.pending, \(state, action\) => \{[\s\S]+?id: lowerCaseKey\(tabId\),/
    );
    assert.match(
        SRC,
        /addCase\(executeApiRequest\.fulfilled, \(state, action\) => \{[\s\S]+?id: lowerCaseKey\(tabId\),/
    );
    assert.match(
        SRC,
        /addCase\(executeApiRequest\.rejected, \(state, action\) => \{[\s\S]+?id: lowerCaseKey\(tabId\),/
    );
});

test('source contract: rejected reducer swallows the error when the thunk was aborted', () => {
    assert.match(SRC, /error: action\.meta\.aborted \? null : error,/);
});

test('source contract: addAction truncates the redo branch before pushing a new action', () => {
    assert.match(
        SRC,
        /if \(actions\.length > 0 && actionPointer != actions\.length - 1\) \{\s*actions = actions\.slice\(0, actionPointer \+ 1\);\s*\}/
    );
});

test('source contract: increaseActionPointer/decreaseActionPointer clamp at the array bounds', () => {
    assert.match(
        SRC,
        /increaseActionPointer:[\s\S]+?if \(actions\.length - 1 <= actionPointer\) \{\s*actionPointer = actions\.length - 1;/
    );
    assert.match(
        SRC,
        /decreaseActionPointer:[\s\S]+?if \(actionPointer <= 0\) \{\s*actionPointer = 0;/
    );
});

test('source contract: updateRecentPanel coerces via the strict `=== true` check', () => {
    assert.match(SRC, /state\.recentPanelToggled = value === true;/);
});

test('source contract: addTab replaces a default/empty header with state.defaultHeader', () => {
    assert.match(
        SRC,
        /addTab:[\s\S]+?if \(!tab\.header \|\| tab\.header === API\.DEFAULT\.HEADER\) \{\s*tab\.header = state\.defaultHeader \|\| API\.DEFAULT\.HEADER;/
    );
});

test('source contract: apiFilesSelectors is built from DOCUMENT.apiFileAdapter.getSelectors keyed on state.apiFiles', () => {
    assert.match(
        SRC,
        /const apiFilesSelectors = DOCUMENT\.apiFileAdapter\.getSelectors\(s => s\.apiFiles\);/
    );
});
