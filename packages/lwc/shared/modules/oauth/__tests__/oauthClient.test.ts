import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    buildAuthorizeUrl,
    credentialsFromTokenPayload,
    isExpired,
    refreshCredentials,
    ensureFreshCredentials,
    parseCallback,
    createPendingFlowStore,
    validateXaiEndpoint,
    xaiDiscovery,
    CODEX_OAUTH,
    XAI_OAUTH,
} from '../oauth.ts';

function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.sig`;
}

/** A fetch stub that records calls and returns a fixed JSON body. */
function mockFetch(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = (async (url: string | URL, requestInit?: RequestInit) => {
        calls.push({ url: String(url), body: String(requestInit?.body ?? '') });
        return {
            ok: init.ok ?? true,
            status: init.status ?? 200,
            json: async () => payload,
            text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
        } as Response;
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
}

test('buildAuthorizeUrl: emits PKCE, state/nonce and extra params', () => {
    const url = new URL(
        buildAuthorizeUrl({
            authorizeEndpoint: 'https://auth.openai.com/oauth/authorize',
            clientId: 'cid',
            redirectUri: 'http://localhost:1455/auth/callback',
            scope: 'openid offline_access',
            challenge: 'chal',
            state: 'st',
            nonce: 'no',
            extraParams: { originator: 'codex_cli_rs', codex_cli_simplified_flow: 'true' },
        })
    );
    assert.equal(`${url.origin}${url.pathname}`, 'https://auth.openai.com/oauth/authorize');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), 'cid');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:1455/auth/callback');
    assert.equal(url.searchParams.get('code_challenge'), 'chal');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('state'), 'st');
    assert.equal(url.searchParams.get('nonce'), 'no');
    assert.equal(url.searchParams.get('originator'), 'codex_cli_rs');
});

test('credentialsFromTokenPayload: bakes skew into expiry and pulls accountId', () => {
    const creds = credentialsFromTokenPayload(
        {
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: makeJwt({ chatgpt_account_id: 'acct' }),
        },
        { now: 1_000_000, refreshSkewMs: 30_000, tokenEndpoint: 'https://token.test' }
    );
    assert.equal(creds.access, 'at');
    assert.equal(creds.refresh, 'rt');
    assert.equal(creds.expires, 1_000_000 + 3_600_000 - 30_000);
    assert.equal(creds.accountId, 'acct');
    assert.equal(creds.tokenType, 'Bearer');
    assert.equal(creds.tokenEndpoint, 'https://token.test');
});

test('credentialsFromTokenPayload: keeps prior refresh token when response omits one', () => {
    const creds = credentialsFromTokenPayload(
        { access_token: 'at2', expires_in: 100 },
        { now: 0, fallbackRefresh: 'old-rt' }
    );
    assert.equal(creds.refresh, 'old-rt');
});

test('credentialsFromTokenPayload: throws without an access token', () => {
    assert.throws(() => credentialsFromTokenPayload({ refresh_token: 'rt' }, { now: 0 }));
});

test('isExpired: honors the stored expiry and a missing access token', () => {
    assert.equal(isExpired({ access: 'a', refresh: 'r', expires: 100 }, 50), false);
    assert.equal(isExpired({ access: 'a', refresh: 'r', expires: 100 }, 100), true);
    assert.equal(isExpired({ access: 'a', refresh: 'r', expires: 0 }, 50), true);
    assert.equal(isExpired({ access: '', refresh: 'r', expires: 999 }, 0), true);
});

test('refreshCredentials: posts a refresh_token grant to the captured endpoint', async () => {
    const { fetchImpl, calls } = mockFetch({
        access_token: 'new',
        refresh_token: 'new-rt',
        expires_in: 3600,
    });
    const creds = await refreshCredentials(
        { access: 'old', refresh: 'old-rt', expires: 0, tokenEndpoint: 'https://token.test' },
        CODEX_OAUTH,
        { now: 0, fetchImpl }
    );
    assert.equal(creds.access, 'new');
    assert.equal(creds.refresh, 'new-rt');
    assert.equal(calls[0].url, 'https://token.test');
    assert.match(calls[0].body, /grant_type=refresh_token/);
    assert.match(calls[0].body, /refresh_token=old-rt/);
});

test('refreshCredentials: falls back to provider.tokenUrl, and throws without a refresh token', async () => {
    const { fetchImpl, calls } = mockFetch({ access_token: 'n', expires_in: 60 });
    await refreshCredentials({ access: 'o', refresh: 'r', expires: 0 }, CODEX_OAUTH, {
        now: 0,
        fetchImpl,
    });
    assert.equal(calls[0].url, CODEX_OAUTH.tokenUrl);

    await assert.rejects(
        refreshCredentials({ access: 'o', refresh: '', expires: 0 }, CODEX_OAUTH, { now: 0 })
    );
});

test('ensureFreshCredentials: returns fresh creds as-is, refreshes expired ones', async () => {
    const fresh = { access: 'a', refresh: 'r', expires: 10_000 };
    assert.equal(await ensureFreshCredentials(fresh, CODEX_OAUTH, { now: 0 }), fresh);

    const { fetchImpl } = mockFetch({ access_token: 'refreshed', expires_in: 3600 });
    const out = await ensureFreshCredentials(
        { access: 'a', refresh: 'r', expires: 0, tokenEndpoint: 'https://t.test' },
        CODEX_OAUTH,
        { now: 100, fetchImpl }
    );
    assert.equal(out.access, 'refreshed');
});

test('parseCallback: full URL, bare query, bare code, error, empty', () => {
    assert.deepEqual(parseCallback('http://127.0.0.1:56121/callback?code=abc&state=xyz'), {
        code: 'abc',
        state: 'xyz',
        error: undefined,
        errorDescription: undefined,
    });
    const q = parseCallback('code=abc&state=xyz');
    assert.equal(q.code, 'abc');
    assert.equal(q.state, 'xyz');
    assert.deepEqual(parseCallback('abcDEF1234567890ghijk'), { code: 'abcDEF1234567890ghijk' });
    const err = parseCallback('http://x/callback?error=access_denied&error_description=nope');
    assert.equal(err.error, 'access_denied');
    assert.equal(err.errorDescription, 'nope');
    assert.deepEqual(parseCallback('   '), {});
});

test('createPendingFlowStore: single-use take, TTL, unknown state', () => {
    const store = createPendingFlowStore(1000);
    const flow = { state: 's', verifier: 'v', redirectUri: 'r', provider: 'codex', createdAt: 0 };
    store.put(flow);
    assert.equal(store.size, 1);
    assert.equal(store.take('s', 10)?.verifier, 'v');
    assert.equal(store.size, 0);
    assert.equal(store.take('s', 10), null); // already consumed

    store.put({ ...flow, state: 's2', createdAt: 0 });
    assert.equal(store.take('s2', 2000), null); // expired: 2000 - 0 > 1000
    assert.equal(store.take(undefined, 0), null);
    assert.equal(store.take('missing', 0), null);
});

test('validateXaiEndpoint: pins https on x.ai / *.x.ai', () => {
    assert.equal(
        validateXaiEndpoint('https://auth.x.ai/oauth2/auth'),
        'https://auth.x.ai/oauth2/auth'
    );
    assert.equal(validateXaiEndpoint('https://x.ai/token'), 'https://x.ai/token');
    assert.throws(() => validateXaiEndpoint('http://auth.x.ai/x')); // not https
    assert.throws(() => validateXaiEndpoint('https://evil.com/x'));
    assert.throws(() => validateXaiEndpoint('https://x.ai.evil.com/x'));
    assert.throws(() => validateXaiEndpoint('not a url'));
});

test('xaiDiscovery: returns validated endpoints, rejects bad host or failure', async () => {
    const ok = mockFetch({
        authorization_endpoint: 'https://auth.x.ai/oauth2/auth',
        token_endpoint: 'https://auth.x.ai/oauth2/token',
    });
    const discovery = await xaiDiscovery(ok.fetchImpl);
    assert.equal(discovery.token_endpoint, 'https://auth.x.ai/oauth2/token');

    const evil = mockFetch({
        authorization_endpoint: 'https://evil.com/auth',
        token_endpoint: 'https://evil.com/token',
    });
    await assert.rejects(xaiDiscovery(evil.fetchImpl));

    const failed = mockFetch({}, { ok: false, status: 500 });
    await assert.rejects(xaiDiscovery(failed.fetchImpl));
});

test('provider constants: Codex + xAI reuse the CLI client_ids', () => {
    assert.equal(CODEX_OAUTH.clientId, 'app_EMoamEEZ73f0CkXaXp7hrann');
    assert.equal(CODEX_OAUTH.redirectUri, 'http://localhost:1455/auth/callback');
    assert.equal(CODEX_OAUTH.extraAuthParams?.originator, 'codex_cli_rs');
    assert.equal(XAI_OAUTH.clientId, 'b1a00492-073a-47ea-816f-4c329264a828');
    assert.equal(XAI_OAUTH.usesDiscovery, true);
    assert.ok(XAI_OAUTH.scope.includes('grok-cli:access'));
});
