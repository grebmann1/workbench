/**
 * Saved request chains (Postman-runner style). A chain is an ordered list of
 * steps; each step is a request plus optional JSONPath extractions and
 * assertions. Variables extracted by an earlier step are visible to later
 * steps in the same run.
 *
 * Persisted at user scope via cacheManager under `api_chains_v1`.
 */
import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import {
    loadExtensionConfigFromCache,
    saveExtensionConfigToCache,
} from 'shared/cacheManager';
import type { ChainStep, ChainRunResult } from 'shared/utils';

const CHAINS_KEY = 'api_chains_v1';

export type Chain = {
    id: string;
    name: string;
    description?: string;
    steps: ChainStep[];
    /** Optional starting variable scope */
    variables?: Record<string, string>;
    createdDate: number;
    updatedDate: number;
};

export type ChainsSliceState = ReturnType<typeof chainsAdapter.getInitialState> & {
    isInitialized: boolean;
    /** Last run per chain id (not persisted). */
    lastRun: Record<string, ChainRunResult | undefined>;
    /** Currently running chain id (or null). */
    runningChainId: string | null;
};

export const chainsAdapter = createEntityAdapter<Chain>();

const initialState: ChainsSliceState = {
    ...chainsAdapter.getInitialState(),
    isInitialized: false,
    lastRun: {},
    runningChainId: null,
};

export const loadFromCache = async (): Promise<Chain[]> => {
    try {
        const cfg = await loadExtensionConfigFromCache([CHAINS_KEY]);
        const raw = cfg?.[CHAINS_KEY];
        if (!raw) return [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? (parsed as Chain[]) : [];
    } catch {
        return [];
    }
};

const persist = async (chains: Chain[]): Promise<void> => {
    await saveExtensionConfigToCache({
        [CHAINS_KEY]: JSON.stringify(chains),
    });
};

const apiChainsSlice = createSlice({
    name: 'apiChains',
    initialState,
    reducers: {
        initialize: (state, action: { payload: Chain[] }) => {
            if (state.isInitialized) return;
            chainsAdapter.upsertMany(state, action.payload || []);
            state.isInitialized = true;
        },
        upsertChain: (state, action: { payload: Chain }) => {
            chainsAdapter.upsertOne(state, action.payload);
            persist(chainsAdapter.getSelectors().selectAll(state as any));
        },
        removeChain: (state, action: { payload: { id: string } }) => {
            chainsAdapter.removeOne(state, action.payload.id);
            delete state.lastRun[action.payload.id];
            persist(chainsAdapter.getSelectors().selectAll(state as any));
        },
        markRunning: (state, action: { payload: { id: string | null } }) => {
            state.runningChainId = action.payload.id;
        },
        setLastRun: (
            state,
            action: { payload: { id: string; result: ChainRunResult } }
        ) => {
            state.lastRun[action.payload.id] = action.payload.result;
        },
    },
});

export const reduxSlice = apiChainsSlice;
export const { initialize, upsertChain, removeChain, markRunning, setLastRun } =
    apiChainsSlice.actions;
export const selectors = chainsAdapter.getSelectors();
