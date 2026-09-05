import { store, APPLICATION, AGENT } from 'core/store';
import {
    basicStore,
    loadExtensionConfigFromCache,
    CACHE_CONFIG,
    cacheManager,
    getAiProviderFromConfig,
    getLlmProviderConfigCacheKeys,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';
import {
    buildAvailableAgentModelOptions,
    fetchApiKeyProviderModels,
    fetchLlmModelsEndpoint,
    fetchSubscriptionModels,
    getProviderForModel,
    normalizeModelSelection,
    toNonEmptyProviderCatalogs,
} from 'shared/llm';
import LOGGER from 'shared/logger';
import { isChromeExtension } from 'shared/utils';

/**
 * Cache initialization and loading helpers
 */

/**
 * Initialize cache storage
 */
export async function initCacheStorage() {
    if (isChromeExtension()) return;
    LOGGER.debug('initCacheStorage');
    (window as any).defaultStore = basicStore('local');
    (window as any).settingsStore = basicStore('session');
}

/**
 * Load configuration from cache
 * @param {Object} context - Component context (for setting component properties)
 */
export async function loadFromCache(context) {
    const allKeys = Object.values(CACHE_CONFIG).map(x => x.key);
    const configuration = await cacheManager.loadConfig(allKeys);

    if (context) {
        context.isApplicationTabVisible =
            configuration[CACHE_CONFIG.UI_IS_APPLICATION_TAB_VISIBLE.key];
        context.betaSmartInputEnabled = !!configuration[CACHE_CONFIG.BETA_SMARTINPUT_ENABLED.key];
    }

    const providerConfigs = resolveLlmProviderConfigMap(configuration);
    const aiProvider = getAiProviderFromConfig(configuration);
    const openaiKey = providerConfigs.openai.apiKey;
    const openaiUrl = providerConfigs.openai.baseUrl;
    const mistralKey = providerConfigs.mistral.apiKey;

    /* LOGGER.debug('loadFromCache - openaiKey', openaiKey);
    LOGGER.debug('loadFromCache - openaiUrl', openaiUrl);
    LOGGER.debug('loadFromCache - mistralKey', mistralKey);
    LOGGER.debug('loadFromCache - aiProvider', aiProvider); */

    store.dispatch(APPLICATION.reduxSlice.actions.updateSettings(configuration));
    store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
    store.dispatch(APPLICATION.reduxSlice.actions.updateAiProvider({ aiProvider }));

    // LLM catalog refresh runs in the background — it's a network round-trip that
    // blocks first paint but its consumers (agent app) react through storeChange when
    // the catalog lands.
    void refreshLlmCatalogInBackground(aiProvider, providerConfigs);

    return {
        openaiKey,
        openaiUrl,
        mistralKey,
        aiProvider,
        providerConfigs,
        isApplicationTabVisible: configuration[CACHE_CONFIG.UI_IS_APPLICATION_TAB_VISIBLE.key],
        betaSmartInputEnabled: !!configuration[CACHE_CONFIG.BETA_SMARTINPUT_ENABLED.key],
    };
}

async function refreshLlmCatalogInBackground(aiProvider, providerConfigs) {
    // Server catalog and subscription (OAuth) catalog are fetched independently: a server failure
    // must not skip the subscription fetch (OAuth-only users have no server), so the server portion
    // gets its own try/catch and we always go on to fetch subscription models.
    let serverCatalogs;
    try {
        const response = await fetchLlmModelsEndpoint({ provider: aiProvider, providerConfigs });
        serverCatalogs = response.catalogs;
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateProviderCatalogs({ catalogs: serverCatalogs })
        );
    } catch (error) {
        LOGGER.warn('loadFromCache - failed to refresh LLM catalog', error);
    }

    const subscriptionModels = await fetchSubscriptionModels(providerConfigs);
    store.dispatch(
        APPLICATION.reduxSlice.actions.updateSubscriptionModels({ models: subscriptionModels })
    );

    const apiKeyCatalogs = toNonEmptyProviderCatalogs(
        await fetchApiKeyProviderModels(providerConfigs)
    );
    if (Object.keys(apiKeyCatalogs).length > 0) {
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateProviderCatalogs({ catalogs: apiKeyCatalogs })
        );
    }

    const availableModels = buildAvailableAgentModelOptions({
        availableModelsByProvider: { ...(serverCatalogs || {}), ...apiKeyCatalogs },
        subscriptionModelsByProvider: subscriptionModels,
        providerConfigs,
    });
    if (availableModels.length > 0) {
        const currentModel = store.getState()?.agent?.selectedModel;
        const normalizedModel = normalizeModelSelection(currentModel, availableModels);
        if (normalizedModel && normalizedModel !== currentModel) {
            store.dispatch(
                AGENT.reduxSlice.actions.updateSelectedModel({ model: normalizedModel })
            );
        }
        const resolvedProvider = getProviderForModel(normalizedModel, availableModels);
        if (resolvedProvider !== aiProvider) {
            store.dispatch(
                APPLICATION.reduxSlice.actions.updateAiProvider({
                    aiProvider: resolvedProvider,
                })
            );
        }
    }
}
