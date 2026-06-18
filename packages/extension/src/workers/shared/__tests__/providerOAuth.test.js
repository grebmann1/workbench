import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PROVIDER_BINDINGS, isLoopbackRedirect, buildAuthorizeRequest } from '../providerOAuth.js';

test('PROVIDER_BINDINGS: codex maps to openai, xai maps to grok', () => {
    assert.equal(PROVIDER_BINDINGS.codex.llmProvider, 'openai');
    assert.equal(PROVIDER_BINDINGS.xai.llmProvider, 'grok');
});

test('isLoopbackRedirect: matches origin + path, ignores the query', () => {
    const redirect = 'http://localhost:1455/auth/callback';
    assert.equal(
        isLoopbackRedirect('http://localhost:1455/auth/callback?code=a&state=b', redirect),
        true
    );
    assert.equal(isLoopbackRedirect('http://localhost:1455/auth/callback', redirect), true);
    assert.equal(isLoopbackRedirect('http://localhost:1456/auth/callback', redirect), false);
    assert.equal(isLoopbackRedirect('http://localhost:1455/other', redirect), false);
    assert.equal(isLoopbackRedirect('not a url', redirect), false);
});

test('buildAuthorizeRequest: Codex authorize URL + pending flow (no discovery)', async () => {
    const now = 1_700_000_000_000;
    const { authorizeUrl, pending } = await buildAuthorizeRequest('codex', now);

    const url = new URL(authorizeUrl);
    assert.equal(`${url.origin}${url.pathname}`, 'https://auth.openai.com/oauth/authorize');
    assert.equal(url.searchParams.get('client_id'), 'app_EMoamEEZ73f0CkXaXp7hrann');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('originator'), 'codex_cli_rs');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:1455/auth/callback');
    assert.equal(url.searchParams.get('state'), pending.state);

    assert.equal(pending.provider, 'codex');
    assert.ok(pending.verifier);
    assert.equal(pending.redirectUri, 'http://localhost:1455/auth/callback');
    assert.equal(pending.tokenEndpoint, 'https://auth.openai.com/oauth/token');
    assert.equal(pending.createdAt, now);
});

test('buildAuthorizeRequest: rejects an unknown provider', async () => {
    await assert.rejects(buildAuthorizeRequest('nope', 0));
});
