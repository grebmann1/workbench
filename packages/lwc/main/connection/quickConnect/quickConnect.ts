import { credentialStrategies, OAUTH_TYPES } from 'core/connector';
import type { ConnectorLike } from 'core/connector';
import { store, APPLICATION } from 'core/store';
import Toast from 'lightning/toast';
import LOGGER from 'shared/logger';
import { isElectronApp } from 'shared/utils';

const DESKTOP_QUICK_CONNECT_UNSUPPORTED_MESSAGE =
    'Quick Connect is not available in Workbench Desktop. Open a saved Salesforce CLI org or use Manual Session from Connections.';

type QuickConnectOptions = {
    setLoading?: (message: string) => void;
    resetLoading?: () => void;
    onSuccess?: (connector: ConnectorLike) => void;
    onError?: (error: Error) => void;
    loginUrl?: string;
    isSandbox?: boolean;
};

type JsforceSettingsWindow = Window & {
    jsforceSettings?: {
        loginUrl?: string;
    };
};

export async function runQuickConnect({
    setLoading,
    resetLoading,
    onSuccess,
    onError,
    loginUrl: loginUrlOverride,
    isSandbox,
}: QuickConnectOptions = {}) {
    if (typeof setLoading === 'function') {
        setLoading('Starting direct OAuth connection...');
    }

    try {
        if (isElectronApp()) {
            throw new Error(DESKTOP_QUICK_CONNECT_UNSUPPORTED_MESSAGE);
        }

        const jsforceWindow = window as JsforceSettingsWindow;
        const defaultLoginUrl = isSandbox
            ? 'https://test.salesforce.com'
            : jsforceWindow.jsforceSettings?.loginUrl || 'https://login.salesforce.com';
        const loginUrl = loginUrlOverride || defaultLoginUrl;
        const alias = `direct-session-${Date.now()}`;
        const connector: ConnectorLike = await credentialStrategies[OAUTH_TYPES.OAUTH].connect(
            { alias, loginUrl },
            { bypass: true, persist: false }
        );

        if (connector?.hasError) {
            const message =
                typeof connector.errorMessage === 'string'
                    ? connector.errorMessage
                    : 'Unable to establish direct connection';
            throw new Error(message);
        }

        store.dispatch(APPLICATION.reduxSlice.actions.login({ connector }));

        if (typeof onSuccess === 'function') {
            onSuccess(connector);
        }

        Toast.show({
            label: 'Direct connection established',
            message: 'Session is active but not saved in your org list.',
            variant: 'success',
            mode: 'dismissible',
        });

        return connector;
    } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        LOGGER.error('runQuickConnect error', error);
        if (typeof onError === 'function') {
            onError(error);
        }
        Toast.show({
            label: 'Direct connection failed',
            message: error.message,
            variant: 'error',
            mode: 'dismissible',
        });
        return null;
    } finally {
        if (typeof resetLoading === 'function') {
            resetLoading();
        }
    }
}
