import { store, APPLICATION } from 'core/store';
import Toast from 'lightning/toast';
import { LightningElement, wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import {
    loadLlmProviderConfigMapFromCache,
    saveLlmProviderConfigMapToCache,
} from 'shared/cacheManager';
import { INTERNAL_PROVIDER_BASE_URLS } from 'shared/llm';
import {
    EMPLOYEE_LLM_KEY_PATTERN,
    EMPLOYEE_LLM_KEY_PATTERN_MESSAGE,
    isEmployeeLlmKeyValid,
} from './employeeKey';

const EMPLOYEE_AI_SETUP_URL =
    'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl';

export default class OnboardaiProvider extends LightningElement {
    @wire(NavigationContext)
    navContext;

    selectedAudience = null;
    employeeKey = '';

    get employeeSetupUrl() {
        return EMPLOYEE_AI_SETUP_URL;
    }

    get employeeKeyPattern() {
        return EMPLOYEE_LLM_KEY_PATTERN;
    }

    get employeeKeyPatternMessage() {
        return EMPLOYEE_LLM_KEY_PATTERN_MESSAGE;
    }

    get isEmployeeSelected() {
        return this.selectedAudience === 'employee';
    }

    get isExternalSelected() {
        return this.selectedAudience === 'external';
    }

    handleSelectEmployee = () => {
        this.selectedAudience = 'employee';
    };

    handleSelectExternal = () => {
        this.selectedAudience = 'external';
    };

    handleResetSelection = () => {
        this.selectedAudience = null;
    };

    handleEmployeeKeyChange = event => {
        this.employeeKey = event?.detail?.value?.trim() || '';
    };

    get isEmployeeKeyValid() {
        return isEmployeeLlmKeyValid(this.employeeKey);
    }

    handleInstallEmployeeKey = async () => {
        if (!this.isEmployeeKeyValid) return;
        const providerConfigs = await loadLlmProviderConfigMapFromCache();
        const nextProviderConfigs = {
            ...providerConfigs,
            openai: {
                ...providerConfigs.openai,
                apiKey: this.employeeKey,
                baseUrl: INTERNAL_PROVIDER_BASE_URLS.openai,
            },
            anthropic: {
                ...providerConfigs.anthropic,
                apiKey: this.employeeKey,
                baseUrl: INTERNAL_PROVIDER_BASE_URLS.anthropic,
            },
            gemini: {
                ...providerConfigs.gemini,
                apiKey: this.employeeKey,
                baseUrl: INTERNAL_PROVIDER_BASE_URLS.gemini,
            },
        };
        await saveLlmProviderConfigMapToCache(nextProviderConfigs);
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateProviderConfigs({
                providerConfigs: nextProviderConfigs,
            })
        );
        Toast.show({ message: 'Employee key installed', variant: 'success' });
        this.dispatchEvent(new CustomEvent('setupcomplete'));
    };

    handleOpenSettings = () => {
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'settings' },
        });
    };
}
