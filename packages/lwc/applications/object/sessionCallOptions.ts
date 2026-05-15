import { cacheManager, CACHE_ORG_DATA_TYPES, CACHE_SESSION_CONFIG } from 'shared/cacheManager';

type ConnectorLike = {
    configuration?: { alias?: string | null } | null;
    conn?: { _callOptions?: Record<string, unknown> } | null;
} | null;

/**
 * Defensive sync for stale app sessions: ensure jsforce call options carry the
 * cached org-level client_id used by QAInternal mode.
 */
export const ensureSessionClientCallOption = async (connector: ConnectorLike): Promise<void> => {
    const alias = connector?.configuration?.alias;
    const connection = connector?.conn;
    if (!connection || typeof alias !== 'string' || !alias.trim()) return;

    const existingClientId = connection._callOptions?.client;
    if (typeof existingClientId === 'string' && existingClientId.trim()) return;

    const sessionSettings = await cacheManager.loadOrgData<Record<string, unknown>>(
        alias,
        CACHE_ORG_DATA_TYPES.SESSION_SETTINGS
    );
    const sessionClientId = sessionSettings?.[CACHE_SESSION_CONFIG.CLIENT_ID.key];
    if (typeof sessionClientId !== 'string' || !sessionClientId.trim()) return;

    connection._callOptions = {
        ...(connection._callOptions || {}),
        client: sessionClientId,
    };
};
