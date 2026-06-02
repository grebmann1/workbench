import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import type { ConnectorLike } from 'host-api/connector';
import { lowerCaseKey } from 'host-api/utils';

export const queryAdapter = createEntityAdapter<any>();

// Exported for unit tests.
export function resolveApiVersion(connector: ConnectorLike): string {
    const v = (connector as any)?.conn?.version;
    return typeof v === 'string' && v.length > 0 ? v : '64.0';
}

// Exported for unit tests. Throws with a user-readable message on bad input.
export function parseVariables(rawVariables: string | undefined | null): Record<string, unknown> {
    if (!rawVariables || !rawVariables.trim()) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawVariables);
    } catch (e: any) {
        throw new Error(`Variables JSON is invalid: ${e?.message || 'parse failed'}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Variables must be a JSON object (e.g. {})');
    }
    return parsed as Record<string, unknown>;
}

export const executeQuery = createAsyncThunk(
    'graphql/executeQuery',
    async (
        {
            connector,
            query,
            variables,
            tabId,
            createdDate,
        }: {
            connector: ConnectorLike;
            query: string;
            variables?: string;
            tabId: string;
            createdDate: number;
        },
        { signal }
    ) => {
        try {
            const vars = parseVariables(variables);
            const apiVersion = resolveApiVersion(connector);
            const startedAt = Date.now();
            // jsforce's `request` doesn't take an AbortSignal — we can't truly
            // cancel the network round-trip. But we can reject the thunk
            // immediately when the user clicks Abort so the UI unblocks and
            // the late response is ignored by the reducer (its tab slot gets
            // upserted again by the next run, overwriting stale data).
            const response: any = await Promise.race([
                (connector as any).conn.request({
                    method: 'POST',
                    url: `/services/data/v${apiVersion}/graphql`,
                    body: JSON.stringify({ query, variables: vars }),
                    headers: { 'Content-Type': 'application/json' },
                }),
                new Promise((_, reject) => {
                    if (signal.aborted) {
                        const e: any = new Error('Aborted');
                        e.name = 'AbortError';
                        reject(e);
                        return;
                    }
                    signal.addEventListener('abort', () => {
                        const e: any = new Error('Aborted');
                        e.name = 'AbortError';
                        reject(e);
                    });
                }),
            ]);
            const took = Date.now() - startedAt;
            return {
                tabId,
                createdDate,
                took,
                data: response?.data ?? null,
                errors: Array.isArray(response?.errors) ? response.errors : null,
            };
        } catch (err: any) {
            if (err?.name === 'AbortError') throw err;
            try {
                // Lazily import the dedicated reportError module (not the
                // `host-api/store` barrel): a dynamic import of the barrel
                // forces Rollup to eagerly build its namespace object, which
                // references `core/store`'s `SELECTORS` const before it
                // initializes inside the store↔connector↔agent cycle (TDZ:
                // "Cannot access 'SELECTORS' before initialization").
                const { reportError } = await import('core/store/reportError');
                reportError('Error executing GraphQL query', { details: err?.message });
            } catch {
                // host store not loaded (e.g. unit tests) — surface error via thunk rejection only
            }
            throw err;
        }
    }
);

const graphqlQuerySlice = createSlice({
    name: 'graphqlQuery',
    initialState: queryAdapter.getInitialState(),
    reducers: {
        clearQuery: (state, action) => {
            const { tabId } = action.payload || {};
            if (!tabId) return;
            queryAdapter.removeOne(state, lowerCaseKey(tabId));
        },
    },
    extraReducers: builder => {
        builder
            .addCase(executeQuery.pending, (state, action) => {
                const { tabId, createdDate } = action.meta.arg;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetching: true,
                    data: null,
                    errors: null,
                    error: null,
                    createdDate,
                });
            })
            .addCase(executeQuery.fulfilled, (state, action) => {
                const { tabId, data, errors, took, createdDate } = action.payload;
                queryAdapter.upsertOne(state, {
                    id: lowerCaseKey(tabId),
                    isFetching: false,
                    data,
                    errors,
                    took,
                    createdDate,
                    error: null,
                });
            })
            .addCase(executeQuery.rejected, (state, action) => {
                const { error } = action;
                const { tabId } = action.meta.arg;
                if (error?.name === 'AbortError') {
                    // Abort leaves the slot blank — no data, no error spew.
                    queryAdapter.upsertOne(state, {
                        id: lowerCaseKey(tabId),
                        isFetching: false,
                        error: null,
                    });
                } else {
                    queryAdapter.upsertOne(state, {
                        id: lowerCaseKey(tabId),
                        isFetching: false,
                        error,
                    });
                }
            });
    },
});

export const reduxSlice = graphqlQuerySlice;
export const querySelectors = queryAdapter.getSelectors((state: any) => state.graphqlQuery);
