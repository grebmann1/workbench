import { test } from 'node:test';
import assert from 'node:assert/strict';

const { getSalesforceURL, canonicalizeServerUrl, isHttpUrl } = await import('../salesforce.js');

test('getSalesforceURL: lightning.force.com → my.salesforce.com', () => {
    assert.equal(
        getSalesforceURL('https://acme.lightning.force.com/lightning/o/Account'),
        'https://acme.my.salesforce.com'
    );
});

test('getSalesforceURL: salesforce-setup.com → salesforce.com', () => {
    assert.equal(
        getSalesforceURL('https://acme.sandbox.my.salesforce-setup.com/setup'),
        'https://acme.sandbox.my.salesforce.com'
    );
});

test('getSalesforceURL: non-matching url returns origin as-is', () => {
    assert.equal(
        getSalesforceURL('https://acme.my.salesforce.com/foo/bar'),
        'https://acme.my.salesforce.com'
    );
});

test('canonicalizeServerUrl: empty values pass through', () => {
    assert.equal(canonicalizeServerUrl(''), '');
    assert.equal(canonicalizeServerUrl(null), null);
    assert.equal(canonicalizeServerUrl(undefined), undefined);
});

test('canonicalizeServerUrl: delegates to getSalesforceURL', () => {
    assert.equal(
        canonicalizeServerUrl('https://acme.lightning.force.com/x'),
        'https://acme.my.salesforce.com'
    );
});

test('canonicalizeServerUrl: malformed url returned unchanged', () => {
    assert.equal(canonicalizeServerUrl('not a url'), 'not a url');
});

test('isHttpUrl: true for http/https, false for other schemes and garbage', () => {
    assert.equal(isHttpUrl('http://example.com'), true);
    assert.equal(isHttpUrl('https://example.com'), true);
    assert.equal(isHttpUrl('ftp://example.com'), false);
    assert.equal(isHttpUrl('file:///tmp/x'), false);
    assert.equal(isHttpUrl('nope'), false);
    assert.equal(isHttpUrl(''), false);
});
