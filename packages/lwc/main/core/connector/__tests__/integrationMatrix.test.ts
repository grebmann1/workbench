import { test } from 'node:test';
import assert from 'node:assert/strict';

// isChromeExtension() / isElectronApp() read from window — stub before module load.
(globalThis as any).window = {};

const {
    default: matrix,
    getSupportedCredentialTypes,
    isCredentialTypeSupported,
} = await import('../integrationMatrix.ts');
const { OAUTH_TYPES } = await import('../credentialStrategies/oauthTypes.ts');

test('integrationMatrix: exposes web/chrome/electron credential lists', () => {
    assert.ok(Array.isArray(matrix.web));
    assert.ok(Array.isArray(matrix.chrome));
    assert.ok(Array.isArray(matrix.electron));
});

test('integrationMatrix: OAUTH is supported on every platform', () => {
    for (const platform of Object.keys(matrix)) {
        assert.ok(
            matrix[platform].includes(OAUTH_TYPES.OAUTH),
            `platform ${platform} missing OAUTH`
        );
    }
});

test('integrationMatrix: SFDX is only on electron', () => {
    assert.ok(matrix.electron.includes('SFDX'));
    assert.ok(!matrix.web.includes('SFDX'));
    assert.ok(!matrix.chrome.includes('SFDX'));
});

test('integrationMatrix: getSupportedCredentialTypes returns current platform list', () => {
    const list = getSupportedCredentialTypes();
    assert.ok(Array.isArray(list));
    assert.ok(list.includes(OAUTH_TYPES.OAUTH));
});

test('integrationMatrix: isCredentialTypeSupported flags known + unknown', () => {
    assert.equal(isCredentialTypeSupported(OAUTH_TYPES.OAUTH), true);
    assert.equal(isCredentialTypeSupported('NOT_A_REAL_TYPE'), false);
});

test('integrationMatrix: SESSION is supported on web + chrome + electron', () => {
    for (const platform of Object.keys(matrix)) {
        assert.ok(
            matrix[platform].includes(OAUTH_TYPES.SESSION),
            `platform ${platform} missing SESSION`
        );
    }
});
