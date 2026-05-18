import { store, APPLICATION } from 'core/store';
import Toast from 'lightning/toast';
import { LightningElement, track } from 'lwc';
import {
    buildProviderConfigCacheRecord,
    cacheManager,
    CACHE_CONFIG,
    getAiProviderFromConfig,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';

function buildEditableProviderConfigs(config) {
    const currentProviderConfigs = resolveLlmProviderConfigMap(config);
    return {
        ...currentProviderConfigs,
        openai: {
            ...currentProviderConfigs.openai,
            apiKey: config[CACHE_CONFIG.OPENAI_KEY.key],
            baseUrl: config[CACHE_CONFIG.OPENAI_URL.key],
        },
        anthropic: {
            ...currentProviderConfigs.anthropic,
            apiKey: config[CACHE_CONFIG.ANTHROPIC_KEY.key],
            baseUrl: config[CACHE_CONFIG.ANTHROPIC_URL.key],
        },
        gemini: {
            ...currentProviderConfigs.gemini,
            apiKey: config[CACHE_CONFIG.GEMINI_KEY.key],
            baseUrl: config[CACHE_CONFIG.GEMINI_URL.key],
        },
        mistral: {
            ...currentProviderConfigs.mistral,
            apiKey: config[CACHE_CONFIG.MISTRAL_KEY.key],
            baseUrl: config[CACHE_CONFIG.MISTRAL_URL.key],
        },
        grok: {
            ...currentProviderConfigs.grok,
            apiKey: config[CACHE_CONFIG.GROK_KEY.key],
            baseUrl: config[CACHE_CONFIG.GROK_URL.key],
        },
    };
}

export default class Chat extends LightningElement {
    @track isSettingsViewOpen = false;
    @track config = {};
    @track originalConfig = {};

    handleOpenSettings = async () => {
        await this.loadConfigFromCache();
        this.isSettingsViewOpen = true;
    };

    handleCloseSettings = () => {
        this.isSettingsViewOpen = false;
    };

    handleInputChange = event => {
        const key = event?.detail?.key;
        if (!key) return;
        this.config = {
            ...this.config,
            [key]: event.detail.value,
        };
    };

    handleSetupComplete = async () => {
        await this.loadConfigFromCache();
    };

    handleSave = async () => {
        const configurationList = Object.values(CACHE_CONFIG);
        const config = {};
        Object.values(configurationList).forEach(item => {
            config[item.key] = this.config[item.key];
        });
        const providerConfigs = buildEditableProviderConfigs(config);
        Object.assign(config, buildProviderConfigCacheRecord(providerConfigs));
        await cacheManager.saveConfig(config);
        store.dispatch(APPLICATION.reduxSlice.actions.updateSettings(config));
        store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateAiProvider({
                aiProvider: getAiProviderFromConfig(config),
            })
        );
        this.originalConfig = { ...config };
        Toast.show({
            label: 'AI settings saved',
            variant: 'success',
        });
    };

    async loadConfigFromCache() {
        const cachedConfiguration = await cacheManager.loadConfig(
            Object.values(CACHE_CONFIG).map(x => x.key)
        );
        const configurationList = Object.values(CACHE_CONFIG);
        const config = {};
        Object.values(configurationList).forEach(item => {
            const cached = cachedConfiguration[item.key];
            config[item.key] = cached !== undefined && cached !== null ? cached : item.defaultValue;
        });
        const providerConfigs = resolveLlmProviderConfigMap(cachedConfiguration);
        Object.assign(config, buildProviderConfigCacheRecord(providerConfigs));
        config.ai_provider = getAiProviderFromConfig(cachedConfiguration);
        if (!Array.isArray(config.metadata_storage_types)) {
            config.metadata_storage_types = [];
        }
        this.config = config;
        this.originalConfig = { ...config };
    }

    get isSaveDisabled() {
        return JSON.stringify(this.config) === JSON.stringify(this.originalConfig);
    }
}
