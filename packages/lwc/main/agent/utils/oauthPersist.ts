import { store, APPLICATION } from 'core/store';
import { buildProviderConfigCacheRecord, cacheManager } from 'shared/cacheManager';
import {
    createDefaultProviderConfigMap,
    normalizeProviderConfigMap,
    type LlmProvider,
    type LlmProviderConfigMap,
    type OAuthCredentials,
} from 'shared/llm';

/**
 * Persist OAuth credentials that were refreshed mid-run back into the provider config — both
 * Redux (so the live session sees the new token) and the cache (so the next run starts fresh
 * and a rotated refresh token isn't lost). Best-effort: callers fire-and-forget and log on
 * failure, since the in-memory token already keeps the current run working.
 */
export async function persistRefreshedOAuthCredentials(
    provider: LlmProvider,
    oauth: OAuthCredentials
): Promise<void> {
    const state = store.getState() as {
        application?: { providerConfigs?: LlmProviderConfigMap };
    };
    const currentMap = state.application?.providerConfigs ?? createDefaultProviderConfigMap();
    const currentConfig = currentMap[provider] ?? createDefaultProviderConfigMap()[provider];
    const nextMap = normalizeProviderConfigMap({
        ...currentMap,
        [provider]: { ...currentConfig, authMode: 'oauth', oauth },
    });
    store.dispatch(
        APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs: nextMap })
    );
    await cacheManager.saveConfig(buildProviderConfigCacheRecord(nextMap));
}
