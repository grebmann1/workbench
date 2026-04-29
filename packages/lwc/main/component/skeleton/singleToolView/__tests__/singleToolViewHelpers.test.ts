import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSingleToolBootstrapSeed } from '../singleToolViewHelpers.ts';

test('parseSingleToolBootstrapSeed: empty/no applicationName → default "api"', () => {
    const out = parseSingleToolBootstrapSeed('');
    assert.equal(out.applicationName, 'api');
    assert.equal(out.alias, null);
});

test('parseSingleToolBootstrapSeed: extracts + lowercases applicationName', () => {
    const out = parseSingleToolBootstrapSeed('?applicationName=SOQL');
    assert.equal(out.applicationName, 'soql');
});

test('parseSingleToolBootstrapSeed: passes through connection fields', () => {
    const search =
        '?applicationName=api&alias=acme&redirectUrl=https://x&serverUrl=https://y&sessionId=ABC';
    const out = parseSingleToolBootstrapSeed(search);
    assert.equal(out.alias, 'acme');
    assert.equal(out.redirectUrl, 'https://x');
    assert.equal(out.serverUrl, 'https://y');
    assert.equal(out.sessionId, 'ABC');
});

test('parseSingleToolBootstrapSeed: non-string input coerced safely', () => {
    const out = parseSingleToolBootstrapSeed(undefined as any);
    assert.equal(out.applicationName, 'api');
});
