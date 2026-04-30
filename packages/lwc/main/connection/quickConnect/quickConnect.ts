import { credentialStrategies, OAUTH_TYPES } from 'core/connector';
import type { ConnectorLike } from 'core/connector';
import { store, APPLICATION } from 'core/store';
import Toast from 'lightning/toast';
import LOGGER from 'shared/logger';

type QuickConnectOptions = {
    setLoading?: (message: string) => void;
    resetLoading?: () => void;
    onSuccess?: (connector: ConnectorLike) => void;
    onError?: (error: Error) => void;
    loginUrl?: string;
    isSandbox?: boolean;
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
        const defaultLoginUrl = isSandbox
            ? 'https://test.salesforce.com'
            : window?.jsforceSettings?.loginUrl || 'https://login.salesforce.com';
        const loginUrl = loginUrlOverride || defaultLoginUrl;
        const alias = `direct-session-${Date.now()}`;
        const connector: ConnectorLike = await credentialStrategies[OAUTH_TYPES.OAUTH].connect(
            { alias, loginUrl },
            { bypass: true, persist: false }
        );

        if (connector?.hasError) {
            throw new Error(connector.errorMessage || 'Unable to establish direct connection');
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
        LOGGER.error('runQuickConnect error', e);
        if (typeof onError === 'function') {
            onError(e);
        }
        Toast.show({
            label: 'Direct connection failed',
            message: e?.message || String(e),
            variant: 'error',
            mode: 'dismissible',
        });
        throw e;
    } finally {
        if (typeof resetLoading === 'function') {
            resetLoading();
        }
    }
}
