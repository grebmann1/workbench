import { GOOGLE_DRIVE_SCOPES } from 'agent/googleAuth';
import { store, APPLICATION, connectStore } from 'core/store';
import Toast from 'lightning/toast';
import { api, LightningElement, track, wire } from 'lwc';
import {
    CACHE_CONFIG,
    buildProviderConfigCacheRecord,
    cacheManager,
    getLlmProviderConfigCacheKeys,
    resolveLlmProviderConfigMap,
    saveSingleExtensionConfigToCache,
} from 'shared/cacheManager';
import {
    isInternalProviderBaseUrl,
    normalizeProviderConfigMap,
    type LlmProviderConfigMap,
} from 'shared/llm';
import LOGGER from 'shared/logger';

// Subscription sign-in maps a UI provider id to the LLM provider whose config stores the
// OAuth credentials (Codex is an auth-mode on `openai`, xAI on `grok`).
const OAUTH_PROVIDER_TO_LLM = { codex: 'openai', xai: 'grok' };

const INTERNAL_PROVIDER_DOCS_URL = 'https://doc.sf-workbench.com/ai-agent/llm-provider-runtime';

export default class AiSettings extends LightningElement {
    @api config = {};
    @api hideMcpCard = false;
    @api hideLlmSettingsCard = false;
    @api useInlineOnboarding = false;

    @track googleUser = null;
    @track googleDriveConnected = false;
    @track showOnboardAiProvider = false;
    @track providerConfigs: Partial<LlmProviderConfigMap> = {};
    @track isSigningIn = false;

    @wire(connectStore, { store })
    storeChange({ application }) {
        const settings = application?.settings || {};
        const session = settings[CACHE_CONFIG.GOOGLE_SESSION.key] || null;
        this.googleUser = session;
        this.googleDriveConnected =
            !!session?.token && !!settings[CACHE_CONFIG.GOOGLE_DRIVE_CONNECTED.key];
        this.providerConfigs = application?.providerConfigs || {};
    }

    connectedCallback() {
        if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener(this.handleOAuthResultMessage);
        }
    }

    disconnectedCallback() {
        if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
            chrome.runtime.onMessage.removeListener(this.handleOAuthResultMessage);
        }
    }

    // Completion of an extension OAuth sign-in is delivered by the background worker.
    handleOAuthResultMessage = message => {
        if (message?.action !== 'workbench_oauth_result') return;
        this.isSigningIn = false;
        if (message.ok) {
            this.reloadProviderConfigs()
                .then(() => Toast.show({ label: 'Signed in.', variant: 'success' }))
                .catch(err => LOGGER.error('Failed to reload provider configs', err));
        } else {
            Toast.show({ label: message.message || 'Sign-in failed.', variant: 'error' });
        }
    };

    async reloadProviderConfigs() {
        const cached = await cacheManager.loadConfig(getLlmProviderConfigCacheKeys());
        const providerConfigs = resolveLlmProviderConfigMap(cached);
        store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
    }

    handleProviderSignIn = async e => {
        const provider = e.currentTarget?.dataset?.provider;
        if (!provider) return;
        if (typeof chrome === 'undefined' || typeof chrome?.runtime?.sendMessage !== 'function') {
            Toast.show({
                label: 'Subscription sign-in is only available in the Chrome extension.',
                variant: 'error',
            });
            return;
        }
        this.isSigningIn = true;
        try {
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'providerOAuthStart', provider }, response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response?.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response);
                    }
                });
            });
            // The popup is the user's cue; completion arrives asynchronously via
            // handleOAuthResultMessage (which shows the "Signed in" toast + connected state).
        } catch (err) {
            LOGGER.error('Provider OAuth start failed', err);
            Toast.show({ label: `Sign-in failed: ${err.message}`, variant: 'error' });
        } finally {
            this.isSigningIn = false;
        }
    };

    handleProviderDisconnect = async e => {
        const provider = e.currentTarget?.dataset?.provider;
        const llmProvider = OAUTH_PROVIDER_TO_LLM[provider];
        if (!llmProvider) return;
        try {
            const cached = await cacheManager.loadConfig(getLlmProviderConfigCacheKeys());
            const currentMap = resolveLlmProviderConfigMap(cached);
            const nextMap = normalizeProviderConfigMap({
                ...currentMap,
                [llmProvider]: { ...currentMap[llmProvider], authMode: 'apiKey', oauth: null },
            });
            await cacheManager.saveConfig(buildProviderConfigCacheRecord(nextMap));
            store.dispatch(
                APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs: nextMap })
            );
            Toast.show({ label: 'Signed out.', variant: 'success' });
        } catch (err) {
            LOGGER.error('Provider OAuth disconnect failed', err);
            Toast.show({ label: `Sign-out failed: ${err.message}`, variant: 'error' });
        }
    };

    get codexConnected() {
        const config = this.providerConfigs?.openai;
        return config?.authMode === 'oauth' && !!config?.oauth?.access;
    }

    get xaiConnected() {
        const config = this.providerConfigs?.grok;
        return config?.authMode === 'oauth' && !!config?.oauth?.access;
    }

    emitInputChange(key, value) {
        this.dispatchEvent(
            new CustomEvent('inputchange', {
                detail: { key, value },
                bubbles: true,
                composed: true,
            })
        );
    }

    inputfield_change = e => {
        const inputField = e.currentTarget;
        const key = inputField?.dataset?.key;
        if (!key) return;

        if (e.detail?.value !== undefined) {
            this.emitInputChange(key, e.detail.value);
            return;
        }
        if (inputField.type === 'toggle') {
            this.emitInputChange(key, inputField.checked);
            return;
        }
        this.emitInputChange(key, inputField.value);
    };

    handleToggleVisibility = e => {
        e.preventDefault();
        const key = e.currentTarget.dataset.key;
        if (!key) return;

        const input = this.template.querySelector(`lightning-input[data-key="${key}"]`);
        if (!input) return;

        const isVisible = e.currentTarget.dataset.isVisible !== 'true';
        input.type = isVisible ? 'text' : 'password';
        e.currentTarget.dataset.isVisible = isVisible ? 'true' : 'false';
        e.currentTarget.iconName = isVisible ? 'utility:hide' : 'utility:preview';
    };

    handleOpenOnboardAiProvider = () => {
        this.showOnboardAiProvider = true;
    };

    handleCloseOnboardAiProvider = () => {
        this.showOnboardAiProvider = false;
    };

    handleOnboardAiProviderSetupComplete = () => {
        this.handleCloseOnboardAiProvider();
        this.dispatchEvent(new CustomEvent('setupcomplete', { bubbles: true, composed: true }));
    };

    handleOnboardBackdropClick = () => {
        this.handleCloseOnboardAiProvider();
    };

    handleOnboardModalClick = e => {
        e.stopPropagation();
    };

    handleConnectGoogleDrive = async () => {
        if (typeof chrome === 'undefined' || typeof chrome?.identity?.getAuthToken !== 'function') {
            Toast.show({
                label: 'Google Drive is only available in the Chrome extension.',
                variant: 'error',
            });
            return;
        }
        try {
            await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken(
                    { interactive: true, scopes: GOOGLE_DRIVE_SCOPES },
                    token => {
                        if (chrome.runtime.lastError || !token) {
                            reject(
                                new Error(
                                    chrome.runtime.lastError?.message ||
                                        'Drive authorization failed'
                                )
                            );
                        } else {
                            resolve(token);
                        }
                    }
                );
            });
            await saveSingleExtensionConfigToCache(CACHE_CONFIG.GOOGLE_DRIVE_CONNECTED.key, true);
            store.dispatch(
                APPLICATION.reduxSlice.actions.updateSettings({
                    [CACHE_CONFIG.GOOGLE_DRIVE_CONNECTED.key]: true,
                })
            );
            Toast.show({ label: 'Google Drive & Sheets connected', variant: 'success' });
        } catch (err) {
            LOGGER.error('Google Drive OAuth error', err);
            Toast.show({ label: `Failed to connect Drive: ${err.message}`, variant: 'error' });
        }
    };

    handleDisconnectGoogleDrive = async () => {
        await saveSingleExtensionConfigToCache(CACHE_CONFIG.GOOGLE_DRIVE_CONNECTED.key, false);
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateSettings({
                [CACHE_CONFIG.GOOGLE_DRIVE_CONNECTED.key]: false,
            })
        );
        Toast.show({ label: 'Google Drive & Sheets disconnected', variant: 'success' });
    };

    get hasInternalProvider() {
        const config = this.config || {};
        return (
            isInternalProviderBaseUrl(config.openai_url) ||
            isInternalProviderBaseUrl(config.anthropic_url) ||
            isInternalProviderBaseUrl(config.gemini_url)
        );
    }

    get googleConnected() {
        return !!this.googleUser?.token;
    }

    get isDriveConnectDisabled() {
        return !this.googleConnected;
    }

    get internalProviderDocsUrl() {
        return INTERNAL_PROVIDER_DOCS_URL;
    }
}
