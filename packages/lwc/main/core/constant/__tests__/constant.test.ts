import { test } from 'node:test';
import assert from 'node:assert/strict';
import constant from '../constant.ts';

test('constant: exposes non-empty version string', () => {
    assert.equal(typeof constant.version, 'string');
    assert.ok(constant.version.length > 0);
});

test('constant: apiVersion matches Salesforce N.N format', () => {
    assert.match(constant.apiVersion, /^\d+\.\d+$/);
});
