import type { JsforceConnection } from './jsforce';

/**
 * Shape of the configuration associated with a connector (credential, alias,
 * userInfo, etc.). Kept loose because the web extension, desktop app, and
 * electron org list all store slightly different side properties on it.
 */
export type ConnectorConfiguration = {
    alias?: string;
    username?: string;
    credentialType?: string;
    orgId?: string;
    userInfo?: Record<string, unknown>;
    redirectUrl?: string;
    id?: string;
    name?: string;
    company?: string;
    _hasError?: boolean;
    _errorMessage?: string | null;
    // Escape hatch for storage-specific side fields (sfdx alias, etc.).
    [key: string]: unknown;
};

/**
 * Structural alias for a jsforce-like connection exposed by the connector.
 *
 * Historically `ConnectionLike` and `ConnectorLike` were loose `any` bags.
 * They now point at the centralised {@link JsforceConnection} type so any
 * upgrade to that type propagates automatically.
 */
export type ConnectionLike = JsforceConnection;

/**
 * A connector wraps a jsforce connection with app-specific configuration.
 * Used by the UI layer to hand off state between organisation switches.
 */
export type ConnectorLike = {
    conn: ConnectionLike | null;
    configuration: ConnectorConfiguration;
    frontDoorUrl?: string;
    redirectUrl?: string;
    isImpersonating?: boolean;
    impersonatedBy?: string | null;
    dispose?: () => void;
    // Escape hatch for UI-side ephemeral fields.
    [key: string]: unknown;
};
