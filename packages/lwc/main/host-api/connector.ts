/**
 * Connector contracts exposed to extension Apps.
 *
 * Only the structural types leak out — concrete `Connector` and credential
 * strategies remain private to core because extensions should never
 * instantiate a connector themselves; they consume the one provided by
 * `host-api/store` (via `state.application.connector`).
 */
export type { ConnectorLike, ConnectionLike, ConnectorConfiguration } from 'core/connector';
