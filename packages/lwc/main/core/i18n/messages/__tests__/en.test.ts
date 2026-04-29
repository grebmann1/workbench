import assert from 'node:assert/strict';
import { test } from 'node:test';

import messages from '../en.ts';

test('en messages: default export is a non-empty record of strings', () => {
    assert.equal(typeof messages, 'object');
    assert.ok(messages !== null);
    const entries = Object.entries(messages);
    assert.ok(entries.length > 30);
    for (const [key, value] of entries) {
        assert.equal(typeof value, 'string', `${key} must be string`);
        assert.ok(value.length > 0, `${key} must be non-empty`);
    }
});

test('en messages: keys are SCREAMING_SNAKE_CASE identifiers', () => {
    for (const key of Object.keys(messages)) {
        assert.match(key, /^[A-Z][A-Z0-9_]+$/, `${key} must be SCREAMING_SNAKE_CASE`);
    }
});

test('en messages: welcome copy references SOQL explorer + login choices', () => {
    assert.ok(messages.WELCOME_TITLE.includes('SOQL'));
    assert.equal(messages.WELCOME_LOGIN_PRODUCTION, 'Login to Production Org');
    assert.equal(messages.WELCOME_LOGIN_SANDBOX, 'Login to Sandbox Org');
});

test('en messages: every value is printable (no stray control chars)', () => {
    // eslint-disable-next-line no-control-regex
    const controlRegex = /[\u0000-\u0008\u000B-\u001F]/;
    for (const [key, value] of Object.entries(messages)) {
        assert.ok(!controlRegex.test(value), `${key} contains control character`);
    }
});
