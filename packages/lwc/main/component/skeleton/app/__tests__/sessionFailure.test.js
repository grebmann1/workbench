import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../../tools/testing/loadTypeScriptModule.mjs';

function fixture({ failed = true, saved = false } = {}) {
    const actions = [],
        toasts = [];
    const connector = {
        configuration: failed
            ? { _hasError: true, _errorMessage: 'Session expired or invalid' }
            : { username: 'expert@example.test' },
    };
    const { loadLimitedMode, loadFullMode } = loadTypeScriptModule(
        new URL('../session.ts', import.meta.url),
        {
            'core/connector': {
                credentialStrategies: { SESSION: { connect: async () => connector } },
                OAUTH_TYPES: {},
                getConfiguration() {},
            },
            'core/desktopBridge': {},
            'core/store': {
                store: {
                    getState: () => ({
                        application: {
                            isLoggedIn: actions.some(action => action.type === 'login'),
                        },
                    }),
                    dispatch: action => actions.push(action),
                },
                APPLICATION: {
                    reduxSlice: {
                        actions: {
                            login: payload => ({ type: 'login', payload }),
                            logout: () => ({ type: 'logout' }),
                        },
                    },
                },
            },
            'lightning/toast': { __esModule: true, default: { show: toast => toasts.push(toast) } },
            'lwr/navigation': { navigate() {} },
            'shared/logger': { __esModule: true, default: { debug() {}, error() {} } },
            'shared/utils': {
                isNotUndefinedOrNull: value => value != null,
                isElectronApp: () => false,
            },
            './utils': { handleRedirect() {} },
        },
        {
            sessionStorage: {
                getItem: () =>
                    saved
                        ? JSON.stringify({
                              sessionId: 'fixture',
                              serverUrl: 'https://example.my.salesforce.com',
                          })
                        : null,
            },
        }
    );
    const context = {
        sessionId: 'fixture',
        serverUrl: 'https://example.my.salesforce.com',
        loadModule() {},
    };
    return { actions, toasts, context, loadLimitedMode, loadFullMode };
}

test('failed limited-mode probes never dispatch login or start connected tools', async () => {
    const f = fixture();
    const result = await f.loadLimitedMode(f.context);
    assert.equal(result.success, false);
    assert.equal(
        f.actions.some(action => action.type === 'login'),
        false
    );
    assert.equal(f.toasts[0].message, 'Session expired or invalid');
});

test('failed full-mode and restored-session probes never dispatch login', async () => {
    for (const saved of [false, true]) {
        const f = fixture({ saved });
        await f.loadFullMode(saved ? { loadModule() {} } : f.context);
        assert.equal(
            f.actions.some(action => action.type === 'login'),
            false
        );
        assert.equal(f.toasts[0].message, 'Session expired or invalid');
    }
});

test('a successful probe still logs in for both shell modes', async () => {
    for (const mode of ['loadLimitedMode', 'loadFullMode']) {
        const f = fixture({ failed: false });
        await f[mode](f.context);
        assert.equal(f.actions.filter(action => action.type === 'login').length, 1);
    }
});
