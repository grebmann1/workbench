import assert from 'node:assert/strict';
import test from 'node:test';

import {
    decryptStoredSecret,
    encryptStoredSecret,
    mergeOrgSecrets,
    splitOrgSecrets,
} from './desktopCredentialStore';

const testCipher = {
    decryptString(buffer: Buffer): string {
        return Buffer.from(buffer.toString('utf8'), 'base64').toString('utf8');
    },
    encryptString(value: string): Buffer {
        return Buffer.from(Buffer.from(value, 'utf8').toString('base64'), 'utf8');
    },
    isEncryptionAvailable(): boolean {
        return true;
    },
};

test('splitOrgSecrets removes refresh-token material from public org metadata', () => {
    const { publicConfiguration, secrets } = splitOrgSecrets({
        alias: 'demo-org',
        credentialType: 'OAUTH',
        instanceUrl: 'https://example.my.salesforce.com',
        refreshToken: 'refresh-token',
        sfdxAuthUrl: 'force://client::refresh-token@example.my.salesforce.com',
    });

    assert.deepEqual(publicConfiguration, {
        alias: 'demo-org',
        credentialType: 'OAUTH',
        instanceUrl: 'https://example.my.salesforce.com',
    });
    assert.deepEqual(secrets, {
        refreshToken: 'refresh-token',
        sfdxAuthUrl: 'force://client::refresh-token@example.my.salesforce.com',
    });
});

test('stored secrets round-trip through the configured cipher', () => {
    const encrypted = encryptStoredSecret('refresh-token', testCipher);

    assert.notEqual(encrypted.value, 'refresh-token');
    assert.equal(decryptStoredSecret(encrypted, testCipher), 'refresh-token');
});

test('mergeOrgSecrets restores secrets only when requested by main-process services', () => {
    const publicConfiguration = {
        alias: 'demo-org',
        credentialType: 'OAUTH',
    };
    const encryptedSecrets = {
        refreshToken: encryptStoredSecret('refresh-token', testCipher),
    };

    assert.deepEqual(mergeOrgSecrets(publicConfiguration, encryptedSecrets, testCipher), {
        alias: 'demo-org',
        credentialType: 'OAUTH',
        refreshToken: 'refresh-token',
    });
});
