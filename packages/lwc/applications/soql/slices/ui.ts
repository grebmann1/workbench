import { composeQuery, parseQuery, isQueryValid } from '@jetstreamapp/soql-parser-js';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ConnectorLike, ConnectionLike } from 'host-api/connector';
import { DOCUMENT } from 'host-api/store';
import { isNotUndefinedOrNull, isEmpty, guid, lowerCaseKey } from 'host-api/utils';
import { getDescribeByName } from '../describeResolver';
import {
    INITIAL_QUERY,
    clearAllFields,
    selectAllFields,
    selectSObject,
    toggleField,
    toggleRelationship,
} from './queryFieldSelection';

import * as QUERY from './query';
import { stripSoqlComments } from './stripSoqlComments';

const queryFilesSelectors = DOCUMENT.queryFileAdapter.getSelectors(s => s);

const SETTINGS_KEY = 'SETTINGS_KEY';

const INITIAL_BODY = 'SELECT Id';
const INITIAL_TABS = [enrichTab({ id: guid(), body: INITIAL_BODY }, true)];

const QUERY_CONFIG = {
    fieldMaxLineLength: 100,
    fieldSubqueryParensOnOwnLine: false,
};

function saveCacheSettings(alias, state) {
    try {
        const {
            soql,
            leftPanelToggled,
            recentPanelToggled,
            tabs,
            includeDeletedRecords,
            alwaysShowTooling,
            currentTab,
        } = state;
        localStorage.setItem(
            `${alias}-${SETTINGS_KEY}`,
            JSON.stringify({
                soql,
                leftPanelToggled,
                recentPanelToggled,
                tabs,
                includeDeletedRecords,
                alwaysShowTooling,
                currentTabId: currentTab?.id,
            })
        );
    } catch (e) {
        console.error('Failed to save CONFIG to localstorage', e);
    }
}

function persist(state) {
    if (isNotUndefinedOrNull(state._alias)) {
        saveCacheSettings(state._alias, state);
    }
}

function loadCacheSettings(alias) {
    try {
        const configText = localStorage.getItem(`${alias}-${SETTINGS_KEY}`);
        if (configText) return JSON.parse(configText);
    } catch (e) {
        console.error('Failed to load CONFIG from localStorage', e);
    }
    return null;
}

function updateCurrentTab(state, attributes) {
    const tabIndex = state.tabs.findIndex(x => x.id === state.currentTab.id);
    if (tabIndex > -1) {
        state.tabs[tabIndex].body = state.soql;
        state.tabs[tabIndex].sobject = parseSObjectFromBody(state.soql);
        if (attributes) {
            Object.assign(state.tabs[tabIndex], attributes);
        }
        state.currentTab = state.tabs[tabIndex];
    }
}

const FROM_CLAUSE_RE = /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
function parseSObjectFromBody(body) {
    if (!body || typeof body !== 'string') return undefined;
    const re = new RegExp(FROM_CLAUSE_RE);
    let depth = 0;
    let scanned = 0;
    let match;
    while ((match = re.exec(body)) !== null) {
        for (let i = scanned; i < match.index; i++) {
            const c = body[i];
            if (c === '(') depth++;
            else if (c === ')') depth--;
        }
        scanned = match.index + match[0].length;
        if (depth === 0) return match[1];
    }
    return undefined;
}

function formatTab(tab) {
    const {
        id,
        name,
        body,
        isDraft,
        fileId,
        fileBody,
        tableSearch,
        selectedRecordIds,
        sobject,
        useToolingApi,
    } = tab;
    return {
        id,
        name,
        body,
        isDraft,
        fileId,
        fileBody,
        tableSearch: tableSearch || '',
        selectedRecordIds: Array.isArray(selectedRecordIds) ? selectedRecordIds : [],
        sobject: sobject || parseSObjectFromBody(body),
        useToolingApi: useToolingApi === true,
    };
}

function enrichTabs(tabs, queryFiles) {
    return tabs.map(tab => enrichTab(formatTab(tab), queryFiles));
}

function enrichTab(tab, queryFiles) {
    const hasEntityState = queryFiles && typeof queryFiles === 'object' && queryFiles.entities;
    const file =
        tab.fileId && hasEntityState
            ? queryFilesSelectors.selectById(queryFiles, lowerCaseKey(tab.fileId))
            : null;
    const fileBody = file?.content || tab.fileBody;
    return {
        ...tab,
        fileBody: fileBody,
        isDraft: fileBody != tab.body && isNotUndefinedOrNull(tab.fileId),
    };
}

function updateSOQL(state, soql) {
    if (!soql.trim()) {
        state.selectedSObject = undefined;
        state.query = undefined;
        state.soql = soql;
    } else {
        const soqlForParser = stripSoqlComments(soql);
        const q = isQueryValid(soqlForParser) ? parseQuery(soqlForParser) : state.query;
        state.selectedSObject = q ? q.sObject : undefined;
        state.query = q;
        state.soql = soql;
    }
}

function _editKey(sobjectType, recordId) {
    return `${sobjectType}:${recordId}`;
}

function _extractSaveResultError(
    res: any
): { message: string; statusCode?: string; fieldErrors?: Record<string, string> } | null {
    if (!res || res.success) return null;
    const raw = Array.isArray(res.errors) ? res.errors : res.errors ? [res.errors] : [];
    if (raw.length === 0) {
        return { message: 'Salesforce rejected the update' };
    }
    const first = raw[0] || {};
    const message =
        first.message ||
        first.content ||
        (typeof first === 'string' ? first : 'Salesforce rejected the update');
    const statusCode = first.statusCode || first.errorCode;
    const fieldErrors: Record<string, string> = {};
    raw.forEach(e => {
        const msg = e?.message || e?.content;
        if (!msg) return;
        const fields: string[] = Array.isArray(e?.fields) ? e.fields : [];
        fields.forEach(f => {
            if (f && !fieldErrors[f]) fieldErrors[f] = msg;
        });
    });
    const out: { message: string; statusCode?: string; fieldErrors?: Record<string, string> } = {
        message,
    };
    if (statusCode) out.statusCode = statusCode;
    if (Object.keys(fieldErrors).length > 0) out.fieldErrors = fieldErrors;
    return out;
}

function _extractThrownError(err: any): { message: string; statusCode?: string } {
    const statusCode = err?.errorCode || err?.name;
    const message =
        err?.message ||
        (typeof err === 'string' ? err : null) ||
        'Update failed (no response from Salesforce)';
    return statusCode ? { message, statusCode } : { message };
}

export const saveAllPendingEdits = createAsyncThunk(
    'ui/saveAllPendingEdits',
    async (
        { connector, tabId }: { connector: { conn: ConnectionLike }; tabId: string },
        { getState, dispatch }
    ) => {
        const state: any = getState();
        const tabEdits = state.ui.pendingEdits?.[tabId] || {};
        const describeState = state.describe || {};

        const byType: Record<string, Array<{ key: string; recordId: string; payload: any }>> = {};
        for (const key of Object.keys(tabEdits)) {
            const entry = tabEdits[key];
            if (!entry || !entry.recordId || !entry.sobjectType) continue;
            const fieldUpdates: Record<string, any> = {};
            for (const fieldName of Object.keys(entry.changes || {})) {
                fieldUpdates[fieldName] = entry.changes[fieldName]?.newValue ?? null;
            }
            if (Object.keys(fieldUpdates).length === 0) continue;
            const bucket = byType[entry.sobjectType] || (byType[entry.sobjectType] = []);
            bucket.push({
                key,
                recordId: entry.recordId,
                payload: { Id: entry.recordId, ...fieldUpdates },
            });
        }

        const successByKey: Record<string, { recordId: string; changes: Record<string, any> }> = {};
        const errorByKey: Record<
            string,
            { message: string; statusCode?: string; fieldErrors?: Record<string, string> }
        > = {};

        for (const sobjectType of Object.keys(byType)) {
            const entries = byType[sobjectType];
            const useToolingApi =
                getDescribeByName({
                    describeState,
                    sobjectName: sobjectType,
                    useToolingApi: state?.ui?.currentTab?.useToolingApi === true,
                })?.useToolingApi === true;
            const conn: any = useToolingApi
                ? (connector.conn as any).tooling
                : (connector.conn as any);

            let results: any[] = [];
            try {
                const ret = await conn.sobject(sobjectType).update(entries.map(e => e.payload));
                results = Array.isArray(ret) ? ret : [ret];
            } catch (err: any) {
                const normalized = _extractThrownError(err);
                for (const e of entries) errorByKey[e.key] = normalized;
                continue;
            }

            entries.forEach((e, idx) => {
                const res = results[idx];
                if (res && res.success) {
                    const changes: Record<string, any> = {};
                    Object.entries(e.payload).forEach(([k, v]) => {
                        if (k !== 'Id') changes[k] = v;
                    });
                    successByKey[e.key] = { recordId: e.recordId, changes };
                } else {
                    errorByKey[e.key] = _extractSaveResultError(res) || {
                        message: 'Salesforce rejected the update',
                    };
                }
            });
        }

        const successUpdates = Object.values(successByKey);
        if (successUpdates.length > 0) {
            dispatch(
                QUERY.reduxSlice.actions.mergeRecordUpdates({
                    tabId,
                    updates: successUpdates,
                })
            );
        }

        return { tabId, successByKey, errorByKey };
    }
);

const uiSlice = createSlice({
    name: 'ui',
    initialState: {
        apiUsage: undefined,
        recentQueries: [],
        tabs: INITIAL_TABS,
        currentTab: INITIAL_TABS[0],
        selectedSObject: undefined,
        query: INITIAL_QUERY,
        soql: '',
        childRelationship: undefined,
        sort: undefined,
        leftPanelToggled: false,
        recentPanelToggled: false,
        includeDeletedRecords: false,
        alwaysShowTooling: false,
        isInitialized: false,
        _alias: undefined,
        pendingEdits: {} as Record<string, Record<string, any>>,
        pendingEditsSaving: false,
    },
    reducers: {
        loadCacheSettings: (state, action) => {
            const { alias, queryFiles } = action.payload;
            state._alias = alias;
            const cachedConfig = loadCacheSettings(alias);
            if (cachedConfig && !state.isInitialized) {
                const {
                    leftPanelToggled,
                    recentPanelToggled,
                    tabs,
                    includeDeletedRecords,
                    alwaysShowTooling,
                    currentTabId,
                } = cachedConfig;
                const restoredTabs =
                    Array.isArray(tabs) && tabs.length > 0
                        ? enrichTabs(tabs, queryFiles)
                        : enrichTabs(INITIAL_TABS, queryFiles);
                const restoredCurrent =
                    restoredTabs.find(t => t.id === currentTabId) || restoredTabs[0];
                Object.assign(state, {
                    leftPanelToggled,
                    recentPanelToggled,
                    tabs: restoredTabs,
                    currentTab: restoredCurrent,
                    includeDeletedRecords,
                    alwaysShowTooling: alwaysShowTooling === true,
                });
                updateSOQL(state, restoredCurrent?.body || '');
            }
            state.isInitialized = true;
        },
        saveCacheSettings: (state, action) => {
            const { alias } = action.payload;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        clearTabs: (state, action) => {
            const { alias } = action.payload;
            state.tabs = enrichTabs(INITIAL_TABS);
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        addTab: (state, action) => {
            const { queryFiles, tab } = action.payload;
            const enrichedTab = enrichTab(formatTab(tab), queryFiles);
            if (isEmpty(enrichedTab.body)) {
                enrichedTab.body = INITIAL_BODY;
            }
            state.tabs.push(enrichedTab);
            state.currentTab = enrichedTab;
            state.currentFileId = enrichedTab.fileId;
            updateSOQL(state, enrichedTab.body || '');
            persist(state);
        },
        removeTab: (state, action) => {
            const { id, alias } = action.payload;
            state.tabs = state.tabs.filter(x => x.id != id);
            if (id && state.pendingEdits[id]) {
                delete state.pendingEdits[id];
            }
            if (state.tabs.length > 0 && state.currentTab.id == id) {
                const lastTab = state.tabs[state.tabs.length - 1];
                state.currentTab = lastTab;
                updateSOQL(state, lastTab.body);
            }
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        selectionTab: (state, action) => {
            const { id } = action.payload;
            const tab = state.tabs.find(x => x.id == id);
            if (tab) {
                state.currentTab = tab;
                updateSOQL(state, tab.body);
                persist(state);
            }
        },
        linkFileToTab: (state, action) => {
            const { fileId, alias, queryFiles } = action.payload;
            const currentTabIndex = state.tabs.findIndex(x => x.id == state.currentTab.id);
            if (currentTabIndex > -1) {
                const enrichedTab = enrichTab(
                    formatTab({ ...state.tabs[currentTabIndex], fileId }),
                    queryFiles
                );
                state.tabs[currentTabIndex] = enrichedTab;
                state.currentTab = enrichedTab;
                if (isNotUndefinedOrNull(alias)) {
                    saveCacheSettings(alias, state);
                }
            }
        },
        updateLeftPanel: (state, action) => {
            const { value, alias } = action.payload;
            state.leftPanelToggled = value === true;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        updateRecentPanel: (state, action) => {
            const { value, alias } = action.payload;
            state.recentPanelToggled = value === true;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        updateIncludeDeletedRecords: (state, action) => {
            const { value, alias } = action.payload;
            state.includeDeletedRecords = value === true;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        updateAlwaysShowTooling: (state, action) => {
            const { value, alias } = action.payload;
            state.alwaysShowTooling = value === true;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        updateUseToolingApi: (state, action) => {
            const { value, alias } = action.payload;
            const tabIndex = state.tabs.findIndex(x => x.id === state.currentTab.id);
            if (tabIndex > -1) {
                state.tabs[tabIndex].useToolingApi = value === true;
                state.currentTab = state.tabs[tabIndex];
            }
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        updateApiLimit: (state, action: { payload: { connector: ConnectorLike } }) => {
            const { limitInfo } = action.payload?.connector;
            state.apiUsage = limitInfo ? limitInfo.apiUsage : undefined;
        },
        selectSObject: (state, action) => {
            const { sObjectName } = action.payload;
            const q = selectSObject(sObjectName);
            state.selectedSObject = sObjectName;
            state.query = q;
            state.soql = composeQuery(q, { format: true, formatOptions: QUERY_CONFIG });
            updateCurrentTab(state);
            persist(state);
        },
        deselectSObject: state => {
            state.selectedSObject = undefined;
            state.sort = undefined;
            updateCurrentTab(state);
            persist(state);
        },
        toggleField: (state, action) => {
            const q = toggleField(state.query, action);
            state.query = q;
            state.soql = composeQuery(q, { format: true, formatOptions: QUERY_CONFIG });
            updateCurrentTab(state);
            persist(state);
        },
        toggleRelationship: (state, action) => {
            const q = toggleRelationship(state.query, action);
            state.query = q;
            state.soql = composeQuery(q, { format: true, formatOptions: QUERY_CONFIG });
            updateCurrentTab(state);
            persist(state);
        },
        updateSoql: (state, action) => {
            const { soql, isDraft } = action.payload;
            updateSOQL(state, soql);
            updateCurrentTab(state, { isDraft });
            persist(state);
        },
        formatSoql: state => {
            state.soql = composeQuery(state.query, { format: true, formatOptions: QUERY_CONFIG });
            updateCurrentTab(state);
            persist(state);
        },
        selectChildRelationship: (state, action) => {
            const childRelationship = action.payload.childRelationship;
            updateCurrentTab(state, { childRelationship });
            persist(state);
        },
        deselectChildRelationship: state => {
            const childRelationship = undefined;
            updateCurrentTab(state, { childRelationship });
            persist(state);
        },
        selectAllFields: (state, action) => {
            const q = selectAllFields(state.query, action);
            state.query = q;
            state.soql = composeQuery(q, { format: true, formatOptions: QUERY_CONFIG });
        },
        clearAllFields: state => {
            const q = clearAllFields(state.query);
            state.query = q;
            state.soql = composeQuery(q, { format: true, formatOptions: QUERY_CONFIG });
            updateCurrentTab(state);
            persist(state);
        },
        sortFields: (state, action) => {
            state.sort = action.payload.sort;
        },
        updateTabTableSearch: (state, action) => {
            const { value } = action.payload;
            const tabIndex = state.tabs.findIndex(x => x.id === state.currentTab.id);
            if (tabIndex > -1) {
                state.tabs[tabIndex].tableSearch = value;
                state.currentTab = state.tabs[tabIndex];
                persist(state);
            }
        },
        updateTabSelection: (state, action) => {
            const { selectedRecordIds } = action.payload;
            const tabIndex = state.tabs.findIndex(x => x.id === state.currentTab.id);
            if (tabIndex > -1) {
                state.tabs[tabIndex].selectedRecordIds = Array.isArray(selectedRecordIds)
                    ? selectedRecordIds
                    : [];
                state.currentTab = state.tabs[tabIndex];
                persist(state);
            }
        },
        setCellEdit: (state, action) => {
            const { tabId, sobjectType, recordId, field, oldValue, newValue } =
                action.payload || {};
            if (!tabId || !sobjectType || !recordId || !field) return;
            const tabBucket = state.pendingEdits[tabId] || (state.pendingEdits[tabId] = {});
            const key = _editKey(sobjectType, recordId);
            const entry =
                tabBucket[key] ||
                (tabBucket[key] = {
                    sobjectType,
                    recordId,
                    tabId,
                    changes: {},
                });
            const existing = entry.changes[field];
            const originalOldValue = existing ? existing.oldValue : oldValue;
            if (_valuesEqual(originalOldValue, newValue)) {
                delete entry.changes[field];
            } else {
                entry.changes[field] = {
                    field,
                    oldValue: originalOldValue,
                    newValue,
                };
            }
            if (entry.error) {
                if (entry.error.fieldErrors && entry.error.fieldErrors[field]) {
                    delete entry.error.fieldErrors[field];
                    if (Object.keys(entry.error.fieldErrors).length === 0) {
                        delete entry.error;
                    }
                } else {
                    delete entry.error;
                }
            }
            if (Object.keys(entry.changes).length === 0) {
                delete tabBucket[key];
            }
            if (Object.keys(tabBucket).length === 0) {
                delete state.pendingEdits[tabId];
            }
        },
        clearCellEdit: (state, action) => {
            const { tabId, sobjectType, recordId, field } = action.payload || {};
            const tabBucket = state.pendingEdits[tabId];
            if (!tabBucket) return;
            const key = _editKey(sobjectType, recordId);
            const entry = tabBucket[key];
            if (!entry) return;
            delete entry.changes[field];
            if (Object.keys(entry.changes).length === 0) {
                delete tabBucket[key];
            }
            if (Object.keys(tabBucket).length === 0) {
                delete state.pendingEdits[tabId];
            }
        },
        clearAllEdits: state => {
            state.pendingEdits = {};
        },
        clearEditsForTab: (state, action) => {
            const { tabId } = action.payload || {};
            if (tabId && state.pendingEdits[tabId]) {
                delete state.pendingEdits[tabId];
            }
        },
        clearEditsForRecord: (state, action) => {
            const { tabId, sobjectType, recordId } = action.payload || {};
            if (!tabId || !sobjectType || !recordId) return;
            const tabBucket = state.pendingEdits[tabId];
            if (!tabBucket) return;
            delete tabBucket[_editKey(sobjectType, recordId)];
            if (Object.keys(tabBucket).length === 0) {
                delete state.pendingEdits[tabId];
            }
        },
    },
    extraReducers: builder => {
        builder
            .addCase(saveAllPendingEdits.pending, state => {
                state.pendingEditsSaving = true;
            })
            .addCase(saveAllPendingEdits.fulfilled, (state, action) => {
                state.pendingEditsSaving = false;
                const { tabId, successByKey, errorByKey } = action.payload || ({} as any);
                const tabBucket = state.pendingEdits[tabId];
                if (!tabBucket) return;
                Object.keys(successByKey || {}).forEach(key => {
                    delete tabBucket[key];
                });
                Object.entries(errorByKey || {}).forEach(([key, errorInfo]) => {
                    if (tabBucket[key]) {
                        tabBucket[key].error = errorInfo;
                    }
                });
                if (Object.keys(tabBucket).length === 0) {
                    delete state.pendingEdits[tabId];
                }
            })
            .addCase(saveAllPendingEdits.rejected, state => {
                state.pendingEditsSaving = false;
            })
            .addCase(QUERY.executeQuery.fulfilled, (state, action) => {
                const tabId = action.meta?.arg?.tabId;
                if (tabId && state.pendingEdits[tabId]) {
                    delete state.pendingEdits[tabId];
                }
            });
    },
});

function _valuesEqual(a, b) {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!_valuesEqual(a[i], b[i])) return false;
        }
        return true;
    }
    return String(a) === String(b);
}

export const SORT = { ORDER: { ASC: 'ASC', DESC: 'DESC' } };
export const reduxSlice = uiSlice;
