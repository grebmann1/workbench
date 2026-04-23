import {
    getField,
    getFlattenedFields,
    composeQuery,
    parseQuery,
    isQueryValid,
} from '@jetstreamapp/soql-parser-js';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import * as DOCUMENT from './document';
import * as QUERY from './query';

const queryFilesSelectors = DOCUMENT.queryFileAdapter.getSelectors(s => s);
import { stripNamespace, isNotUndefinedOrNull, isEmpty, guid, lowerCaseKey } from 'shared/utils';
import type { ConnectorLike, ConnectionLike } from 'core/connector';

const SETTINGS_KEY = 'SETTINGS_KEY';

const INITIAL_QUERY = {
    fields: [getField('Id')],
    sObject: undefined,
};
const INITIAL_BODY = 'SELECT Id';
const INITIAL_TABS = [enrichTab({ id: guid(), body: INITIAL_BODY }, true)];

const QUERY_CONFIG = {
    fieldMaxLineLength: 100,
    fieldSubqueryParensOnOwnLine: false,
};

// Utility functions
function _getRawFieldName(fieldName, relationships) {
    if (relationships) {
        return `${relationships}.${fieldName}`;
    }
    return fieldName;
}

function _toggleField(query, fieldName, relationships) {
    fieldName = stripNamespace(fieldName);
    relationships = stripNamespace(relationships);
    const fieldNames = stripNamespace(getFlattenedFields(query));
    const rawFieldName = stripNamespace(_getRawFieldName(fieldName, relationships));
    if (fieldNames.includes(rawFieldName)) {
        return {
            ...query,
            fields: query.fields.filter(field => {
                const relationshipPath = field.relationships && field.relationships.join('.');
                return (
                    stripNamespace(_getRawFieldName(field.field, relationshipPath)) !== rawFieldName
                );
            }),
        };
    }
    if (relationships) {
        return {
            ...query,
            fields: [
                ...query.fields,
                getField({
                    field: fieldName,
                    relationships: relationships.split('.'),
                }),
            ],
        };
    }
    return {
        ...query,
        fields: [...query.fields, getField(fieldName)],
    };
}

function _toggleChildRelationshipField(state, fieldName, relationships, childRelationship) {
    fieldName = stripNamespace(fieldName);
    childRelationship = stripNamespace(childRelationship);
    const childField = state.fields.find(
        field =>
            field.subquery && stripNamespace(field.subquery.relationshipName) === childRelationship
    );
    if (!childField) {
        return {
            ...state,
            fields: [
                ...state.fields,
                getField({
                    subquery: {
                        fields: [getField(fieldName)],
                        relationshipName: childRelationship,
                    },
                }),
            ],
        };
    }
    relationships = stripNamespace(relationships);
    const newSubquery = _toggleField(childField.subquery, fieldName, relationships);
    const newFields = state.fields.map(field => {
        if (
            field.subquery &&
            stripNamespace(field.subquery.relationshipName) === childRelationship
        ) {
            return {
                ...field,
                subquery: newSubquery,
            };
        }
        return field;
    });
    return {
        ...state,
        fields: newFields,
    };
}

function saveCacheSettings(alias, state) {
    try {
        const {
            soql,
            leftPanelToggled,
            recentPanelToggled,
            tabs,
            includeDeletedRecords,
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
                currentTabId: currentTab?.id,
            })
        );
    } catch (e) {
        console.error('Failed to save CONFIG to localstorage', e);
    }
}

// Persist using the alias captured during loadCacheSettings.
// Use this for mutators that don't receive alias in their payload.
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

function toggleField(state = INITIAL_QUERY, action) {
    const { fieldName, relationships, childRelationship } = action.payload;
    if (childRelationship) {
        return _toggleChildRelationshipField(state, fieldName, relationships, childRelationship);
    }
    return _toggleField(state, fieldName, relationships);
}

function toggleRelationship(state = [], action) {
    const { relationshipName } = action.payload;
    const relationship = stripNamespace(relationshipName);
    const fieldNames = stripNamespace(getFlattenedFields(state));
    if (fieldNames.includes(relationship)) {
        return {
            ...state,
            fields: state.fields.filter(
                field =>
                    !field.subquery ||
                    stripNamespace(field.subquery.relationshipName) !== relationship
            ),
        };
    }
    const subquery = {
        fields: [getField('Id')],
        relationshipName: relationship,
    };
    return {
        ...state,
        fields: [...state.fields, getField({ subquery })],
    };
}

function selectAllFields(query = INITIAL_QUERY, action) {
    const { sObjectMeta } = action.payload;
    return {
        ...query,
        fields: sObjectMeta.fields.map(field => getField(stripNamespace(field.name))),
    };
}

function clearAllFields(query = INITIAL_QUERY) {
    return {
        ...query,
        fields: [getField('Id')],
    };
}

function updateCurrentTab(state, attributes) {
    const tabIndex = state.tabs.findIndex(x => x.id === state.currentTab.id);
    if (tabIndex > -1) {
        state.tabs[tabIndex].body = state.soql;
        // Derive from body, not from state.selectedSObject, which can hold a stale
        // value from the previously-active tab when the new body has no FROM clause.
        state.tabs[tabIndex].sobject = parseSObjectFromBody(state.soql);
        if (attributes) {
            // Extra Attributes
            Object.assign(state.tabs[tabIndex], attributes);
        }
        state.currentTab = state.tabs[tabIndex];
    }
}

// Extract the sObject name from a SOQL body using a permissive regex so we
// don't flicker while the user types a not-yet-valid query (e.g. trailing
// garbage after LIMIT). Picks the FROM at paren-depth 0 to skip nested
// subqueries like SELECT Id, (SELECT Id FROM Contacts) FROM Account.
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
    const { id, name, body, isDraft, fileId, fileBody, tableSearch, selectedRecordIds, sobject } =
        tab;
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
    };
}

function enrichTabs(tabs, queryFiles) {
    return tabs.map(tab => enrichTab(formatTab(tab), queryFiles));
}

function enrichTab(tab, queryFiles) {
    // queryFilesSelectors was built with `s => s`, so it expects the entity state directly.
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
        const query = isQueryValid(soql) ? parseQuery(soql) : state.query;
        state.selectedSObject = query ? query.sObject : undefined;
        state.query = query;
        state.soql = soql;
    }
}

// Pending inline edits state shape:
// pendingEdits[tabId][`${sobjectType}:${recordId}`] = {
//     sobjectType, recordId, tabId,
//     error?: { message, statusCode?, fieldErrors?: { [field]: string } },
//     changes: { [fieldName]: { field, oldValue, newValue } }
// }

function _editKey(sobjectType, recordId) {
    return `${sobjectType}:${recordId}`;
}

// Normalize a jsforce SaveResult failure into a shape the UI can render.
// SaveResult.errors[] items look like { statusCode, message, fields: [...] }.
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

// Normalize a thrown error (network, auth, server) into the same shape.
function _extractThrownError(err: any): { message: string; statusCode?: string } {
    const statusCode = err?.errorCode || err?.name;
    const message =
        err?.message ||
        (typeof err === 'string' ? err : null) ||
        'Update failed (no response from Salesforce)';
    return statusCode ? { message, statusCode } : { message };
}

// Batched inline-edit save. Groups pending edits by sObject type, dispatches
// a single jsforce `.update(batch)` per type, merges successful rows back into
// the query slice and leaves failed rows flagged on `pendingEdits`.
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
                describeState?.nameMap?.[lowerCaseKey(sobjectType)]?.useToolingApi === true;
            const conn: any = useToolingApi
                ? (connector.conn as any).tooling
                : (connector.conn as any);

            let results: any[] = [];
            try {
                const ret = await conn.sobject(sobjectType).update(entries.map(e => e.payload));
                results = Array.isArray(ret) ? ret : [ret];
            } catch (err: any) {
                // Batch-level failure (network, auth, invalid session). Apply the
                // same error to every record in the batch so the UI can flag them.
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

        // Merge successful values into the query response so the table updates.
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

// Create a slice with reducers and extraReducers
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
        isInitialized: false,
        _alias: undefined,
        // In-memory only (not persisted): pending inline edits per tab.
        pendingEdits: {} as Record<string, Record<string, any>>,
        pendingEditsSaving: false,
    },
    reducers: {
        loadCacheSettings: (state, action) => {
            const { alias, queryFiles } = action.payload;
            // Capture alias so mutators without payload.alias can still persist.
            state._alias = alias;
            const cachedConfig = loadCacheSettings(alias);
            if (cachedConfig && !state.isInitialized) {
                const {
                    leftPanelToggled,
                    recentPanelToggled,
                    tabs,
                    includeDeletedRecords,
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
            // Assign new tab
            state.currentTab = enrichedTab;
            state.currentFileId = enrichedTab.fileId;
            updateSOQL(state, enrichedTab.body || '');
            persist(state);
        },
        removeTab: (state, action) => {
            const { id, alias } = action.payload;
            state.tabs = state.tabs.filter(x => x.id != id);
            // Drop any pending inline edits associated with the removed tab.
            if (id && state.pendingEdits[id]) {
                delete state.pendingEdits[id];
            }
            // Assign last tab
            if (state.tabs.length > 0 && state.currentTab.id == id) {
                const lastTab = state.tabs[state.tabs.length - 1];
                state.currentTab = lastTab;
                updateSOQL(state, lastTab.body);
            }
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
            // can't remove the last one !!!
        },
        selectionTab: (state, action) => {
            const { id } = action.payload;
            const tab = state.tabs.find(x => x.id == id);
            // Assign new tab
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
        updateApiLimit: (state, action: { payload: { connector: ConnectorLike } }) => {
            const { limitInfo } = action.payload?.connector;
            state.apiUsage = limitInfo ? limitInfo.apiUsage : undefined;
        },
        selectSObject: (state, action) => {
            const { sObjectName } = action.payload;
            const query = {
                ...INITIAL_QUERY,
                sObject: stripNamespace(sObjectName),
            };
            state.selectedSObject = sObjectName;
            state.query = query;
            state.soql = composeQuery(query, { format: true, formatOptions: QUERY_CONFIG });
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
            const query = toggleField(state.query, action);
            state.query = query;
            state.soql = composeQuery(query, { format: true, formatOptions: QUERY_CONFIG });
            updateCurrentTab(state);
            persist(state);
        },
        toggleRelationship: (state, action) => {
            const query = toggleRelationship(state.query, action);
            state.query = query;
            state.soql = composeQuery(query, { format: true, formatOptions: QUERY_CONFIG });
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
            const query = selectAllFields(state.query, action);
            state.query = query;
            state.soql = composeQuery(query, { format: true, formatOptions: QUERY_CONFIG });
        },
        clearAllFields: state => {
            const query = clearAllFields(state.query);
            state.query = query;
            state.soql = composeQuery(query, { format: true, formatOptions: QUERY_CONFIG });
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
        /** Inline editing - pending edits (not persisted) */
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
            // If the new value matches the original oldValue, drop the change.
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
            // Clear any prior save error the user is now retrying. Drop the
            // per-field error first; drop the entry-level error once no
            // per-field errors remain, so the red border disappears on re-edit.
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
                // Remove successful entries; annotate failed entries with error.
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
                // A fresh successful query result supersedes any in-flight edits.
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

/* Test */

// Export actions
export const SORT = { ORDER: { ASC: 'ASC', DESC: 'DESC' } };
export const reduxSlice = uiSlice;
