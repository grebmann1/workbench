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
    fetchLlmModelsEndpoint,
    getProviderForModel,
    normalizeModelSelection,
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
    try {
        const response = await fetchLlmModelsEndpoint({ provider: aiProvider, providerConfigs });
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateProviderCatalogs({ catalogs: response.catalogs })
        );

        const availableModels = buildAvailableAgentModelOptions({
            availableModelsByProvider: response.catalogs,
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
    } catch (error) {
        LOGGER.warn('loadFromCache - failed to refresh LLM catalog', error);
    }
}
