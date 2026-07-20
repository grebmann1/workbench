import { store, APPLICATION, ERROR } from 'core/store';
import { cacheManager, CACHE_ORG_DATA_TYPES, CACHE_SESSION_CONFIG } from 'shared/cacheManager';
import LOGGER from 'shared/logger';
import { isElectronApp } from 'shared/utils';

import {
    extractName,
    inferScratchValue,
    normalizeConfiguration,
    extractConfigurationValuesFromConnection,
    inferSandboxValue,
    normalizeOrganizationType,
    deriveOrgIdFromToken,
    applyChromeCacheBusting,
} from './base';
import type { ConnectionLike, ConnectorConfiguration } from './connector';
import { OAUTH_TYPES } from './credentialStrategies/oauthTypes';
import { getConfiguration, getCurrentPlatform } from './platformService';
import { saveConfiguration } from './web';

export class Connector {
    conn: ConnectionLike | null;
    configuration: ConnectorConfiguration;

    constructor(configuration: ConnectorConfiguration, conn: ConnectionLike | null) {
        this.configuration = configuration;
        this.conn = conn;

        LOGGER.debug('Connector -->', this.configuration, this.conn);
        LOGGER.debug('Connector --> Add listeners');
        if (conn) {
            // On the Chrome extension jsforce talks to Salesforce directly (no
            // cache-busting proxy), so GETs are served from the browser HTTP
            // cache — stale read-after-write data and hung status-polling loops.
            // Wrap the transport once so every GET bypasses the cache.
            applyChromeCacheBusting(conn, getCurrentPlatform());
            this.addListeners(conn);
        }
    }

    addListeners(conn) {
        conn.on?.('refresh', () => {
            LOGGER.debug('Connector --> refresh event');
        });
        conn.on?.('error', e => {
            LOGGER.debug('Connector --> error event', e);
            store.dispatch(
                ERROR.reduxSlice.actions.addError({ message: 'JSForce error', details: e.message })
            );
        });
        conn.on?.('sessionExpired', () => {
            LOGGER.debug('Connector --> sessionExpired event');
            store.dispatch(
                APPLICATION.reduxSlice.actions.sessionExpired({ sessionHasExpired: true })
            );
        });
    }

    dispose() {
        this.conn?.dispose?.();
    }

    /** Methods */

    toPublic() {
        return {
            alias: this.configuration.alias,
            username: this.configuration.username,
            credentialType: this.configuration.credentialType,
            sessionId: this.conn?.accessToken,
            instanceUrl: this.conn?.instanceUrl,
            version: this.conn?.version,
            isImpersonating: this.isImpersonating,
            impersonatedBy: this.impersonatedBy,
        };
    }

    async generateAccessToken() {
        LOGGER.debug('--> generateAccessToken <--');
        try {
            this.resetError();
            return await this._refreshToken();
        } catch (e) {
            await this.handleError(e);
        }
        return null;
    }

    async _refreshToken() {
        if (!this.conn?.refreshToken) {
            LOGGER.warn('refreshToken - no refreshToken');
            return null;
        }
        const jwt = await this.conn.oauth2?.refreshToken?.(this.conn.refreshToken);

        return {
            ...jwt,
            frontDoorUrl: jwt.instance_url + '/secur/frontdoor.jsp?sid=' + jwt.access_token,
        };
    }

    async handleError(e) {
        LOGGER.error('Error handling error', e);
        const message = String(e?.message || '');
        if (message.includes('Session expired or invalid')) {
            if (this.conn) {
                this.conn.accessToken = null;
            }
            this.configuration.accessToken = null;
        }
        Object.assign(this.configuration, {
            _hasError: true,
            _errorMessage: e.message,
        });

        if (!isElectronApp() && this.configuration.credentialType !== OAUTH_TYPES.SESSION) {
            await saveConfiguration(this.configuration.alias, this.configuration);
        }

        store.dispatch(APPLICATION.reduxSlice.actions.stopLoading({}));
    }

    resetError() {
        this.configuration._hasError = false;
        this.configuration._errorMessage = null;
    }

    async _lightEnrichWithVersions() {
        try {
            const versions = await this.conn.request?.('/services/data/');

            const latestVersion = Array.isArray(versions)
                ? versions.sort((a, b) => b.version.localeCompare(a.version))[0]
                : undefined;

            // Enrich Connection
            Object.assign(this.conn, {
                version: latestVersion?.version || this.conn?.version,
                _versions: versions,
            });
        } catch (e) {
            LOGGER.error('Error enriching connector', e);
        }
    }

    async _enrichConnector() {
        try {
            this.resetError();
            // set for connection, to avoid refresh if it's failing
            this.conn._maxSessionRefreshRetries = 0;

            let identity = undefined;
            let versions = undefined;
            let oauthIdentityUsername: string | undefined = undefined;
            // Only fetch identity if not USERNAME credential type
            if (this.configuration.credentialType === OAUTH_TYPES.USERNAME) {
                versions = await this.conn.request?.('/services/data/');
            } else {
                [identity, versions] = await Promise.all([
                    this.conn.identity?.(),
                    this.conn.request?.('/services/data/'),
                ]);
                // Under "Login As", `conn.identity()` sometimes returns '' or undefined.
                // Capture the OAuth username (delegating admin) before we coerce identity
                // to {}, so the `_impersonatedBy` audit trail below survives that case.
                oauthIdentityUsername =
                    identity && typeof identity === 'object' ? identity.username : undefined;
                identity = identity === '' || identity === undefined ? {} : identity;
                this.conn._maxSessionRefreshRetries = 1;
            }

            const latestVersion = Array.isArray(versions)
                ? versions.sort((a, b) => b.version.localeCompare(a.version))[0]
                : undefined;

            // Login As reconciliation. `conn.identity()` returns the OAuth token
            // owner — under "Login As" that's still the delegating admin, even
            // though SOQL/Apex run as the impersonated user. /chatter/users/me
            // reports the runtime session user. When they disagree, hydrate
            // identity-shape fields with a SOQL lookup of the impersonated user
            // so every consumer of `userInfo` (My User panel, footer, agent
            // tools, frontdoor links, …) tracks impersonation.
            if (this.configuration.credentialType !== OAUTH_TYPES.USERNAME) {
                const probeVersion = latestVersion?.version || '60.0';
                const runtimeUserId = await this.conn
                    .request?.(`/services/data/v${probeVersion}/chatter/users/me`)
                    .then(r => r?.id)
                    .catch(() => null);
                LOGGER.log('runtimeUserId', runtimeUserId);
                if (runtimeUserId && runtimeUserId !== identity?.user_id) {
                    LOGGER.debug('Login As detected', {
                        oauthUser: identity?.user_id,
                        runtimeUser: runtimeUserId,
                    });
                    try {
                        const escapedId = String(runtimeUserId).replace(/'/g, "\\'");
                        const soqlResult = await this.conn.query?.(
                            `SELECT Id, Username, FirstName, LastName, Email FROM User WHERE Id = '${escapedId}' LIMIT 1`
                        );
                        LOGGER.log('soqlResult', soqlResult);
                        const r = soqlResult?.records?.[0];
                        LOGGER.log('r', r);
                        if (r) {
                            const displayName = `${r.FirstName ?? ''} ${r.LastName ?? ''}`.trim();
                            identity = {
                                ...identity,
                                user_id: r.Id,
                                id: r.Id,
                                username: r.Username,
                                preferred_username: r.Username,
                                first_name: r.FirstName,
                                last_name: r.LastName,
                                display_name: displayName || r.Username,
                                email: r.Email,
                                _impersonatedBy:
                                    oauthIdentityUsername ||
                                    identity?.username ||
                                    this.configuration.username ||
                                    null,
                            };
                        }
                    } catch (e) {
                        LOGGER.debug('Login As reconciliation SOQL failed', e?.message || e);
                    }
                }
            }
            const organizationType = normalizeOrganizationType({
                organizationType:
                    identity?.organization_type ||
                    this.configuration.organizationType ||
                    this.configuration.orgType,
                isSandbox: this.configuration.isSandbox ?? this.configuration.sandbox ?? null,
                isScratch: this.configuration.isScratch ?? this.configuration.scratch ?? null,
                instanceUrl: this.conn?.instanceUrl || this.configuration.instanceUrl,
            });
            const isScratch = inferScratchValue({
                instanceUrl: this.conn?.instanceUrl || this.configuration.instanceUrl,
                isScratch: this.configuration.isScratch ?? this.configuration.scratch ?? null,
                organizationType,
            });
            const isSandbox = inferSandboxValue({
                instanceUrl: this.conn?.instanceUrl || this.configuration.instanceUrl,
                isSandbox: this.configuration.isSandbox ?? this.configuration.sandbox ?? null,
                organizationType,
            });

            // Enrich Configuration
            Object.assign(this.configuration, {
                username: identity?.username || this.configuration.username,
                orgId:
                    identity?.organization_id ||
                    this.configuration.orgId ||
                    deriveOrgIdFromToken(this.conn?.accessToken || this.configuration.sessionId),
                userInfo: identity || this.configuration.userInfo,
                organizationType: organizationType || this.configuration.organizationType,
                orgType: organizationType || this.configuration.orgType,
                isScratch,
                scratch: isScratch,
                isSandbox,
                sandbox: isSandbox,
                alias: this.configuration.alias || identity?.username,
                id: this.configuration.id || identity?.username,
            });

            // Load Session Settings
            const sessionSettings = await cacheManager.loadOrgData(
                this.configuration.alias,
                CACHE_ORG_DATA_TYPES.SESSION_SETTINGS
            );

            let currentVersion = latestVersion;
            if (sessionSettings && sessionSettings[CACHE_SESSION_CONFIG.API_VERSION.key]) {
                currentVersion =
                    versions.find(
                        x => x.version === sessionSettings[CACHE_SESSION_CONFIG.API_VERSION.key]
                    ) || latestVersion;
            }
            const callOptions = this.conn._callOptions || {};
            if (sessionSettings && sessionSettings[CACHE_SESSION_CONFIG.CLIENT_ID.key]) {
                callOptions.client = sessionSettings[CACHE_SESSION_CONFIG.CLIENT_ID.key];
            }
            // Enrich Connection. JSForce sets `conn.userInfo` from `conn.identity()`
            // (the OAuth token owner). Under "Login As" that's the delegating admin,
            // so downstream code reading `connector.conn.userInfo` (Me panel,
            // User Explorer, agent tools, …) would target the wrong user. Overwrite
            // with the reconciled identity when we have a usable one.
            const hasReconciledIdentity = !!(
                identity &&
                (identity.id || identity.user_id || identity.username)
            );
            Object.assign(this.conn, {
                alias: this.configuration.alias,
                version: currentVersion?.version,
                _versions: versions,
                _callOptions: callOptions,
                ...(hasReconciledIdentity ? { userInfo: identity } : {}),
            });

            console.log('enricheConnector ->', {
                identity,
                configuration: this.configuration,
            });
            // Always normalize configuration before returning
            this.configuration = normalizeConfiguration(this.configuration, true);
        } catch (e) {
            console.error('Error enriching connector', e);
            LOGGER.error('Error enriching connector', e);
            await this.handleError(e);
        }
    }

    /**
     * Static method to create a Connector instance from parameters (previously in connectionModel.js).
     */
    static async createConnector({
        alias,
        connection,
        configuration,
        redirectUrl,
        credentialType,
        isEnrichDisabled,
    }: {
        alias: string;
        connection?: ConnectionLike | null;
        configuration?: ConnectorConfiguration | null;
        redirectUrl?: string | null;
        credentialType?: string;
        isEnrichDisabled?: boolean;
    }) {
        if (!configuration) {
            const { name, company } = extractName(alias);
            configuration = {
                id: alias,
                alias,
                company: company.toUpperCase(),
                name,
                credentialType,
                // Redirect URL
                redirectUrl,
            };
        }

        if (connection) {
            Object.assign(configuration, extractConfigurationValuesFromConnection(connection));
        }

        const connector = new Connector(configuration, connection);
        if (credentialType === OAUTH_TYPES.REDIRECT) {
            // If redirect credential type, we don't need to enrich the connector
            return connector;
        }
        if (!isEnrichDisabled) {
            await connector._enrichConnector();
        } else {
            // to get the latest version
            await connector._lightEnrichWithVersions();
        }
        return connector;
    }

    /**
     * Static method to create a Connector instance by alias.
     * @param {string} alias - The alias of the connection configuration.
     * @returns {Promise<Connector>} - The created Connector instance.
     */
    static async fromAlias(alias: string) {
        const configuration = await getConfiguration(alias);
        if (!configuration) {
            throw new Error(`No configuration found for alias: ${alias}`);
        }
        LOGGER.debug('fromAlias', configuration);
        // createConnector will enrich and return a Connector instance
        return await Connector.createConnector({ alias, configuration });
    }

    /** Getters */

    get redirectUrl() {
        return this.configuration?.redirectUrl;
    }

    get isRedirect() {
        return this.redirectUrl && !this.conn;
    }

    get frontDoorUrl() {
        return this.isRedirect
            ? this.redirectUrl
            : this.conn.instanceUrl + '/secur/frontdoor.jsp?sid=' + this.conn.accessToken;
    }

    get hasError() {
        return this.configuration._hasError;
    }

    get errorMessage() {
        return this.configuration._errorMessage;
    }

    get impersonatedBy(): string | null {
        const userInfo = this.configuration?.userInfo as Record<string, unknown> | undefined;
        const value = userInfo?._impersonatedBy;
        return typeof value === 'string' && value.length > 0 ? value : null;
    }

    get isImpersonating(): boolean {
        return this.impersonatedBy !== null;
    }
}
