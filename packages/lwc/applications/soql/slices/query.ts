import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import { getStore } from 'core/store/storeRef';
import type { ConnectorLike } from 'host-api/connector';
import { ERROR, DOCUMENT } from 'host-api/store';
import { lowerCaseKey } from 'host-api/utils';

import { mergeQueryPage } from './queryPagination';
import { stripSoqlComments } from './stripSoqlComments';

export const queryAdapter = createEntityAdapter<any>();

// Thunks using createAsyncThunk
export const executeQuery = createAsyncThunk(
    'queries/executeQuery',
    async (
        {
            connector,
            soql,
            rawSoql,
            tabId,
            createdDate,
            useToolingApi,
            includeDeletedRecords,
        }: {
            connector: ConnectorLike;
            soql: string;
            rawSoql?: string;
            tabId: string;
            createdDate: string | number | Date;
            useToolingApi?: boolean;
            includeDeletedRecords?: boolean;
        },
        { dispatch }
    ) => {
        try {
            // Strip full-line `#` / `--` comments just before the wire; the raw
            // text (with comments) is what we persist to history below.
            const executableSoql = stripSoqlComments(soql);
            const _conn = useToolingApi ? connector.conn.tooling : connector.conn;
            const res = await _conn.query(executableSoql).scanAll(includeDeletedRecords || false);
            dispatch(
                DOCUMENT.reduxSlices.RECENT.actions.saveQuery({
                    soql: rawSoql ?? soql,
                    alias: connector.configuration.alias,
                    data: res,
                })
            );
            return { data: res, soql, alias: connector.configuration.alias, tabId };
        } catch (err) {
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: 'Error executing query',
                    details: err.message,
                })
            );
            throw err;
        }
    }
);

export const executeQueryIncognito = createAsyncThunk(
    'queries/executeQueryIncognito',
    async (
        {
            connector,
            soql,
            tabId,
            useToolingApi,
            includeDeletedRecords,
        }: {
            connector: ConnectorLike;
            soql: string;
            tabId: string;
            useToolingApi?: boolean;
            includeDeletedRecords?: boolean;
        },
        { dispatch }
    ) => {
        try {
            const executableSoql = stripSoqlComments(soql);
            const _conn = useToolingApi ? connector.conn.tooling : connector.conn;
            const res = await _conn.query(executableSoql).scanAll(includeDeletedRecords || false);
            return { data: res, soql };
        } catch (err) {
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: 'Error executing query',
                    details: err.message,
                })
            );
            throw err;
        }
    }
);

/**
 * Fetch additional records for an already-executed query via Salesforce
 * `queryMore` (the `nextRecordsUrl` cursor jsforce returns on the first page).
 *
 * The merged result is written back to the store on every page through the
 * `loadMorePage` action, so the table grows reactively as pages arrive. With
 * `loadAll: true` it walks the cursor to the end (a single SOQL run can return
 * far more than the initial 2,000 records); otherwise it fetches one page.
 */
export const loadMoreRecords = createAsyncThunk(
    'queries/loadMoreRecords',
    async (
        {
            connector,
            tabId,
            loadAll,
        }: {
            connector: ConnectorLike;
            tabId: string;
            loadAll?: boolean;
        },
        { dispatch, getState, signal }
    ) => {
        const conn = connector.conn;
        let cursor: string | null | undefined = querySelectors.selectById(
            getState() as any,
            lowerCaseKey(tabId)
        )?.data?.nextRecordsUrl;

        try {
            while (cursor) {
                if (signal.aborted) break;
                const page: any = await conn.request({ method: 'GET', url: cursor });
                dispatch(queriesSlice.actions.loadMorePage({ tabId, page }));
                cursor = page?.nextRecordsUrl ?? null;
                if (!loadAll) break;
            }
            return { tabId };
        } catch (err) {
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: 'Error loading more records',
                    details: err.message,
                })
            );
            throw err;
        }
    }
);

export const explainQuery = createAsyncThunk(
    'queries/explainQuery',
    async (
        {
            connector,
            soql,
            tabId,
            useToolingApi,
        }: { connector: ConnectorLike; soql: string; tabId: string; useToolingApi?: boolean },
        { dispatch }
    ) => {
        try {
            const executableSoql = stripSoqlComments(soql);
            const _conn = useToolingApi ? connector.conn.tooling : connector.conn;
            const query = _conn.query(executableSoql);
            const res = await query.explain();
            return { data: res, soql, alias: connector.configuration.alias, tabId };
        } catch (err) {
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: 'Error executing explainQuery',
                    details: err.message,
                })
            );
            throw err;
        }
    }
);

const queriesSlice = createSlice({
    name: 'queries',
    initialState: queryAdapter.getInitialState(),
    reducers: {
        deleteRecords: (state, action) => {
            const { tabId, deletedRecordIds } = action.payload;

            const existingRecord = queryAdapter
                .getSelectors()
                .selectById(state, lowerCaseKey(tabId));
            if (existingRecord && existingRecord.data) {
                const updatedRecords = existingRecord.data.records.filter(
                    x => !deletedRecordIds.includes(x.Id)
                );

                queryAdapter.upsertOne(state, {
                    ...existingRecord,
                    data: {
                        ...existingRecord.data,
                        totalSize: existingRecord.data.totalSize - deletedRecordIds.length || 0,
                        records: updatedRecords,
                    },
                });
            }
        },
        mergeRecordUpdates: (state, action) => {
            // Merges successful inline-edit values into the query result records
            // so the table reflects the persisted value without a re-query.
            const { tabId, updates } = action.payload || {};
            if (!tabId || !Array.isArray(updates) || updates.length === 0) return;

            const existingRecord = queryAdapter
                .getSelectors()
                .selectById(state, lowerCaseKey(tabId));
            if (!existingRecord?.data?.records) return;

            const byId = new Map(
                updates.filter(u => u && u.recordId).map(u => [String(u.recordId), u.changes || {}])
            );
            const updatedRecords = existingRecord.data.records.map(record => {
                const changes = byId.get(String(record?.Id));
                return changes ? { ...record, ...changes } : record;
            });
            queryAdapter.upsertOne(state, {
                ...existingRecord,
                data: {
                    ...existingRecord.data,
                    records: updatedRecords,
                },
            });
        },
        loadMorePage: (state, action) => {
            // Append a fetched `queryMore` page to the tab's current result set.
            const { tabId, page } = action.payload;
            const existingRecord = queryAdapter
                .getSelectors()
                .selectById(state, lowerCaseKey(tabId));
            if (!existingRecord?.data) return;
            queryAdapter.upsertOne(state, {
                ...existingRecord,
                data: mergeQueryPage(existingRecord.data, page),
            });
        },
        clearQueryError: (state, action) => {
            const { tabId } = action.payload;
            queryAdapter.upsertOne(state, {
                id: lowerCaseKey(tabId),
                error: null,
            });
        },
    },
    extraReducers: builder => {
        builder
            .addCase(executeQuery.pending, (state, action) => {
                const { tabId, createdDate } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    data: null,
                    createdDate,
                    isFetching: true,
                    error: null,
                });
            })
            .addCase(executeQuery.fulfilled, (state, action) => {
                const { data, soql } = action.payload;
                const { tabId, sobjectName, createdDate } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    data,
                    soql,
                    isFetching: false,
                    createdDate,
                    sobjectName,
                    error: null,
                });
            })
            .addCase(executeQuery.rejected, (state, action) => {
                const { error } = action;
                const { tabId } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetching: false,
                    error,
                });
            })
            .addCase(loadMoreRecords.pending, (state, action) => {
                const { tabId } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetchingMore: true,
                });
            })
            .addCase(loadMoreRecords.fulfilled, (state, action) => {
                const { tabId } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetchingMore: false,
                });
            })
            .addCase(loadMoreRecords.rejected, (state, action) => {
                const { tabId } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetchingMore: false,
                });
            })
            .addCase(explainQuery.pending, (state, action) => {
                const { tabId } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetching: true,
                    error: null,
                });
            })
            .addCase(explainQuery.fulfilled, (state, action) => {
                const { tabId } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetching: false,
                    error: null,
                });
            })
            .addCase(explainQuery.rejected, (state, action) => {
                const { error } = action;
                const { tabId } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetching: false,
                    error,
                });
            });
    },
});

export const reduxSlice = queriesSlice;
export const querySelectors = queryAdapter.getSelectors((state: any) => state.query);
