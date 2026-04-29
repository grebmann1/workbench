import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.chrome = globalThis.chrome || { storage: { local: { get: async () => ({}) } } };

const { normalizeLoginUrl } = await import('../oauth.js');

test('normalizeLoginUrl: empty/falsy returns login.salesforce.com fallback', () => {
    assert.equal(normalizeLoginUrl(''), 'https://login.salesforce.com');
    assert.equal(normalizeLoginUrl(null), 'https://login.salesforce.com');
    assert.equal(normalizeLoginUrl(undefined), 'https://login.salesforce.com');
    assert.equal(normalizeLoginUrl('   '), 'https://login.salesforce.com');
});

test('normalizeLoginUrl: strips trailing slash, query, hash', () => {
    assert.equal(
        normalizeLoginUrl('https://test.salesforce.com/?foo=1#bar'),
        'https://test.salesforce.com/'
    );
    assert.equal(
        normalizeLoginUrl('https://test.salesforce.com/path/'),
        'https://test.salesforce.com/path'
    );
});

test('normalizeLoginUrl: non-http(s) protocol falls back', () => {
    assert.equal(normalizeLoginUrl('ftp://test.salesforce.com'), 'https://login.salesforce.com');
});

test('normalizeLoginUrl: malformed URL falls back', () => {
    assert.equal(normalizeLoginUrl('not a url'), 'https://login.salesforce.com');
});

test('normalizeLoginUrl: preserves valid http scheme', () => {
    assert.equal(normalizeLoginUrl('http://localhost:8080'), 'http://localhost:8080/');
});
