// usernamePassword.ts
import LOGGER from 'shared/logger';
import { isUndefinedOrNull, isElectronApp, isChromeExtension } from 'shared/utils';

import type { ConnectorLike } from '../../connector';
import { getSalesforceURL, normalizeConnection } from '../base';
import { Connector } from '../connectorClass';
import { getCurrentPlatform } from '../platformService';
import { saveConfiguration } from '../web';

import { OAUTH_TYPES } from './oauthTypes';

// Absolute server base, statically replaced at build time (extension/desktop),
// defaults to the hosted Workbench server. On the web target the app is served
// from the same origin, so a relative path is used instead.
const getWorkbenchBaseUrl = (): string => {
    if (
        typeof process === 'undefined' ||
        !process ||
        typeof process.env !== 'object' ||
        typeof process.env.WORKBENCH_BASE_URL !== 'string'
    ) {
        return 'https://www.sf-workbench.com';
    }
    return (process.env.WORKBENCH_BASE_URL || 'https://www.sf-workbench.com').replace(/\/+$/, '');
};

/**
 * Endpoint for the server-side OAuth 2.0 Username-Password broker.
 * The `client_secret` needed by this grant is server-side only, so the token
 * exchange must run through the Workbench server (see
 * `packages/server/modules/oauthPassword.ts`). This replaces the retiring SOAP
 * `login()` call.
 */
function resolvePasswordGrantEndpoint(): string {
    if (isChromeExtension() || isElectronApp()) {
        return `${getWorkbenchBaseUrl()}/oauth2/password`;
    }
    return '/oauth2/password';
}

type PasswordGrantTokens = {
    access_token: string;
    instance_url: string;
    refresh_token: string | null;
    id: string | null;
};

async function requestPasswordGrant({
    username,
    password,
    loginUrl,
}: {
    username: string;
    password: string;
    loginUrl: string;
}): Promise<PasswordGrantTokens> {
    const response = await fetch(resolvePasswordGrantEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, loginUrl }),
    });

    let payload: Record<string, unknown> = {};
    try {
        payload = await response.json();
    } catch {
        // non-JSON body handled below
    }

    if (!response.ok || !payload?.access_token) {
        const message =
            (typeof payload?.error === 'string' && payload.error) ||
            `OAuth password flow failed (HTTP ${response.status})`;
        throw new Error(message);
    }

    return {
        access_token: String(payload.access_token),
        instance_url: String(payload.instance_url || loginUrl),
        refresh_token: payload.refresh_token ? String(payload.refresh_token) : null,
        id: payload.id ? String(payload.id) : null,
    };
}

/**
 * Build a jsforce connection from the tokens returned by the password grant.
 * `username`/`password` are preserved on the connection so the saved
 * configuration can transparently re-authenticate on cold start (mirroring the
 * previous SOAP-login behaviour).
 */
async function connectorFromPasswordGrant({
    username,
    password,
    loginUrl,
    alias,
}: {
    username: string;
    password: string;
    loginUrl: string;
    alias?: string;
}): Promise<ConnectorLike> {
    const platform = getCurrentPlatform();
    const normalizedUrl = getSalesforceURL(loginUrl);
    const tokens = await requestPasswordGrant({ username, password, loginUrl: normalizedUrl });

    const connectionParams = normalizeConnection(
        OAUTH_TYPES.USERNAME,
        {
            instanceUrl: tokens.instance_url,
            accessToken: tokens.access_token,
            username,
        },
        platform
    );
    const connection = new window.jsforce.Connection(connectionParams);
    if (isUndefinedOrNull(connection.accessToken)) {
        throw new Error('No access token found');
    }
    // Keep credentials + refresh token so the configuration can reconnect later.
    Object.assign(connection, { username, password, refreshToken: tokens.refresh_token });

    const connector: ConnectorLike = await Connector.createConnector({
        alias,
        connection,
        credentialType: OAUTH_TYPES.USERNAME,
    });
    if (connector.hasError) {
        throw new Error(connector.errorMessage);
    }
    return connector;
}

export async function directConnect({
    username,
    password,
    loginUrl,
    alias,
}: {
    username: string;
    password: string;
    loginUrl: string;
    alias?: string;
}): Promise<ConnectorLike> {
    return connectorFromPasswordGrant({ username, password, loginUrl, alias });
}

export async function connect(
    {
        username,
        password,
        loginUrl,
        alias,
    }: { username: string; password: string; loginUrl: string; alias?: string },
    settings: { saveFullConfiguration?: boolean } = {}
): Promise<ConnectorLike> {
    const { saveFullConfiguration = false } = settings;

    try {
        const connector = await connectorFromPasswordGrant({ username, password, loginUrl, alias });
        // Save configuration after successful connection
        if (saveFullConfiguration && !isElectronApp()) {
            await saveConfiguration(alias, connector.configuration);
        }
        return connector;
    } catch (e) {
        LOGGER.error('Username/Password connect error', e);
        throw new Error(`Username/Password Error: ${e.message}`);
    }
}
