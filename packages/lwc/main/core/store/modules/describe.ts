import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import type { ConnectionLike } from 'core/connector';
import { cacheManager, CACHE_ORG_DATA_TYPES } from 'shared/cacheManager';
import LOGGER from 'shared/logger';
import { lowerCaseKey, arrayToMap, isUndefinedOrNull } from 'shared/utils';

import { getStore } from '../storeRef';

import * as ERROR from './error';

const DESCRIBE_ID = {
    TOOLING: 'TOOLING',
    STANDARD: 'STANDARD',
};

const DESCRIBE_SOURCE = {
    TOOLING: 'tooling',
    STANDARD: 'standard',
} as const;

type DescribeEntry = Record<string, unknown> & {
    useToolingApi: boolean;
    source: string;
    sourceScopedId: string;
};

const buildDescribeEntriesMap = (
    items: Array<Record<string, unknown>> = [],
    idField: string,
    baseAttributes: { useToolingApi: boolean; source: string }
): Record<string, DescribeEntry[]> => {
    return items.reduce<Record<string, DescribeEntry[]>>((acc, item) => {
        if (!item?.hasOwnProperty?.(idField)) return acc;
        const key = lowerCaseKey(item[idField]);
        if (!key) return acc;
        const entry: DescribeEntry = {
            ...item,
            ...baseAttributes,
            sourceScopedId: `${baseAttributes.source}:${key}`,
        };
        acc[key] = acc[key] || [];
        acc[key].push(entry);
        return acc;
    }, {});
};

// Create an entity adapter for sObjects

// Thunks using createAsyncThunk
export const describeSObjects = createAsyncThunk(
    'describe/describeSObjects',
    async (
        { connector, forceRefresh = false }: { connector: ConnectionLike; forceRefresh?: boolean },
        { dispatch, getState }
    ) => {
        LOGGER.debug('describeSObjects/connector', connector, { forceRefresh });
        // TODO: connector should be replaced by conn or use the original connector
        //const conn = useToolingApi ? connector.tooling : connector;
        const fetchDescribeAndSave = async () => {
            // When forced, append a cache-busting query param so the browser HTTP cache
            // cannot serve a stale describeGlobal response. The shape returned by
            // jsforce's request() for /sobjects is identical to describeGlobal().
            const result = forceRefresh
                ? {
                      standard: await connector.request(
                          `/services/data/v${connector.version}/sobjects?_=${Date.now()}`
                      ),
                      tooling: await connector.request(
                          `/services/data/v${connector.version}/tooling/sobjects?_=${Date.now()}`
                      ),
                  }
                : {
                      standard: await connector.describeGlobal(),
                      tooling: await connector.tooling.describeGlobal(),
                  };
            if (isUndefinedOrNull(connector.alias)) {
                throw new Error('No alias found');
            }
            await cacheManager.saveOrgData(
                connector.alias,
                CACHE_ORG_DATA_TYPES.DESCRIBE_GLOBAL,
                result
            );
            return result;
        };

        if (forceRefresh) {
            // Defense in depth: clear jsforce in-memory cache and the persisted
            // cacheManager snapshot before fetching, so any silent fallback path
            // cannot resurrect stale data.
            connector.cache?.clear?.('describeGlobal');
            connector.tooling?.cache?.clear?.('describeGlobal');
            if (!isUndefinedOrNull(connector.alias)) {
                await cacheManager.clearOrgData(
                    connector.alias,
                    CACHE_ORG_DATA_TYPES.DESCRIBE_GLOBAL
                );
            }
        }

        try {
            return await fetchDescribeAndSave();
        } catch (err) {
            // On a user-initiated refresh, surface the error instead of silently
            // returning stale cached data.
            if (!forceRefresh) {
                const cachedDescribe = await cacheManager.loadOrgData(
                    connector.alias,
                    CACHE_ORG_DATA_TYPES.DESCRIBE_GLOBAL
                );
                LOGGER.debug('cachedDescribe fallback', cachedDescribe);
                if (cachedDescribe) {
                    return cachedDescribe;
                }
            }
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: forceRefresh
                        ? 'Refresh failed: could not load SObjects from Salesforce'
                        : 'Error describing SObjects',
                    details: err?.message || String(err),
                })
            );
            throw err;
        }
    }
);

export const describeVersion = createAsyncThunk(
    'describe/describeVersion',
    async ({ connector }: { connector: ConnectionLike }, { dispatch, getState }) => {
        // TODO: connector should be replaced by conn or use the original connector
        const fetchDescribeAndSave = async () => {
            const result = await connector.metadata.describe(connector.version);
            if (isUndefinedOrNull(connector.alias)) {
                throw 'No alias found';
            }
            cacheManager.saveOrgData(
                connector.alias,
                CACHE_ORG_DATA_TYPES.DESCRIBE_VERSION,
                result
            );
            return result;
        };

        try {
            const cachedDescribe = await cacheManager.loadOrgData(
                connector.alias,
                CACHE_ORG_DATA_TYPES.DESCRIBE_VERSION
            );
            LOGGER.debug('cachedDescribe', cachedDescribe);
            if (cachedDescribe) {
                fetchDescribeAndSave();
                return cachedDescribe;
            } else {
                return await fetchDescribeAndSave();
            }
        } catch (err) {
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: 'Error describing Version',
                    details: err.message,
                })
            );
            throw err;
        }
    }
);

export const getDescribeTableName = useToolingApi =>
    useToolingApi ? DESCRIBE_ID.TOOLING : DESCRIBE_ID.STANDARD;

// Create a slice with reducers
const describeSlice = createSlice({
    name: 'describe',
    initialState: {
        prefixMap: {},
        nameMap: {},
        prefixEntriesMap: {},
        nameEntriesMap: {},
        error: null,
        isFetching: false,
    },
    extraReducers: builder => {
        builder
            .addCase(describeSObjects.pending, (state, action) => {
                state.error = null;
                state.isFetching = true;
            })
            .addCase(describeSObjects.fulfilled, (state, action) => {
                const { standard, tooling } = action.payload;
                // On a force-refresh, rebuild from scratch so deleted/renamed
                // SObjects also drop out of state.
                if ((action.meta as any)?.arg?.forceRefresh) {
                    state.prefixMap = {};
                    state.nameMap = {};
                    state.nameEntriesMap = {};
                    state.prefixEntriesMap = {};
                }
                const toolingAttributes = {
                    useToolingApi: true,
                    source: DESCRIBE_SOURCE.TOOLING,
                };
                const standardAttributes = {
                    useToolingApi: false,
                    source: DESCRIBE_SOURCE.STANDARD,
                };
                // Tooling
                Object.assign(
                    state.prefixMap,
                    arrayToMap(tooling.sobjects, 'keyPrefix', toolingAttributes, lowerCaseKey)
                );
                Object.assign(
                    state.nameMap,
                    arrayToMap(tooling.sobjects, 'name', toolingAttributes, lowerCaseKey)
                );
                // Standard
                Object.assign(
                    state.prefixMap,
                    arrayToMap(standard.sobjects, 'keyPrefix', standardAttributes, lowerCaseKey)
                );
                Object.assign(
                    state.nameMap,
                    arrayToMap(standard.sobjects, 'name', standardAttributes, lowerCaseKey)
                );

                state.nameEntriesMap = buildDescribeEntriesMap(
                    tooling.sobjects,
                    'name',
                    toolingAttributes
                );
                const standardNameEntriesMap = buildDescribeEntriesMap(
                    standard.sobjects,
                    'name',
                    standardAttributes
                );
                Object.entries(standardNameEntriesMap).forEach(([key, entries]) => {
                    state.nameEntriesMap[key] = [...(state.nameEntriesMap[key] || []), ...entries];
                });

                state.prefixEntriesMap = buildDescribeEntriesMap(
                    tooling.sobjects,
                    'keyPrefix',
                    toolingAttributes
                );
                const standardPrefixEntriesMap = buildDescribeEntriesMap(
                    standard.sobjects,
                    'keyPrefix',
                    standardAttributes
                );
                Object.entries(standardPrefixEntriesMap).forEach(([key, entries]) => {
                    state.prefixEntriesMap[key] = [
                        ...(state.prefixEntriesMap[key] || []),
                        ...entries,
                    ];
                });

                state.isFetching = false;
            })
            .addCase(describeSObjects.rejected, (state, action) => {
                const { error } = action;
                state.error = error.message || 'Unknown error';
                state.isFetching = false;
            });
    },
});

export const reduxSlice = describeSlice;
