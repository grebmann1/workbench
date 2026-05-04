import { createSlice } from '@reduxjs/toolkit';
import { guid, isNotUndefinedOrNull } from 'host-api/utils';

const SETTINGS_KEY = 'GRAPHQL_SETTINGS_KEY';
const RECENT_KEY = 'GRAPHQL_RECENT_KEY';
const MAX_RECENT = 20;

const INITIAL_BODY = `query {
    uiapi {
        query {
            Account(first: 5) {
                edges {
                    node {
                        Id
                        Name { value }
                    }
                }
            }
        }
    }
}`;

const INITIAL_VARIABLES = '{}';

function makeTab(overrides: Partial<Tab> = {}): Tab {
    return {
        id: guid(),
        body: INITIAL_BODY,
        variables: INITIAL_VARIABLES,
        name: null,
        ...overrides,
    };
}

const INITIAL_TABS: Tab[] = [makeTab()];

export interface Tab {
    id: string;
    body: string;
    variables: string;
    name: string | null;
}

export interface RecentEntry {
    body: string;
    variables: string;
    response?: { data?: unknown; errors?: unknown } | null;
    took?: number;
    savedAt: number;
}

function saveCacheSettings(alias: string, state: any) {
    try {
        localStorage.setItem(
            `${alias}-${SETTINGS_KEY}`,
            JSON.stringify({
                tabs: state.tabs,
                currentTabId: state.currentTab?.id,
                leftPanelToggled: state.leftPanelToggled,
                recentPanelToggled: state.recentPanelToggled,
                variablesExpanded: state.variablesExpanded,
            })
        );
    } catch (e) {
        console.error('Failed to save GraphQL config to localstorage', e);
    }
}

function loadCacheSettings(alias: string): any {
    try {
        const raw = localStorage.getItem(`${alias}-${SETTINGS_KEY}`);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to load GraphQL config from localstorage', e);
    }
    return null;
}

function loadRecent(alias: string): RecentEntry[] {
    try {
        const raw = localStorage.getItem(`${alias}-${RECENT_KEY}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed as RecentEntry[];
        }
    } catch (e) {
        console.error('Failed to load GraphQL recents', e);
    }
    return [];
}

function saveRecent(alias: string, entries: RecentEntry[]) {
    try {
        localStorage.setItem(`${alias}-${RECENT_KEY}`, JSON.stringify(entries));
    } catch (e) {
        console.error('Failed to save GraphQL recents', e);
    }
}

function persist(state: any) {
    if (isNotUndefinedOrNull(state._alias)) {
        saveCacheSettings(state._alias, state);
    }
}

function updateCurrentTab(state: any, attrs: Partial<Tab>) {
    const idx = state.tabs.findIndex((t: Tab) => t.id === state.currentTab?.id);
    if (idx > -1) {
        Object.assign(state.tabs[idx], attrs);
        state.currentTab = state.tabs[idx];
    }
}

const uiSlice = createSlice({
    name: 'graphqlUi',
    initialState: {
        tabs: INITIAL_TABS,
        currentTab: INITIAL_TABS[0],
        leftPanelToggled: false,
        recentPanelToggled: false,
        variablesExpanded: false,
        isInitialized: false,
        _alias: undefined as string | undefined,
        recent: [] as RecentEntry[],
    },
    reducers: {
        loadCacheSettings: (state, action) => {
            const { alias } = action.payload;
            state._alias = alias;
            state.recent = loadRecent(alias);
            const cached = loadCacheSettings(alias);
            if (cached && !state.isInitialized) {
                const restoredTabs: Tab[] =
                    Array.isArray(cached.tabs) && cached.tabs.length > 0
                        ? cached.tabs.map((t: Tab) => ({
                              id: t.id || guid(),
                              body: typeof t.body === 'string' ? t.body : INITIAL_BODY,
                              variables:
                                  typeof t.variables === 'string' ? t.variables : INITIAL_VARIABLES,
                              name: typeof t.name === 'string' ? t.name : null,
                          }))
                        : INITIAL_TABS;
                const restoredCurrent =
                    restoredTabs.find(t => t.id === cached.currentTabId) || restoredTabs[0];
                state.tabs = restoredTabs;
                state.currentTab = restoredCurrent;
                state.leftPanelToggled = !!cached.leftPanelToggled;
                state.recentPanelToggled = !!cached.recentPanelToggled;
                state.variablesExpanded = !!cached.variablesExpanded;
            }
            state.isInitialized = true;
        },
        toggleVariables: state => {
            state.variablesExpanded = !state.variablesExpanded;
            persist(state);
        },
        renameTab: (state, action) => {
            const { id, name } = action.payload || {};
            const idx = state.tabs.findIndex((t: Tab) => t.id === id);
            if (idx === -1) return;
            const trimmed = typeof name === 'string' ? name.trim() : '';
            state.tabs[idx].name = trimmed ? trimmed.slice(0, 48) : null;
            if (state.currentTab?.id === id) {
                state.currentTab = state.tabs[idx];
            }
            persist(state);
        },
        addTab: (state, action) => {
            const tab = makeTab(action.payload?.tab || {});
            state.tabs.push(tab);
            state.currentTab = tab;
            persist(state);
        },
        removeTab: (state, action) => {
            const { id } = action.payload;
            state.tabs = state.tabs.filter((t: Tab) => t.id !== id);
            if (state.tabs.length === 0) {
                const fresh = makeTab();
                state.tabs.push(fresh);
                state.currentTab = fresh;
            } else if (state.currentTab?.id === id) {
                state.currentTab = state.tabs[state.tabs.length - 1];
            }
            persist(state);
        },
        selectionTab: (state, action) => {
            const { id } = action.payload;
            const tab = state.tabs.find((t: Tab) => t.id === id);
            if (tab) {
                state.currentTab = tab;
                persist(state);
            }
        },
        updateBody: (state, action) => {
            const { body } = action.payload;
            updateCurrentTab(state, { body });
            persist(state);
        },
        updateVariables: (state, action) => {
            const { variables } = action.payload;
            updateCurrentTab(state, { variables });
            persist(state);
        },
        updateLeftPanel: (state, action) => {
            state.leftPanelToggled = action.payload?.value === true;
            persist(state);
        },
        updateRecentPanel: (state, action) => {
            state.recentPanelToggled = action.payload?.value === true;
            persist(state);
        },
        saveRecent: (state, action) => {
            const { body, variables, response, took } = action.payload || {};
            if (!body) return;
            const entry: RecentEntry = {
                body,
                variables: variables || '{}',
                response: response ?? null,
                took: typeof took === 'number' ? took : undefined,
                savedAt: Date.now(),
            };
            const next = [
                entry,
                ...state.recent.filter(r => r.body !== body).slice(0, MAX_RECENT - 1),
            ];
            state.recent = next;
            if (isNotUndefinedOrNull(state._alias)) {
                saveRecent(state._alias, next);
            }
        },
        clearRecent: state => {
            state.recent = [];
            if (isNotUndefinedOrNull(state._alias)) {
                saveRecent(state._alias, []);
            }
        },
    },
});

export const reduxSlice = uiSlice;
export { INITIAL_BODY, INITIAL_VARIABLES };
