import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from '../../../../../../../tools/testing/loadTypeScriptModule.mjs';
import { resolveTaskTarget } from '../taskNavigation';

function harness({ choice, connect, configuration } = {}) {
    const routes = [];
    const selected = [];
    const saved = [];
    const connector = { configuration: { alias: 'isolated-test' } };
    const state = { application: { connector } };
    let opens = 0;
    let connections = 0;
    const actions = { stopLoading: () => ({}), startLoading: () => ({}), logout: () => ({}) };
    const { default: App } = loadTypeScriptModule(
        new URL('../app.ts', import.meta.url),
        {
            'core/applications': { APP_LIST: [{ path: 'soql', name: 'soql/app', label: 'SOQL' }] },
            'connection/connectPrompt': {
                open: async () => {
                    opens++;
                    return typeof choice === 'function' ? choice() : choice;
                },
            },
            'connection/quickConnect': {
                runQuickConnect: async options => {
                    connections++;
                    await connect?.(app, options);
                },
            },
            'core/connector': {
                getConfiguration: async () => configuration,
                saveSession: async value => saved.push(value),
            },
            'core/desktopBridge': {},
            'core/store': {
                store: { getState: () => state, dispatch() {} },
                APPLICATION: { reduxSlice: { actions } },
                DOCUMENT: { reduxSlices: { RECENT: { actions: { loadFromStorage: () => ({}) } } } },
            },
            lwc: { LightningElement: class {}, api() {}, track() {}, wire: () => () => {} },
            'lwr/navigation': { navigate: (_context, route) => routes.push(route) },
            'shared/logger': {},
            'shared/cacheManager': {},
            'shared/store': {},
            'shared/utils': {
                isElectronApp: () => false,
                isChromeExtension: () => true,
                isUndefinedOrNull: value => value == null,
                isNotUndefinedOrNull: value => value != null,
            },
            './background': { connectToBackgroundWithIdentity() {}, disconnectFromBackground() {} },
            './cache': {},
            './session': {},
            './shortcuts': {},
            './tabNavigation': {},
            './taskNavigation': { resolveTaskTarget },
            './layout': {},
            './constants': {},
        },
        { window: { innerWidth: 1440 } }
    );
    const app = new App();
    app.pageHasLoaded = true;
    app.openSpecificModule = () => {};
    app.handleApplicationSelection = name => selected.push(name);
    return {
        app,
        routes,
        selected,
        saved,
        connector,
        counts: () => ({ opens, connections }),
        request: path => app.handleConnectRequest({ detail: { path }, stopPropagation() {} }),
    };
}

test('a successful quick connection resumes the selected task once', async () => {
    const h = harness({
        choice: { loginUrl: 'https://test.salesforce.com' },
        connect: async (app, options) => {
            assert.equal(options.loginUrl, 'https://test.salesforce.com');
            await app.handleLogin(h.connector);
        },
    });
    await h.request('soql');
    assert.equal(h.routes.at(-1).state.applicationName, 'soql');
    assert.deepEqual(h.selected, ['soql/app']);
    assert.equal(h.app.pendingTaskPath, null);
    await h.app.handleLogin(h.connector);
    assert.equal(h.routes.length, 1);
    assert.equal(h.app.isConnecting, false);
});

test('saved connection continuation is cleared on unrelated navigation or cancellation', async () => {
    const h = harness({ choice: { manageConnections: true } });
    await h.request('soql');
    assert.equal(h.routes.at(-1).state.applicationName, 'connections');
    h.app.handleNavigation({ type: 'application', state: { applicationName: 'connections' } });
    assert.equal(h.app.pendingTaskPath, 'soql');
    await h.app.handleLogin(h.connector);
    assert.equal(h.routes.at(-1).state.applicationName, 'soql');
    await h.request('soql');
    h.app.handleNavigation({ type: 'application', state: { applicationName: 'settings' } });
    assert.equal(h.app.pendingTaskPath, null);
    await h.request('soql');
    h.app.cancelPendingTask();
    assert.equal(h.app.pendingTaskPath, null);
    await h.request('soql');
    h.app.handleLogout();
    assert.equal(h.app.pendingTaskPath, null);
});

test('cancel, OAuth failure and invalid tasks leave no stale continuation', async () => {
    const cancelled = harness();
    cancelled.app.pendingTaskPath = 'soql';
    await cancelled.request('soql');
    assert.equal(cancelled.app.pendingTaskPath, null);
    assert.deepEqual(cancelled.counts(), { opens: 1, connections: 0 });
    const failed = harness({
        choice: { loginUrl: 'https://login.salesforce.com' },
        connect: () => {
            throw new Error('cancelled or expired');
        },
    });
    await failed.request('soql');
    assert.equal(failed.app.pendingTaskPath, null);
    assert.match(failed.app.connectionError, /retry/);
    assert.equal(failed.app.isConnecting, false);
    await failed.request('https://unregistered.invalid');
    assert.deepEqual(failed.counts(), { opens: 1, connections: 1 });
});

test('duplicate requests are ignored while a prompt is open; connected tasks bypass it', async () => {
    let finish;
    const h = harness({
        choice: () =>
            new Promise(resolve => {
                finish = resolve;
            }),
    });
    const pending = h.request('soql');
    await h.request('soql');
    assert.equal(h.counts().opens, 1);
    finish(undefined);
    await pending;
    h.app._isLoggedIn = true;
    await h.request('soql');
    assert.equal(h.counts().opens, 1);
    assert.equal(h.routes.at(-1).state.applicationName, 'soql');
});

test('leaving the connection flow while OAuth is pending cancels task continuation', async () => {
    const h = harness({
        choice: { loginUrl: 'https://login.salesforce.com' },
        connect: async app => {
            app.handleNavigation({ type: 'application', state: { applicationName: 'settings' } });
            await app.handleLogin(h.connector);
        },
    });
    await h.request('soql');
    assert.equal(h.routes.length, 0);
    assert.equal(h.app.pendingTaskPath, null);
});

test('an explicit desktop org launch takes precedence over a pending home task', async () => {
    const h = harness({ configuration: { alias: 'desktop-fixture', credentialType: 'OAUTH' } });
    h.app.pendingTaskPath = 'soql';
    let initialized = 0;
    h.app.initMode = async () => {
        initialized++;
    };
    await h.app.applyDesktopLaunchIntent({ target: 'org', orgAlias: 'desktop-fixture' }, true);
    assert.equal(h.app.pendingTaskPath, null);
    assert.equal(h.saved[0].alias, 'desktop-fixture');
    assert.equal(initialized, 1);
    assert.equal(h.routes.length, 0);
});
