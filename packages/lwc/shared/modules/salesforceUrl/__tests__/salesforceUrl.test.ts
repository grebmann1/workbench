// salesforceUrl.test.ts
// Module: shared/salesforceUrl
// Runner: node:test + node:assert/strict via `node --experimental-strip-types --test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeInstanceUrl,
    normalizeProxyUrl,
    normalizeApiVersion,
    toSalesforcePath,
} from '../salesforceUrl.ts';

test('normalizeInstanceUrl: adds https when scheme missing', () => {
    assert.equal(normalizeInstanceUrl('example.my.salesforce.com'), 'https://example.my.salesforce.com');
});
test('normalizeInstanceUrl: preserves http and https schemes', () => {
    assert.equal(normalizeInstanceUrl('http://localhost:6109'), 'http://localhost:6109');
    assert.equal(normalizeInstanceUrl('https://x.my.salesforce.com'), 'https://x.my.salesforce.com');
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
    assert.equal(toSalesforcePath('/lightning/page', 'https://x.my.salesforce.com'), '/lightning/page');
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
        'https://x.my.salesforce.com',
    );
    assert.equal(out, '/lightning/page?a=1#b');
});
test('toSalesforcePath: cross-origin absolute URL throws', () => {
    assert.throws(
        () => toSalesforcePath('https://evil.example/x', 'https://x.my.salesforce.com'),
        /Absolute URLs are not supported/,
    );
});
test('toSalesforcePath: unparseable absolute URL throws', () => {
    assert.throws(
        () => toSalesforcePath('http://', 'https://x.my.salesforce.com'),
        /Absolute URLs are not supported/,
    );
});
