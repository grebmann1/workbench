/**
 * Named authentication profiles that can be attached to a tab, overriding
 * the org-connector's default Bearer token.
 *
 * Persisted at user scope via cacheManager under `api_auth_profiles_v1`.
 * VALUES MAY CONTAIN SECRETS — each profile is tagged with a `sensitive`
 * flag so UI can redact it in snippets / exports.
 */
import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';
import { loadExtensionConfigFromCache, saveExtensionConfigToCache } from 'shared/cacheManager';

const PROFILES_KEY = 'api_auth_profiles_v1';

export type AuthProfileKind =
    | 'inherit' // Use connector Bearer token (default behaviour)
    | 'bearer'
    | 'api_key' // Custom header with an API key
    | 'basic'
    | 'custom' // Raw header set
    | 'none';

export type AuthProfile = {
    id: string;
    name: string;
    kind: AuthProfileKind;
    /** bearer: the token; basic: base64-encoded user:pass; api_key: key value */
    token?: string;
    /** api_key: header name (e.g. "X-API-Key"); custom: n/a */
    headerName?: string;
    /** custom: a full headers record */
    headers?: Record<string, string>;
    sensitive: boolean;
};

export const authProfilesAdapter = createEntityAdapter<AuthProfile>();

const INHERIT_PROFILE: AuthProfile = {
    id: 'inherit',
    name: 'Inherit from org',
    kind: 'inherit',
    sensitive: false,
};

const initialState = authProfilesAdapter.upsertOne(
    authProfilesAdapter.getInitialState({ isInitialized: false }),
    INHERIT_PROFILE
);

export const loadFromCache = async (): Promise<AuthProfile[]> => {
    try {
        const cfg = await loadExtensionConfigFromCache([PROFILES_KEY]);
        const raw = cfg?.[PROFILES_KEY];
        if (!raw) return [];
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? (parsed as AuthProfile[]) : [];
    } catch {
        return [];
    }
};

const persist = async (profiles: AuthProfile[]): Promise<void> => {
    const userProfiles = profiles.filter(p => p.id !== INHERIT_PROFILE.id);
    await saveExtensionConfigToCache({
        [PROFILES_KEY]: JSON.stringify(userProfiles),
    });
};

/**
 * Turn a profile + the current connector access token into a concrete
 * headers patch to merge into the request.
 */
export const resolveAuthHeaders = (
    profile: AuthProfile | null | undefined,
    connectorAccessToken: string | undefined
): Record<string, string> => {
    if (!profile || profile.kind === 'inherit') {
        return connectorAccessToken ? { Authorization: `Bearer ${connectorAccessToken}` } : {};
    }
    switch (profile.kind) {
        case 'bearer':
            return profile.token ? { Authorization: `Bearer ${profile.token}` } : {};
        case 'basic':
            return profile.token ? { Authorization: `Basic ${profile.token}` } : {};
        case 'api_key':
            return profile.token && profile.headerName
                ? { [profile.headerName]: profile.token }
                : {};
        case 'custom':
            return { ...(profile.headers || {}) };
        case 'none':
        default:
            return {};
    }
};

const apiAuthProfilesSlice = createSlice({
    name: 'apiAuthProfiles',
    initialState,
    reducers: {
        initialize: (state, action: { payload: AuthProfile[] }) => {
            if (state.isInitialized) return;
            authProfilesAdapter.removeAll(state);
            authProfilesAdapter.upsertOne(state, INHERIT_PROFILE);
            authProfilesAdapter.upsertMany(state, action.payload || []);
            state.isInitialized = true;
        },
        upsertProfile: (state, action: { payload: AuthProfile }) => {
            if (action.payload.id === INHERIT_PROFILE.id) return; // protected id
            authProfilesAdapter.upsertOne(state, action.payload);
            persist(authProfilesAdapter.getSelectors().selectAll(state));
        },
        removeProfile: (state, action: { payload: { id: string } }) => {
            if (action.payload.id === INHERIT_PROFILE.id) return;
            authProfilesAdapter.removeOne(state, action.payload.id);
            persist(authProfilesAdapter.getSelectors().selectAll(state));
        },
    },
});

export const reduxSlice = apiAuthProfilesSlice;
export const { initialize, upsertProfile, removeProfile } = apiAuthProfilesSlice.actions;
export const selectors = authProfilesAdapter.getSelectors();
