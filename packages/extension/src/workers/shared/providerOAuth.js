// Chrome MV3 extension OAuth transport for LLM provider sign-in (Codex / xAI).
//
// Flow (event-driven so it survives service-worker suspension):
//   1. startProviderOAuth: PKCE + authorize URL, store the pending flow in
//      chrome.storage.session (NOT in-memory — the worker can be killed while the user logs
//      in), open the consent popup.
//   2. A top-level chrome.webNavigation listener (registered in background.js, filtered to the
//      loopback host) wakes the worker on the redirect and calls handleOAuthRedirect, which
//      validates state single-use, exchanges the code, persists credentials, and swaps the
//      popup to a branded success page.
//
// The pure helpers (PROVIDER_BINDINGS, isLoopbackRedirect, buildAuthorizeRequest) are exported
// for unit testing; the chrome.* orchestration is kept thin.

import {
    buildAuthorizeUrl,
    credentialsFromTokenPayload,
    exchangeAuthCode,
    parseCallback,
    pkcePair,
    randomToken,
    xaiDiscovery,
    CODEX_OAUTH,
    XAI_OAUTH,
} from 'shared/oauth';
import {
    buildProviderConfigCacheRecord,
    cacheManager,
    getLlmProviderConfigCacheKeys,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';
import { normalizeProviderConfigMap } from 'shared/llm';

/** Maps a sign-in provider id to its OAuth config + the LLM provider whose config stores the
 *  resulting credentials (Codex is an auth-mode on `openai`, xAI on `grok`). */
export const PROVIDER_BINDINGS = {
    codex: { oauth: CODEX_OAUTH, llmProvider: 'openai' },
    xai: { oauth: XAI_OAUTH, llmProvider: 'grok' },
};

const PENDING_KEY = 'oauth_pending_flow';
const PENDING_TTL_MS = 10 * 60 * 1000;

/** True when `url` is the OAuth loopback redirect for the given pending flow (origin + path
 *  match, ignoring the query that carries the code/state). */
export function isLoopbackRedirect(url, redirectUri) {
    try {
        const target = new URL(url);
        const expected = new URL(redirectUri);
        return target.origin === expected.origin && target.pathname === expected.pathname;
    } catch {
        return false;
    }
}

async function resolveEndpoints(cfg) {
    if (cfg.usesDiscovery) {
        const discovery = await xaiDiscovery();
        return {
            authorizeEndpoint: discovery.authorization_endpoint,
            tokenEndpoint: discovery.token_endpoint,
        };
    }
    return { authorizeEndpoint: cfg.authorizeUrl, tokenEndpoint: cfg.tokenUrl };
}

/** Build the authorize URL + the pending-flow record for a provider (pure aside from PKCE
 *  randomness and the xAI discovery fetch). Exported for testing. */
export async function buildAuthorizeRequest(providerId, now) {
    const binding = PROVIDER_BINDINGS[providerId];
    if (!binding) throw new Error(`Unknown OAuth provider: ${providerId}`);
    const cfg = binding.oauth;
    const { authorizeEndpoint, tokenEndpoint } = await resolveEndpoints(cfg);
    const { verifier, challenge } = await pkcePair();
    const state = randomToken();
    const nonce = randomToken();
    const authorizeUrl = buildAuthorizeUrl({
        authorizeEndpoint,
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        scope: cfg.scope,
        challenge,
        state,
        nonce,
        extraParams: cfg.extraAuthParams,
    });
    const pending = {
        provider: providerId,
        state,
        verifier,
        nonce,
        redirectUri: cfg.redirectUri,
        tokenEndpoint,
        createdAt: now,
    };
    return { authorizeUrl, pending };
}

/** Persist refreshed/initial OAuth credentials onto the LLM provider config in the cache. */
async function persistCredentials(llmProvider, credentials) {
    const cached = await cacheManager.loadConfig(getLlmProviderConfigCacheKeys());
    const currentMap = resolveLlmProviderConfigMap(cached);
    const nextMap = normalizeProviderConfigMap({
        ...currentMap,
        [llmProvider]: { ...currentMap[llmProvider], authMode: 'oauth', oauth: credentials },
    });
    await cacheManager.saveConfig(buildProviderConfigCacheRecord(nextMap));
}

/** Begin a provider sign-in: store the pending flow and open the consent popup. */
export async function startProviderOAuth({ provider }) {
    const { authorizeUrl, pending } = await buildAuthorizeRequest(provider, Date.now());
    await chrome.storage.session.set({ [PENDING_KEY]: pending });
    const win = await chrome.windows.create({
        url: authorizeUrl,
        type: 'popup',
        width: 600,
        height: 760,
    });
    return { started: true, windowId: win?.id, authorizeUrl };
}

/**
 * Handle a loopback redirect captured by webNavigation. Returns the signed-in
 * { provider, credentials } on success, or null when the navigation isn't our callback.
 * Throws (after clearing the pending flow) on state mismatch, OAuth error, or expiry.
 */
export async function handleOAuthRedirect(details) {
    const stored = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    if (!stored || !isLoopbackRedirect(details.url, stored.redirectUri)) {
        return null;
    }
    // Single-use: consume the pending flow before doing anything else.
    await chrome.storage.session.remove(PENDING_KEY);

    if (Date.now() - stored.createdAt > PENDING_TTL_MS) {
        throw new Error('Sign-in timed out. Please try again.');
    }

    const callback = parseCallback(details.url, { host: '127.0.0.1', path: '/callback' });
    if (callback.error) {
        throw new Error(callback.errorDescription || callback.error);
    }
    if (callback.state !== stored.state) {
        throw new Error('Sign-in failed: state mismatch.');
    }
    if (!callback.code) {
        throw new Error('Sign-in failed: no authorization code returned.');
    }

    const binding = PROVIDER_BINDINGS[stored.provider];
    const cfg = binding.oauth;
    const payload = await exchangeAuthCode({
        tokenEndpoint: stored.tokenEndpoint,
        clientId: cfg.clientId,
        code: callback.code,
        redirectUri: stored.redirectUri,
        verifier: stored.verifier,
    });
    const credentials = credentialsFromTokenPayload(payload, {
        now: Date.now(),
        refreshSkewMs: cfg.refreshSkewMs,
        tokenEndpoint: stored.tokenEndpoint,
    });
    await persistCredentials(binding.llmProvider, credentials);

    if (typeof details.tabId === 'number') {
        try {
            await chrome.tabs.update(details.tabId, {
                url: chrome.runtime.getURL('views/oauth-success.html'),
            });
        } catch {
            // Popup may already be gone — the sign-in still succeeded.
        }
    }
    return { provider: binding.llmProvider, credentials };
}

/**
 * Manual-paste fallback: exchange a user-pasted authorization code against the in-flight
 * pending flow. Required for xAI, which delivers the code via a CORS fetch to the loopback
 * (no browser navigation to capture) and shows the code for manual entry when that fails.
 * Accepts a bare code, a full redirect URL, or a `?code=…&state=…` query.
 */
export async function submitProviderOAuthCode({ provider, code }) {
    const stored = (await chrome.storage.session.get(PENDING_KEY))[PENDING_KEY];
    if (!stored || stored.provider !== provider) {
        throw new Error('No sign-in is in progress. Click Sign in again, then paste the code.');
    }
    const parsed = parseCallback(String(code || ''), { host: '127.0.0.1', path: '/callback' });
    if (parsed.error) {
        throw new Error(parsed.errorDescription || parsed.error);
    }
    if (!parsed.code) {
        throw new Error("That doesn't look like an authorization code.");
    }
    // A pasted full URL/query carries state to validate; a bare code skips it (single-use is
    // still enforced by consuming the pending flow on success).
    if (parsed.state && parsed.state !== stored.state) {
        throw new Error('Sign-in failed: state mismatch.');
    }

    const binding = PROVIDER_BINDINGS[stored.provider];
    const cfg = binding.oauth;
    const payload = await exchangeAuthCode({
        tokenEndpoint: stored.tokenEndpoint,
        clientId: cfg.clientId,
        code: parsed.code,
        redirectUri: stored.redirectUri,
        verifier: stored.verifier,
    });
    const credentials = credentialsFromTokenPayload(payload, {
        now: Date.now(),
        refreshSkewMs: cfg.refreshSkewMs,
        tokenEndpoint: stored.tokenEndpoint,
    });
    await persistCredentials(binding.llmProvider, credentials);
    await chrome.storage.session.remove(PENDING_KEY);
    return { provider: binding.llmProvider, credentials };
}
