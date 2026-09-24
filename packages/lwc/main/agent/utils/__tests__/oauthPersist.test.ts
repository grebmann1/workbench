import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { store, APPLICATION } from 'core/store';
import {
    buildProviderConfigCacheRecord,
    cacheManager,
    resolveLlmProviderConfigMap,
} from 'shared/cacheManager';
import {
    createDefaultProviderConfigMap,
    hasUsableProviderCredentials,
    type LlmProviderConfigMap,
    type OAuthCredentials,
} from 'shared/llm';
import { XAI_OAUTH } from 'shared/oauth';
import {
    invalidateOAuthCredentials,
    loadProviderConfigsForOAuth,
    persistRefreshedOAuthCredentials,
    refreshSubscriptionModelCatalog,
} from '../oauthPersist.ts';
import { createOAuthFetch } from '../provider/shared/oauthFetch.ts';

const credentials: OAuthCredentials = {
    access: 'cached-access',
    refresh: 'cached-refresh',
    expires: 0,
    tokenEndpoint: 'https://auth.example.test/token',
};

function oauthConfigs(): LlmProviderConfigMap {
    const configs = createDefaultProviderConfigMap();
    configs.grok = { ...configs.grok, authMode: 'oauth', oauth: credentials };
    return configs;
}

function setProviderConfigs(providerConfigs: LlmProviderConfigMap) {
    store.dispatch(APPLICATION.reduxSlice.actions.updateProviderConfigs({ providerConfigs }));
}

function installCache(t: TestContext, providerConfigs: LlmProviderConfigMap) {
    let cached = buildProviderConfigCacheRecord(providerConfigs);
    t.mock.method(cacheManager, 'loadConfig', async () => structuredClone(cached));
    t.mock.method(cacheManager, 'saveConfig', async (record: Record<string, unknown>) => {
        await Promise.resolve();
        cached = structuredClone(record);
    });
    return () => resolveLlmProviderConfigMap(cached);
}

test('cache-backed catalog refresh persists rotation when Redux still uses API-key mode', async t => {
    const readCache = installCache(t, oauthConfigs());
    const stale = createDefaultProviderConfigMap();
    stale.grok = { ...stale.grok, authMode: 'apiKey', apiKey: 'synthetic-key' };
    setProviderConfigs(stale);
    let tokenRequests = 0;
    t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
        if (String(url) === credentials.tokenEndpoint) {
            tokenRequests++;
            assert.equal(
                new URLSearchParams(String(options?.body)).get('refresh_token'),
                'cached-refresh'
            );
            return Response.json({
                access_token: 'rotated-access',
                refresh_token: 'rotated-refresh',
                expires_in: 3600,
            });
        }
        assert.equal(readCache().grok.oauth?.refresh, 'rotated-refresh');
        assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer rotated-access');
        return Response.json({ models: [{ id: 'grok-live' }] });
    });

    const first = await loadProviderConfigsForOAuth();
    const models = await refreshSubscriptionModelCatalog(first.providerConfigs);
    const nextSession = await loadProviderConfigsForOAuth();
    await refreshSubscriptionModelCatalog(nextSession.providerConfigs);

    assert.deepEqual(
        models.grok.map(model => model.value),
        ['grok-live']
    );
    assert.equal(
        store.getState().application.providerConfigs.grok.oauth?.refresh,
        'rotated-refresh'
    );
    assert.equal(nextSession.providerConfigs.grok.authMode, 'oauth');
    assert.equal(nextSession.providerConfigs.grok.oauth?.refresh, 'rotated-refresh');
    assert.equal(tokenRequests, 1);
});

test('cache-backed runtime persists rotation when Redux holds credentials from an older session', async t => {
    const readCache = installCache(t, oauthConfigs());
    const stale = oauthConfigs();
    stale.grok = {
        ...stale.grok,
        oauth: { ...credentials, access: 'older-access', refresh: 'older-refresh' },
    };
    setProviderConfigs(stale);
    t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
        if (String(url) === credentials.tokenEndpoint) {
            assert.equal(
                new URLSearchParams(String(options?.body)).get('refresh_token'),
                'cached-refresh'
            );
            return Response.json({
                access_token: 'runtime-access',
                refresh_token: 'runtime-refresh',
                expires_in: 3600,
            });
        }
        assert.equal(readCache().grok.oauth?.refresh, 'runtime-refresh');
        assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer runtime-access');
        return Response.json({ ok: true });
    });

    const { providerConfigs } = await loadProviderConfigsForOAuth();
    const request = createOAuthFetch({
        provider: XAI_OAUTH,
        credentials: providerConfigs.grok.oauth!,
        onTokenRefresh: (next, previous) =>
            persistRefreshedOAuthCredentials('grok', next, previous),
        onAuthInvalid: previous => invalidateOAuthCredentials('grok', previous),
    });
    assert.equal((await request('https://api.example.test/completions')).status, 200);
    assert.equal(readCache().grok.oauth?.refresh, 'runtime-refresh');
    assert.equal(
        store.getState().application.providerConfigs.grok.oauth?.refresh,
        'runtime-refresh'
    );
});

test('cache-backed catalog keeps loaded models on transient failure and offers sign-in after invalid_grant', async t => {
    const readCache = installCache(t, oauthConfigs());
    setProviderConfigs(createDefaultProviderConfigMap());
    const loadedModels = [{ label: 'Existing model', value: 'grok-existing' }];
    store.dispatch(
        APPLICATION.reduxSlice.actions.updateSubscriptionModels({ models: { grok: loadedModels } })
    );
    let status = 503;
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json(
            { error: status === 400 ? 'invalid_grant' : 'temporarily_unavailable' },
            { status }
        )
    );

    const { providerConfigs } = await loadProviderConfigsForOAuth();
    await refreshSubscriptionModelCatalog(providerConfigs);
    assert.deepEqual(store.getState().application.subscriptionModelsByProvider.grok, loadedModels);
    assert.equal(readCache().grok.oauth?.refresh, 'cached-refresh');

    status = 400;
    await refreshSubscriptionModelCatalog(providerConfigs);
    assert.deepEqual(store.getState().application.subscriptionModelsByProvider.grok, []);
    assert.equal(
        hasUsableProviderCredentials(store.getState().application.providerConfigs.grok),
        false
    );
    assert.equal(readCache().grok.authMode, 'oauth');
    assert.equal(readCache().grok.oauth, undefined);
});

test('a disconnect during a cache read wins over its stale credential snapshot', async t => {
    const original = oauthConfigs();
    const readCache = installCache(t, original);
    setProviderConfigs(original);
    let releaseRead!: (record: Record<string, unknown>) => void;
    let markReadStarted!: () => void;
    const readStarted = new Promise<void>(resolve => {
        markReadStarted = resolve;
    });
    t.mock.method(
        cacheManager,
        'loadConfig',
        () =>
            new Promise<Record<string, unknown>>(resolve => {
                releaseRead = resolve;
                markReadStarted();
            })
    );
    const loading = loadProviderConfigsForOAuth();
    await readStarted;
    const disconnected = createDefaultProviderConfigMap();
    disconnected.grok = { ...disconnected.grok, authMode: 'apiKey' };
    setProviderConfigs(disconnected);
    await cacheManager.saveConfig(buildProviderConfigCacheRecord(disconnected));
    releaseRead(buildProviderConfigCacheRecord(original));
    const { providerConfigs } = await loading;
    await persistRefreshedOAuthCredentials(
        'grok',
        { ...credentials, access: 'late-access' },
        credentials
    );

    assert.equal(providerConfigs.grok.authMode, 'apiKey');
    assert.equal(providerConfigs.grok.oauth, undefined);
    assert.equal(store.getState().application.providerConfigs.grok.oauth, undefined);
    assert.equal(readCache().grok.oauth, undefined);
});

test('a refresh finishing after a new sign-in cannot replace or invalidate the new account', async t => {
    const readCache = installCache(t, oauthConfigs());
    setProviderConfigs(createDefaultProviderConfigMap());
    const replacement = oauthConfigs();
    replacement.grok = {
        ...replacement.grok,
        oauth: { ...credentials, access: 'replacement-access', refresh: 'replacement-refresh' },
    };
    t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
        if (String(url) === credentials.tokenEndpoint) {
            setProviderConfigs(replacement);
            await cacheManager.saveConfig(buildProviderConfigCacheRecord(replacement));
            return Response.json({
                access_token: 'late-access',
                refresh_token: 'late-refresh',
                expires_in: 3600,
            });
        }
        return Response.json({ ok: true });
    });
    const { providerConfigs } = await loadProviderConfigsForOAuth();
    const request = createOAuthFetch({
        provider: XAI_OAUTH,
        credentials: providerConfigs.grok.oauth!,
        onTokenRefresh: (next, previous) =>
            persistRefreshedOAuthCredentials('grok', next, previous),
    });
    await request('https://api.example.test/completions');
    await invalidateOAuthCredentials('grok', credentials);

    assert.equal(
        store.getState().application.providerConfigs.grok.oauth?.access,
        'replacement-access'
    );
    assert.equal(readCache().grok.oauth?.refresh, 'replacement-refresh');
});
