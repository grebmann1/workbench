// OpenAI Codex (ChatGPT subscription) OAuth constants. Everything provider-specific lives
// here so a future provider-side change (client_id, endpoints, originator, port) is a
// one-file edit — see the roadmap compatibility note. These reuse the public Codex CLI
// client_id and are the CLI integration surface, not a documented third-party API.

import type { OAuthProviderConfig } from '../oauthClient';

/** Fixed loopback port the Codex CLI client_id is registered against (must be 1455). */
export const CODEX_OAUTH_PORT = 1455;
export const CODEX_OAUTH_REDIRECT_URI = `http://localhost:${CODEX_OAUTH_PORT}/auth/callback`;

export const CODEX_OAUTH: OAuthProviderConfig = {
    id: 'codex',
    authorizeUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    scope: 'openid profile email offline_access',
    redirectUri: CODEX_OAUTH_REDIRECT_URI,
    // Genuine Codex CLI authorize params: originator identifies the CLI, the simplified flow
    // enables the device-style consent, and id_token_add_organizations surfaces the org/
    // account claims used to derive the ChatGPT-Account-Id header.
    extraAuthParams: {
        originator: 'codex_cli_rs',
        codex_cli_simplified_flow: 'true',
        id_token_add_organizations: 'true',
    },
    refreshSkewMs: 30 * 1000,
};
