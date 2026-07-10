import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    OAUTH_UNPW_SETUP_PATH,
    isOrgFarmString,
    isOrgFarmConnection,
    shouldShowUnPwFlowHint,
    buildUnPwFlowSetupUrl,
} from '../orgFarmUnPwFlow.ts';

test('isOrgFarmString: matches orgfarm case-insensitively, ignores non-strings', () => {
    assert.equal(isOrgFarmString('orgfarm-000123'), true);
    assert.equal(isOrgFarmString('OrgFarm'), true);
    assert.equal(isOrgFarmString('user@orgfarm-000123.com'), true);
    assert.equal(isOrgFarmString('production'), false);
    assert.equal(isOrgFarmString(undefined), false);
    assert.equal(isOrgFarmString(123), false);
});

test('isOrgFarmConnection: true when any relevant field looks like OrgFarm', () => {
    assert.equal(isOrgFarmConnection({ username: 'x@orgfarm-1.com' }), true);
    assert.equal(isOrgFarmConnection({ categoryTitle: 'OrgFarm' }), true);
    assert.equal(isOrgFarmConnection({ customDomain: 'orgfarm-1.my.salesforce.com' }), true);
    assert.equal(isOrgFarmConnection({ name: '000123', username: 'x@acme.com' }), false);
    assert.equal(isOrgFarmConnection({}), false);
});

test('shouldShowUnPwFlowHint: only for Username/Password + OrgFarm', () => {
    assert.equal(shouldShowUnPwFlowHint({ isUsernamePassword: true, isOrgFarm: true }), true);
    assert.equal(shouldShowUnPwFlowHint({ isUsernamePassword: true, isOrgFarm: false }), false);
    assert.equal(shouldShowUnPwFlowHint({ isUsernamePassword: false, isOrgFarm: true }), false);
});

test('buildUnPwFlowSetupUrl: appends the setup path to the login origin', () => {
    assert.equal(
        buildUnPwFlowSetupUrl('https://login.salesforce.com'),
        `https://login.salesforce.com${OAUTH_UNPW_SETUP_PATH}`
    );
    // Trailing slashes are trimmed so we never produce a double slash.
    assert.equal(
        buildUnPwFlowSetupUrl('https://test.salesforce.com/'),
        `https://test.salesforce.com${OAUTH_UNPW_SETUP_PATH}`
    );
});
