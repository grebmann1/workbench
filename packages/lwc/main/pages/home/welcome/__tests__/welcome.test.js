import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from '../../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as constants from '../constants.js';

function welcome({ sessions = [], saved = [], chrome = true, electron = false } = {}) {
    let rejectSessions = false;
    let rejectSaved = false;
    const { default: Welcome } = loadTypeScriptModule(new URL('../welcome.js', import.meta.url), {
        'core/applications': { APP_LIST: [] },
        'core/connector': {
            listOrgSessionsViaBackground: async () => {
                if (rejectSessions) throw new Error();
                return sessions;
            },
            getConfigurations: async () => {
                if (rejectSaved) throw new Error();
                return saved;
            },
        },
        'core/store': {},
        'core/toolkitElement': class {
            get isUserLoggedIn() {
                return this.isLoggedIn;
            }
        },
        lwc: { wire: () => () => {} },
        'lwr/navigation': {},
        'shared/llm': {
            buildAvailableAgentModelOptions: ({ providerConfigs }) =>
                providerConfigs?.ready ? ['configured-model'] : [],
        },
        'shared/utils': { isChromeExtension: () => chrome, isElectronApp: () => electron },
        './constants.js': constants,
    });
    return {
        app: new Welcome(),
        fail: () => {
            rejectSessions = rejectSaved = true;
        },
        recover: () => {
            rejectSessions = rejectSaved = false;
        },
    };
}

test('home separates empty data, failures and recovery for both connection sources', async () => {
    const { app, fail, recover } = welcome();
    await app.refreshConnections();
    assert.match(app.savedSummary, /No saved orgs/);
    assert.equal(app.hasSessions, false);
    assert.equal(app.sessionsError, false);
    fail();
    await app.refreshConnections();
    assert.match(app.savedSummary, /could not be loaded/);
    assert.equal(app.sessionsError, true);
    assert.equal(app.isLoadingSessions, false);
    assert.equal(app.isLoadingSaved, false);
    recover();
    await app.refreshConnections();
    assert.match(app.savedSummary, /No saved orgs/);
    assert.equal(app.sessionsError, false);
});

test('saved org count and browser identities have specific descriptions', async () => {
    const { app } = welcome({
        saved: [{ alias: 'test' }],
        sessions: [{ label: 'QA org', serverUrl: 'https://test.invalid' }],
    });
    await app.refreshConnections();
    assert.match(app.savedSummary, /^1 saved org available/);
    assert.equal(app.sessions[0].openLabel, 'Open QA org in Workbench');
});

test('desktop and web omit browser-only guidance and discovery', async () => {
    for (const platform of [{ electron: true }, { chrome: false }]) {
        const { app, fail } = welcome(platform);
        fail();
        await app.refreshConnections();
        assert.equal(app.isBrowserSessionsVisible, false);
        assert.equal(app.sessionsError, false);
        assert.equal(
            app.tips.some(tip => tip.id === 'tip-browser-sessions'),
            false
        );
    }
});

test('home distinguishes connected users and configured AI from initial setup', () => {
    const { app } = welcome();
    app.handleStore({ application: { isLoggedIn: false } });
    assert.equal(app.connectLabel, 'Connect a Salesforce org');
    assert.equal(app.taskHint, 'Connect to open');
    assert.match(app.aiTitle, /Optional/);
    app.handleStore({ application: { isLoggedIn: true, providerConfigs: { ready: true } } });
    assert.equal(app.connectLabel, 'Connect another org');
    assert.equal(app.taskHint, 'Open tool');
    assert.equal(app.aiTitle, 'Your AI assistant is ready');
});
