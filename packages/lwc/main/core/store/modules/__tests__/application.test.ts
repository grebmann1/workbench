import assert from 'node:assert/strict';
import { test } from 'node:test';

function installStorage() {
    const session: Record<string, string> = {};
    const local: Record<string, string> = {};
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
        getItem: (k: string) => (k in local ? local[k] : null),
        setItem: (k: string, v: string) => {
            local[k] = String(v);
        },
        removeItem: (k: string) => {
            delete local[k];
        },
    };
    (globalThis as any).sessionStorage = {
        getItem: (k: string) => (k in session ? session[k] : null),
        setItem: (k: string, v: string) => {
            session[k] = String(v);
        },
        removeItem: (k: string) => {
            delete session[k];
        },
    };
    return { session, local };
}
function removeStorage() {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).sessionStorage;
    delete (globalThis as any).window;
}

test('application: initial state has defaults', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const s = reduxSlice.reducer(undefined, { type: '@@INIT' } as any);
        assert.equal(s.isLoading, false);
        assert.equal(s.isLoggedIn, false);
        assert.equal(s.sessionHasExpired, false);
        assert.equal(s.connector, null);
        assert.equal(s.currentApplication, null);
        assert.deepEqual(s.settings, {});
    } finally {
        removeStorage();
    }
});

test('application: updateCurrentApplication sets or clears on null payload', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.updateCurrentApplication({ application: 'soql' }));
        assert.equal(s.currentApplication, 'soql');
        s = r(s, reduxSlice.actions.updateCurrentApplication({}));
        assert.equal(s.currentApplication, null);
    } finally {
        removeStorage();
    }
});

test('application: startLoading / stopLoading manage isLoading + message', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.startLoading({ message: 'Connecting…' }));
        assert.equal(s.isLoading, true);
        assert.equal(s.isLoadingMessage, 'Connecting…');
        s = r(s, reduxSlice.actions.stopLoading({}));
        assert.equal(s.isLoading, false);
    } finally {
        removeStorage();
    }
});

test('application: login persists session; logout clears state + session', async () => {
    const { session } = installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        const connector = {
            conn: {
                instanceUrl: 'https://prod.salesforce.com',
                accessToken: 't',
                version: '59.0',
                refreshToken: 'r',
            },
            configuration: { alias: 'prod' },
        };
        let s = r(undefined, reduxSlice.actions.login({ connector }));
        assert.equal(s.isLoggedIn, true);
        assert.equal(s.sessionHasExpired, false);
        assert.ok(session['currentConnection']);
        s = r(s, reduxSlice.actions.logout({}));
        assert.equal(s.isLoggedIn, false);
        assert.equal(s.connector, null);
        assert.equal(session['currentConnection'], undefined);
    } finally {
        removeStorage();
    }
});

test('application: sessionExpired / updateConnector manage session flags', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.sessionExpired({ sessionHasExpired: true }));
        assert.equal(s.sessionHasExpired, true);
        s = r(s, reduxSlice.actions.updateConnector({ connector: { id: 'c1' } }));
        assert.equal(s.sessionHasExpired, false);
        assert.deepEqual(s.connector, { id: 'c1' });
    } finally {
        removeStorage();
    }
});

test('application: updateAiProvider normalizes values and re-syncs legacy fields', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        const s = r(undefined, reduxSlice.actions.updateAiProvider({ aiProvider: 'openai' }));
        assert.equal(s.aiProvider, 'openai');
        assert.equal(typeof s.openaiUrl, 'string');
    } finally {
        removeStorage();
    }
});

test('application: updateProviderConfig merges partial config for a provider', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        const s = r(
            undefined,
            reduxSlice.actions.updateProviderConfig({
                provider: 'openai',
                config: { apiKey: 'sk-x' },
            })
        );
        assert.equal(s.providerConfigs.openai.apiKey, 'sk-x');
        assert.equal(s.openaiKey, 'sk-x');
    } finally {
        removeStorage();
    }
});

test('application: updateProviderCatalogs records models + status', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        const s = r(
            undefined,
            reduxSlice.actions.updateProviderCatalogs({
                catalogs: {
                    openai: { status: 'ready', models: [{ label: 'm', value: 'm' }] },
                    unknown: { status: 'ready', models: [] },
                },
            })
        );
        assert.equal(s.availableModelsByProvider.openai.length, 1);
        assert.equal(s.modelCatalogStatusByProvider.openai.status, 'ready');
    } finally {
        removeStorage();
    }
});

test('application: updateSettings merges partial into settings', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../application.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, reduxSlice.actions.updateSettings({ foo: 1 }));
        s = r(s, reduxSlice.actions.updateSettings({ bar: 2 }));
        assert.deepEqual(s.settings, { foo: 1, bar: 2 });
    } finally {
        removeStorage();
    }
});
