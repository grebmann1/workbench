import { GOOGLE_DRIVE_SCOPES } from 'agent/googleAuth';
import { store, APPLICATION, connectStore } from 'core/store';
import Toast from 'lightning/toast';
import { api, LightningElement, track, wire } from 'lwc';
import { CACHE_CONFIG, saveSingleExtensionConfigToCache } from 'shared/cacheManager';
import { isInternalProviderBaseUrl } from 'shared/llm';
import LOGGER from 'shared/logger';

const INTERNAL_PROVIDER_DOCS_URL = 'https://doc.sf-workbench.com/ai-agent/llm-provider-runtime';

export default class AiSettings extends LightningElement {
    @api config = {};
    @api hideMcpCard = false;
    @api hideLlmSettingsCard = false;
    @api useInlineOnboarding = false;

    @track googleUser = null;
    @track googleDriveConnected = false;
    @track showOnboardAiProvider = false;

    @wire(connectStore, { store })
    storeChange({ application }) {
        const settings = application?.settings || {};
        const session = settings[CACHE_CONFIG.GOOGLE_SESSION.key] || null;
        this.googleUser = session;
        this.googleDriveConnected =
            !!session?.token && !!settings[CACHE_CONFIG.GOOGLE_DRIVE_CONNECTED.key];
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
