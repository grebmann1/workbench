import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as limits from '../sessionRefreshLimit.ts';
const { Connector } = loadTypeScriptModule(new URL('../connectorClass.ts', import.meta.url), {
    'core/store': {
        store: { dispatch() {} },
        APPLICATION: { reduxSlice: { actions: { stopLoading: () => ({}) } } },
        ERROR: {},
    },
    'shared/cacheManager': {},
    'shared/logger': { __esModule: true, default: { debug() {}, error() {} } },
    'shared/utils': { isElectronApp: () => false },
    './base': { applyChromeCacheBusting() {} },
    './sessionRefreshLimit': limits,
    './credentialStrategies/oauthTypes': { OAUTH_TYPES: { SESSION: 'SESSION' } },
    './platformService': { getCurrentPlatform: () => 'CHROME' },
    './web': {},
});

for (const error of [
    { message: 'Session expired or invalid', errorCode: 'INVALID_SESSION_ID' },
    { message: 'Unauthorized', name: 'ERROR_HTTP_401' },
    { message: 'Unauthorized', status: 401 },
]) {
    test(`lightweight overlay probe marks ${error.errorCode || error.name || error.status} as a failed connection`, async () => {
        const conn = {
            accessToken: 'fixture',
            _maxSessionRefreshRetries: 2,
            request: async () => {
                assert.equal(conn._maxSessionRefreshRetries, 0);
                throw error;
            },
        };
        const connector = new Connector({ credentialType: 'SESSION' }, conn);
        await connector._lightEnrichWithVersions();
        assert.equal(connector.configuration._hasError, true);
        assert.equal(connector.configuration._errorMessage, error.message);
        assert.equal(conn._maxSessionRefreshRetries, 2);
    });
}

test('successful lightweight probes restore the runtime retry budget', async () => {
    const conn = { request: async () => [{ version: '65.0' }] };
    const connector = new Connector({ credentialType: 'SESSION' }, conn);
    await connector._lightEnrichWithVersions();
    assert.equal(conn.version, '65.0');
    assert.equal(conn._maxSessionRefreshRetries, 1);
    assert.equal(connector.configuration._hasError, undefined);
});

test('a non-authentication versions failure does not block the session', async () => {
    const conn = {
        request: async () => {
            throw { errorCode: 'SERVER_UNAVAILABLE' };
        },
    };
    const connector = new Connector({ credentialType: 'SESSION' }, conn);
    await connector._lightEnrichWithVersions();
    assert.equal(connector.configuration._hasError, undefined);
    assert.equal(limits.isSalesforceSessionError(null), false);
});
