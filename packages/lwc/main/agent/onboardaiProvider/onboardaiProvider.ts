import { store, APPLICATION } from 'core/store';
import Toast from 'lightning/toast';
import { LightningElement, wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import {
    loadLlmProviderConfigMapFromCache,
    saveLlmProviderConfigMapToCache,
} from 'shared/cacheManager';

const EMPLOYEE_AI_SETUP_URL =
    'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl';
const EMPLOYEE_OPENAI_PROXY_URL =
    'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl/v1';

export default class OnboardaiProvider extends LightningElement {
    @wire(NavigationContext)
    navContext;

    selectedAudience = null;
    employeeKey = '';

    get employeeSetupUrl() {
        return EMPLOYEE_AI_SETUP_URL;
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
        return this.employeeKey.length > 0;
    }

    handleInstallEmployeeKey = async () => {
        if (!this.isEmployeeKeyValid) return;
        const providerConfigs = await loadLlmProviderConfigMapFromCache();
        const nextProviderConfigs = {
            ...providerConfigs,
            openai: {
                ...providerConfigs.openai,
                apiKey: this.employeeKey,
                baseUrl: EMPLOYEE_OPENAI_PROXY_URL,
            },
            anthropic: {
                ...providerConfigs.anthropic,
                apiKey: this.employeeKey,
                baseUrl: EMPLOYEE_OPENAI_PROXY_URL,
            },
            gemini: {
                ...providerConfigs.gemini,
                apiKey: this.employeeKey,
                baseUrl: EMPLOYEE_OPENAI_PROXY_URL,
            },
        };
        await saveLlmProviderConfigMapToCache(nextProviderConfigs);
        store.dispatch(
            APPLICATION.reduxSlice.actions.updateProviderConfigs({
                providerConfigs: nextProviderConfigs,
            })
        );
        Toast.show({ message: 'Employee key installed', variant: 'success' });
    };

    handleOpenSettings = () => {
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'settings' },
        });
    };
}
