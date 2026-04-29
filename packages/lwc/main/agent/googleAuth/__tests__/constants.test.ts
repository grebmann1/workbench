import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GOOGLE_SIGNIN_SCOPES, GOOGLE_DRIVE_SCOPES } from '../constants.js';

test('GOOGLE_SIGNIN_SCOPES: contains openid + userinfo scopes, all absolute or literal', () => {
    assert.ok(GOOGLE_SIGNIN_SCOPES.includes('openid'));
    assert.ok(GOOGLE_SIGNIN_SCOPES.includes('https://www.googleapis.com/auth/userinfo.email'));
    assert.ok(GOOGLE_SIGNIN_SCOPES.includes('https://www.googleapis.com/auth/userinfo.profile'));
    for (const scope of GOOGLE_SIGNIN_SCOPES) {
        assert.equal(typeof scope, 'string');
        assert.ok(scope.length > 0);
    }
});

test('GOOGLE_DRIVE_SCOPES: is a superset of GOOGLE_SIGNIN_SCOPES with drive/sheets/slides', () => {
    for (const base of GOOGLE_SIGNIN_SCOPES) {
        assert.ok(GOOGLE_DRIVE_SCOPES.includes(base), `drive scopes missing ${base}`);
    }
    assert.ok(GOOGLE_DRIVE_SCOPES.includes('https://www.googleapis.com/auth/drive'));
    assert.ok(GOOGLE_DRIVE_SCOPES.includes('https://www.googleapis.com/auth/drive.file'));
    assert.ok(GOOGLE_DRIVE_SCOPES.includes('https://www.googleapis.com/auth/presentations'));
    assert.ok(GOOGLE_DRIVE_SCOPES.includes('https://www.googleapis.com/auth/spreadsheets'));
});

test('GOOGLE_DRIVE_SCOPES: no duplicates', () => {
    assert.equal(GOOGLE_DRIVE_SCOPES.length, new Set(GOOGLE_DRIVE_SCOPES).size);
});
