import { store, APPLICATION } from 'core/store';
import {
    buildProviderConfigCacheRecord,
    cacheManager,
    getLlmProviderConfigCacheKeys,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';
import {
    createDefaultProviderConfigMap,
    fetchSubscriptionModels,
    normalizeProviderConfigMap,
    type LlmProvider,
    type LlmProviderConfigMap,
    type OAuthCredentials,
} from 'shared/llm';
import LOGGER from 'shared/logger';

// Serialize full-map writes so parallel Codex/xAI rotations cannot overwrite one another.
let persistence: Promise<void> = Promise.resolve();

/** Reconcile a cache-backed caller's credentials before it can rotate or invalidate them. */
export async function loadProviderConfigsForOAuth() {
    const previous = store.getState().application.providerConfigs;
    await persistence;
    const cachedConfig = await cacheManager.loadConfig(getLlmProviderConfigCacheKeys());
    const current = store.getState().application.providerConfigs;
    // A disconnect, sign-in, or rotation during the read takes precedence over its snapshot.
    if (current === previous) {
        const providerConfigs = resolveLlmProviderConfigMap(cachedConfig);
        store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
    }
    return {
        cachedConfig,
        providerConfigs: store.getState().application.providerConfigs,
    };
}

function updateOAuthCredentials(
    provider: LlmProvider,
    oauth: OAuthCredentials | null,
    previous?: OAuthCredentials
): Promise<void> {
    const currentMap: LlmProviderConfigMap =
        store.getState().application?.providerConfigs ?? createDefaultProviderConfigMap();
    const current = currentMap[provider];
    // Never resurrect a disconnected account or overwrite a newer sign-in/rotation.
    const matchesPrevious =
        !previous ||
        (current.oauth?.access === previous.access && current.oauth?.refresh === previous.refresh);
    const alreadyRefreshed =
        !!oauth &&
        current.oauth?.access === oauth.access &&
        current.oauth?.refresh === oauth.refresh;
    if (current.authMode !== 'oauth' || !current.oauth || (!matchesPrevious && !alreadyRefreshed)) {
        return Promise.resolve();
    }
    const nextMap = normalizeProviderConfigMap({
        ...currentMap,
        [provider]: { ...current, oauth },
    });
    store.dispatch(
        APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs: nextMap })
    );
    if (!oauth) {
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateSubscriptionModels({ models: { [provider]: [] } })
        );
    }
    const write = persistence.then(() => {
        // Read at write-time, not enqueue-time: another provider may have refreshed meanwhile.
        const providerConfigs = store.getState().application.providerConfigs;
        return cacheManager.saveConfig(buildProviderConfigCacheRecord(providerConfigs));
    });
    persistence = write.catch(() => {});
    return write;
}

/** Persist rotations before the catalog/runtime proceeds with the new refresh token. */
export function persistRefreshedOAuthCredentials(
    provider: LlmProvider,
    oauth: OAuthCredentials,
    previous?: OAuthCredentials
): Promise<void> {
    return updateOAuthCredentials(provider, oauth, previous);
}

/** Keep OAuth mode selected, but remove unusable credentials so settings offers sign-in. */
export function invalidateOAuthCredentials(
    provider: LlmProvider,
    previous: OAuthCredentials
): Promise<void> {
    return updateOAuthCredentials(provider, null, previous);
}

/** Shared store integration for startup and settings catalog refreshes. */
export async function refreshSubscriptionModelCatalog(
    providerConfigs: LlmProviderConfigMap,
    onError?: (error: unknown) => void
) {
    const expected = { openai: providerConfigs.openai.oauth, grok: providerConfigs.grok.oauth };
    const models = await fetchSubscriptionModels(providerConfigs, fetch, {
        onTokenRefresh: async (provider, next, previous) => {
            await persistRefreshedOAuthCredentials(provider, next, previous);
            if (provider === 'openai' || provider === 'grok') expected[provider] = next;
        },
        onAuthInvalid: async (provider, previous) => {
            await invalidateOAuthCredentials(provider, previous);
            if (provider === 'openai' || provider === 'grok') expected[provider] = null;
        },
        onError: (provider, error) => {
            LOGGER.warn(`Failed to refresh ${provider} subscription models`, error);
            onError?.(error);
        },
    });
    const current = store.getState().application.providerConfigs;
    for (const provider of ['openai', 'grok'] as const) {
        if (
            current[provider].authMode !== providerConfigs[provider].authMode ||
            current[provider].oauth?.access !== expected[provider]?.access
        ) {
            delete models[provider];
        }
    }
    // Omitted failed providers preserve their last usable models in the reducer.
    store.dispatch(APPLICATION.reduxSlice.actions.updateSubscriptionModels({ models }));
    return store.getState().application.subscriptionModelsByProvider;
}
