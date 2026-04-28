import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OAUTH_TYPES } from '../credentialStrategies/oauthTypes.ts';

test('OAUTH_TYPES: canonical string constants are stable', () => {
    assert.equal(OAUTH_TYPES.OAUTH, 'OAUTH');
    assert.equal(OAUTH_TYPES.USERNAME, 'USERNAME');
    assert.equal(OAUTH_TYPES.SESSION, 'SESSION');
    assert.equal(OAUTH_TYPES.REDIRECT, 'REDIRECT');
});

test('OAUTH_TYPES: has exactly four entries (guard against silent additions)', () => {
    assert.deepEqual(
        Object.keys(OAUTH_TYPES).sort(),
        ['OAUTH', 'REDIRECT', 'SESSION', 'USERNAME']
    );
});
