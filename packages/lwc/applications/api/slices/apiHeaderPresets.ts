/**
 * Named header presets surfaced in the headers editor as quick-add buttons
 * (Content-Type, Accept, If-Match, If-None-Match, Sforce-Call-Options, …)
 * plus any user-defined presets.
 *
 * Persisted at user scope (not per-org) via cacheManager under
 * `api_header_presets_v1`.
 */
import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import { loadExtensionConfigFromCache, saveExtensionConfigToCache } from 'shared/cacheManager';

const PRESETS_KEY = 'api_header_presets_v1';

export type HeaderPreset = {
    id: string;
    name: string;
    headerName: string;
    value: string;
    defaultOn: boolean;
    sensitive: boolean;
    builtIn?: boolean;
};

const BUILTIN_PRESETS: readonly HeaderPreset[] = Object.freeze([
    {
        id: 'builtin_content_type_json',
        name: 'Content-Type: application/json',
        headerName: 'Content-Type',
        value: 'application/json; charset=UTF-8',
        defaultOn: true,
        sensitive: false,
        builtIn: true,
    },
    {
        id: 'builtin_accept_json',
        name: 'Accept: application/json',
        headerName: 'Accept',
        value: 'application/json',
        defaultOn: true,
        sensitive: false,
        builtIn: true,
    },
    {
        id: 'builtin_content_type_xml',
        name: 'Content-Type: application/xml',
        headerName: 'Content-Type',
        value: 'application/xml; charset=UTF-8',
        defaultOn: false,
        sensitive: false,
        builtIn: true,
    },
    {
        id: 'builtin_if_match',
        name: 'If-Match',
        headerName: 'If-Match',
        value: '*',
        defaultOn: false,
        sensitive: false,
        builtIn: true,
    },
    {
        id: 'builtin_if_none_match',
        name: 'If-None-Match',
        headerName: 'If-None-Match',
        value: '*',
        defaultOn: false,
        sensitive: false,
        builtIn: true,
    },
    {
        id: 'builtin_sforce_call_options',
        name: 'Sforce-Call-Options',
        headerName: 'Sforce-Call-Options',
        value: 'client={clientId}',
        defaultOn: false,
        sensitive: false,
        builtIn: true,
    },
] as const);

export const headerPresetsAdapter = createEntityAdapter<HeaderPreset>();

const initialState = headerPresetsAdapter.upsertMany(
    headerPresetsAdapter.getInitialState({ isInitialized: false }),
    BUILTIN_PRESETS as HeaderPreset[]
);

export const loadFromCache = async (): Promise<HeaderPreset[]> => {
    try {
        const cfg = await loadExtensionConfigFromCache([PRESETS_KEY]);
        const raw = cfg?.[PRESETS_KEY];
        if (!raw) return [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? (parsed as HeaderPreset[]) : [];
    } catch {
        return [];
    }
};

const persist = async (presets: HeaderPreset[]): Promise<void> => {
    // Only persist user-authored presets (built-ins are source-of-truth in code).
    const userPresets = presets.filter(p => !p.builtIn);
    await saveExtensionConfigToCache({
        [PRESETS_KEY]: JSON.stringify(userPresets),
    });
};

const apiHeaderPresetsSlice = createSlice({
    name: 'apiHeaderPresets',
    initialState,
    reducers: {
        initialize: (state, action: { payload: HeaderPreset[] }) => {
            if (state.isInitialized) return;
            // Re-seed built-ins first, then layer user presets on top.
            headerPresetsAdapter.removeAll(state);
            headerPresetsAdapter.upsertMany(state, BUILTIN_PRESETS as HeaderPreset[]);
            headerPresetsAdapter.upsertMany(state, action.payload || []);
            state.isInitialized = true;
        },
        addPreset: (state, action: { payload: HeaderPreset }) => {
            headerPresetsAdapter.upsertOne(state, action.payload);
            persist(headerPresetsAdapter.getSelectors().selectAll(state));
        },
        updatePreset: (
            state,
            action: { payload: { id: string; changes: Partial<HeaderPreset> } }
        ) => {
            const { id, changes } = action.payload;
            headerPresetsAdapter.updateOne(state, { id, changes });
            persist(headerPresetsAdapter.getSelectors().selectAll(state));
        },
        removePreset: (state, action: { payload: { id: string } }) => {
            const existing = headerPresetsAdapter
                .getSelectors()
                .selectById(state, action.payload.id);
            if (!existing || existing.builtIn) return; // Can't remove built-ins.
            headerPresetsAdapter.removeOne(state, action.payload.id);
            persist(headerPresetsAdapter.getSelectors().selectAll(state));
        },
    },
});

export const reduxSlice = apiHeaderPresetsSlice;
export const { initialize, addPreset, updatePreset, removePreset } = apiHeaderPresetsSlice.actions;
export const selectors = headerPresetsAdapter.getSelectors();
