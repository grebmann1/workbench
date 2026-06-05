// xAI (Grok / SuperGrok subscription) OAuth constants + OIDC discovery. Endpoints come from
// discovery and are validated to the x.ai host before use. Reuses the public Grok CLI
// client_id (CLI integration surface, may change — see roadmap compatibility note).

import type { OAuthProviderConfig } from '../oauthClient';

export const XAI_OAUTH_ISSUER = 'https://auth.x.ai';
export const XAI_OAUTH_DISCOVERY_URL = `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`;

/** Preferred loopback port (RFC 8252 allows falling back to an ephemeral port). */
export const XAI_OAUTH_PORT = 56121;
export const XAI_OAUTH_REDIRECT_HOST = '127.0.0.1';
export const XAI_OAUTH_REDIRECT_PATH = '/callback';

export const XAI_OAUTH: OAuthProviderConfig = {
    id: 'xai',
    // Resolved at login via OIDC discovery (see xaiDiscovery); left blank intentionally.
    authorizeUrl: '',
    tokenUrl: '',
    clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
    scope: 'openid profile email offline_access grok-cli:access api:access',
    redirectUri: `http://${XAI_OAUTH_REDIRECT_HOST}:${XAI_OAUTH_PORT}${XAI_OAUTH_REDIRECT_PATH}`,
    refreshSkewMs: 2 * 60 * 1000,
    usesDiscovery: true,
    discoveryUrl: XAI_OAUTH_DISCOVERY_URL,
};

export type XaiDiscovery = {
    authorization_endpoint: string;
    token_endpoint: string;
};

/** Reject any discovery endpoint that isn't HTTPS on x.ai / *.x.ai — discovery responses are
 *  attacker-influenceable, so the host must be pinned before we ever send a token there. */
export function validateXaiEndpoint(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`xAI OAuth discovery returned an invalid endpoint: ${url}`);
    }
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'x.ai' && !host.endsWith('.x.ai'))) {
        throw new Error(`xAI OAuth discovery returned an unexpected endpoint: ${url}`);
    }
    return url;
}

/** Fetch + validate the xAI OIDC discovery document. `fetchImpl` is injectable for tests. */
export async function xaiDiscovery(fetchImpl: typeof fetch = fetch): Promise<XaiDiscovery> {
    const response = await fetchImpl(XAI_OAUTH_DISCOVERY_URL, {
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`xAI OAuth discovery failed: ${response.status}`);
    }
    const data = (await response.json()) as Partial<XaiDiscovery>;
    if (!data.authorization_endpoint || !data.token_endpoint) {
        throw new Error('xAI OAuth discovery response did not include authorization/token endpoints');
    }
    return {
        authorization_endpoint: validateXaiEndpoint(data.authorization_endpoint),
        token_endpoint: validateXaiEndpoint(data.token_endpoint),
    };
}
