// salesforceUrl.test.ts
// Module: shared/salesforceUrl
// Runner: node:test + node:assert/strict via `node --experimental-strip-types --test`
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    normalizeInstanceUrl,
    normalizeProxyUrl,
    normalizeApiVersion,
    toSalesforcePath,
    buildFrontDoorUrl,
    buildSalesforceNavigationPath,
} from '../salesforceUrl.ts';

test('normalizeInstanceUrl: adds https when scheme missing', () => {
    assert.equal(
        normalizeInstanceUrl('example.my.salesforce.com'),
        'https://example.my.salesforce.com'
    );
});
test('normalizeInstanceUrl: preserves http and https schemes', () => {
    assert.equal(normalizeInstanceUrl('http://localhost:6109'), 'http://localhost:6109');
    assert.equal(
        normalizeInstanceUrl('https://x.my.salesforce.com'),
        'https://x.my.salesforce.com'
    );
});
test('normalizeInstanceUrl: trims whitespace and strips trailing slashes', () => {
    assert.equal(normalizeInstanceUrl('  https://x.com///  '), 'https://x.com');
});
test('normalizeInstanceUrl: empty/nullish → empty string', () => {
    assert.equal(normalizeInstanceUrl(null), '');
    assert.equal(normalizeInstanceUrl(undefined), '');
    assert.equal(normalizeInstanceUrl('   '), '');
});

test('normalizeProxyUrl: defaults to http scheme', () => {
    assert.equal(normalizeProxyUrl('localhost:8080'), 'http://localhost:8080');
});
test('normalizeProxyUrl: preserves explicit https', () => {
    assert.equal(normalizeProxyUrl('https://proxy.example'), 'https://proxy.example');
});
test('normalizeProxyUrl: empty → empty', () => {
    assert.equal(normalizeProxyUrl(''), '');
});

test('normalizeApiVersion: returns value when present', () => {
    assert.equal(normalizeApiVersion('62.0'), '62.0');
});
test('normalizeApiVersion: falls back', () => {
    assert.equal(normalizeApiVersion('', '60.0'), '60.0');
    assert.equal(normalizeApiVersion(null), '63.0');
});
test('normalizeApiVersion: final hard fallback 63.0', () => {
    assert.equal(normalizeApiVersion('', ''), '63.0');
});

test('toSalesforcePath: passes through absolute paths', () => {
    assert.equal(
        toSalesforcePath('/lightning/page', 'https://x.my.salesforce.com'),
        '/lightning/page'
    );
});
test('toSalesforcePath: prepends / for bare relative', () => {
    assert.equal(toSalesforcePath('setup/Home', 'https://x.my.salesforce.com'), '/setup/Home');
});
test('toSalesforcePath: preserves leading ? for query-only', () => {
    assert.equal(toSalesforcePath('?foo=bar', 'https://x.my.salesforce.com'), '?foo=bar');
});
test('toSalesforcePath: same-origin absolute URL → path+search+hash', () => {
    const out = toSalesforcePath(
        'https://x.my.salesforce.com/lightning/page?a=1#b',
        'https://x.my.salesforce.com'
    );
    assert.equal(out, '/lightning/page?a=1#b');
});
test('toSalesforcePath: cross-origin absolute URL throws', () => {
    assert.throws(
        () => toSalesforcePath('https://evil.example/x', 'https://x.my.salesforce.com'),
        /Absolute URLs are not supported/
    );
});
test('toSalesforcePath: unparseable absolute URL throws', () => {
    assert.throws(
        () => toSalesforcePath('http://', 'https://x.my.salesforce.com'),
        /Absolute URLs are not supported/
    );
});

test('buildFrontDoorUrl: preserves existing params and sets retURL', () => {
    const built = buildFrontDoorUrl(
        'https://acme.my.salesforce.com/secur/frontdoor.jsp?sid=abc123',
        '/lightning/r/Account/001000000000001/view'
    );
    const url = new URL(built);
    assert.equal(url.pathname, '/secur/frontdoor.jsp');
    assert.equal(url.searchParams.get('sid'), 'abc123');
    assert.equal(url.searchParams.get('retURL'), '/lightning/r/Account/001000000000001/view');
});

test('buildSalesforceNavigationPath: builds record/list/setup/app routes', () => {
    assert.equal(
        buildSalesforceNavigationPath({
            kind: 'record',
            object: 'Account',
            id: '001000000000001',
            instanceHost: 'acme.my.salesforce.com',
        }),
        '/lightning/r/Account/001000000000001/view'
    );
    assert.equal(
        buildSalesforceNavigationPath({
            kind: 'list',
            object: 'Account',
            filter: '__Recent',
            instanceHost: 'acme.my.salesforce.com',
        }),
        '/lightning/o/Account/list?filterName=__Recent'
    );
    assert.equal(
        buildSalesforceNavigationPath({
            kind: 'setup',
            node: 'ManageUsers',
            instanceHost: 'acme.my.salesforce.com',
        }),
        '/lightning/setup/ManageUsers/home'
    );
    assert.equal(
        buildSalesforceNavigationPath({
            kind: 'app',
            appApiName: 'standard__LightningSales',
            instanceHost: 'acme.my.salesforce.com',
        }),
        '/lightning/app/standard__LightningSales'
    );
});

test('buildSalesforceNavigationPath: enforces /lightning/ prefix for page', () => {
    assert.throws(
        () =>
            buildSalesforceNavigationPath({
                kind: 'page',
                path: '/setup/home',
                instanceHost: 'acme.my.salesforce.com',
            }),
        /starting with \/lightning\//
    );
});

test('buildSalesforceNavigationPath: url enforces https, host match, sid stripping', () => {
    assert.throws(
        () =>
            buildSalesforceNavigationPath({
                kind: 'url',
                absoluteUrl: 'http://acme.my.salesforce.com/lightning/o/Account/list',
                instanceHost: 'acme.my.salesforce.com',
            }),
        /only supports https/
    );
    assert.throws(
        () =>
            buildSalesforceNavigationPath({
                kind: 'url',
                absoluteUrl: 'https://evil.example.com/lightning/o/Account/list',
                instanceHost: 'acme.my.salesforce.com',
            }),
        /host mismatch/
    );
    assert.equal(
        buildSalesforceNavigationPath({
            kind: 'url',
            absoluteUrl:
                'https://acme.my.salesforce.com/lightning/o/Account/list?filterName=__Recent&sid=abc',
            instanceHost: 'acme.my.salesforce.com',
        }),
        '/lightning/o/Account/list?filterName=__Recent'
    );
});

test('buildSalesforceNavigationPath: url preserves encoded path, re-encodes query as form (+ for space) and strips sid', () => {
    // Path keeps %20 (URL-encoded). Query is re-serialized via URLSearchParams after deleting
    // `sid`, so %20 → '+' (application/x-www-form-urlencoded). Both forms are accepted by
    // Lightning, but the contract is that the helper round-trips deterministically here.
    const result = buildSalesforceNavigationPath({
        kind: 'url',
        absoluteUrl:
            'https://acme.my.salesforce.com/lightning/r/Account/001%20Special/view?name=Test%20Name&sid=bad',
        instanceHost: 'acme.my.salesforce.com',
    });
    assert.equal(result, '/lightning/r/Account/001%20Special/view?name=Test+Name');
});
