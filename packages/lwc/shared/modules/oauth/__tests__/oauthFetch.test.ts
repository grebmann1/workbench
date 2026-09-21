import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthenticatedOAuthFetch } from '../oauthFetch.ts';
import { OAuthAuthorizationError } from '../oauthClient.ts';
import { CODEX_OAUTH } from '../providers/codex.ts';
import {
    createDefaultProviderConfigMap,
    fetchSubscriptionModels,
    type OAuthCredentials,
} from '../../llm/llm.ts';

const credentials: OAuthCredentials = {
    access: 'old',
    refresh: 'old-refresh',
    expires: 0,
    accountId: 'account',
};
const future = 4_102_444_800_000;

test('expired xAI catalog refresh persists the rotated credentials before listing and reuses them', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.grok = {
        ...configs.grok,
        authMode: 'oauth',
        oauth: { ...credentials, tokenEndpoint: 'https://auth.x.ai/token' },
    };
    let tokenRequests = 0;
    const fetchImpl: typeof fetch = async (url, options) => {
        if (String(url) === 'https://auth.x.ai/token') {
            tokenRequests++;
            assert.equal(
                new URLSearchParams(String(options?.body)).get('refresh_token'),
                'old-refresh'
            );
            return Response.json({
                access_token: 'new',
                refresh_token: 'rotated',
                expires_in: 3600,
            });
        }
        assert.equal(configs.grok.oauth?.refresh, 'rotated');
        assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer new');
        return Response.json({ models: [{ id: 'grok-live' }] });
    };
    const first = await fetchSubscriptionModels(configs, fetchImpl, {
        onTokenRefresh: async (provider, next) => {
            await Promise.resolve();
            configs[provider] = { ...configs[provider], oauth: next };
        },
    });
    const second = await fetchSubscriptionModels(configs, fetchImpl);
    assert.deepEqual(
        first.grok?.map(model => model.value),
        ['grok-live']
    );
    assert.deepEqual(second.grok, first.grok);
    assert.equal(tokenRequests, 1);
});

test('catalog and runtime instances share refresh rotation and retain the account header', async () => {
    let tokenRequests = 0;
    const fetchImpl: typeof fetch = async (url, options) => {
        if (String(url) === CODEX_OAUTH.tokenUrl) {
            tokenRequests++;
            await Promise.resolve();
            return Response.json({
                access_token: 'new',
                refresh_token: 'rotated',
                expires_in: 3600,
            });
        }
        assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer new');
        assert.equal(new Headers(options?.headers).get('chatgpt-account-id'), 'account');
        return Response.json({ models: [{ slug: 'codex-live' }] });
    };
    const a = createAuthenticatedOAuthFetch({ credentials, provider: CODEX_OAUTH, fetchImpl });
    const b = createAuthenticatedOAuthFetch({
        credentials: { ...credentials },
        provider: CODEX_OAUTH,
        fetchImpl,
    });
    const results = await Promise.all([
        a('https://chatgpt.com/models'),
        b('https://chatgpt.com/responses'),
    ]);
    assert.deepEqual(
        results.map(result => result.status),
        [200, 200]
    );
    assert.equal(tokenRequests, 1);
});

test('a delayed concurrent 401 retries the already refreshed token without rotating twice', async () => {
    let release: (response: Response) => void;
    const delayed = new Promise<Response>(resolve => {
        release = resolve;
    });
    let oldRequests = 0;
    let tokenRequests = 0;
    const fetchImpl: typeof fetch = async (url, options) => {
        if (String(url) === CODEX_OAUTH.tokenUrl) {
            tokenRequests++;
            return Response.json({ access_token: 'new', expires_in: 3600 });
        }
        if (new Headers(options?.headers).get('authorization') === 'Bearer old') {
            oldRequests++;
            return oldRequests === 1 ? delayed : new Response(null, { status: 401 });
        }
        return new Response(null, { status: 200 });
    };
    const request = createAuthenticatedOAuthFetch({
        credentials: { ...credentials, expires: future },
        provider: CODEX_OAUTH,
        fetchImpl,
    });
    const first = request('https://chatgpt.com/responses');
    assert.equal((await request('https://chatgpt.com/responses')).status, 200);
    release!(new Response(null, { status: 401 }));
    assert.equal((await first).status, 200);
    assert.equal(tokenRequests, 1);
});

test('transient token endpoint failure preserves credentials and catalog; invalid_grant requires sign-in', async () => {
    const configs = createDefaultProviderConfigMap();
    configs.openai = { ...configs.openai, authMode: 'oauth', oauth: credentials };
    let invalidated = false;
    let failure = 503;
    const fetchImpl: typeof fetch = async url => {
        if (String(url).includes('registry.npmjs.org')) return Response.json({ version: '1.0.0' });
        return Response.json(
            { error: failure === 400 ? 'invalid_grant' : 'temporarily_unavailable' },
            { status: failure }
        );
    };
    const lifecycle = {
        onAuthInvalid: () => {
            invalidated = true;
        },
    };
    const transient = await fetchSubscriptionModels(configs, fetchImpl, lifecycle);
    assert.equal(Object.hasOwn(transient, 'openai'), false);
    assert.equal(invalidated, false);
    failure = 400;
    const revoked = await fetchSubscriptionModels(configs, fetchImpl, lifecycle);
    assert.deepEqual(revoked.openai, []);
    assert.equal(invalidated, true);
});

test('a second rejected bearer invalidates authorization instead of looping refresh', async () => {
    let tokens = 0;
    let invalidated: OAuthCredentials | undefined;
    const fetchImpl: typeof fetch = async url => {
        if (String(url) === CODEX_OAUTH.tokenUrl) {
            tokens++;
            return Response.json({ access_token: 'new', expires_in: 3600 });
        }
        return new Response(null, { status: 401 });
    };
    const request = createAuthenticatedOAuthFetch({
        credentials: { ...credentials, expires: future },
        provider: CODEX_OAUTH,
        fetchImpl,
        onAuthInvalid: previous => {
            invalidated = previous;
        },
    });
    await assert.rejects(request('https://chatgpt.com/responses'), OAuthAuthorizationError);
    assert.equal(tokens, 1);
    assert.equal(invalidated?.access, 'new');
});
