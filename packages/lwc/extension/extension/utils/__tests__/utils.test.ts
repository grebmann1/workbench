import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isEmpty, getSfPathFromUrl, loadConfiguration, PANELS } from '../utils.ts';

test('isEmpty: empty string returns true', () => {
    assert.equal(isEmpty(''), true);
});

test('isEmpty: null/undefined returns true', () => {
    assert.equal(isEmpty(null as any), true);
    assert.equal(isEmpty(undefined as any), true);
});

test('isEmpty: non-empty string returns false', () => {
    assert.equal(isEmpty('a'), false);
});

test('getSfPathFromUrl: returns "/" for chrome-extension:// urls', () => {
    assert.equal(getSfPathFromUrl('chrome-extension://abc/views/app.html'), '/');
});

test('getSfPathFromUrl: returns "/" for moz-extension://', () => {
    assert.equal(getSfPathFromUrl('moz-extension://abc/views/app.html'), '/');
});

test('getSfPathFromUrl: returns pathname for https urls', () => {
    assert.equal(getSfPathFromUrl('https://my.salesforce.com/lightning/setup'), '/lightning/setup');
});

test('getSfPathFromUrl: root pathname maps to /', () => {
    assert.equal(getSfPathFromUrl('https://my.salesforce.com/'), '/');
});

test('loadConfiguration: returns {} for empty input', () => {
    assert.deepEqual(loadConfiguration(''), {});
    assert.deepEqual(loadConfiguration(null as any), {});
});

test('loadConfiguration: parses valid JSON', () => {
    assert.deepEqual(loadConfiguration('{"a":1,"b":"two"}'), { a: 1, b: 'two' });
});

test('loadConfiguration: returns {} on malformed JSON without throwing', () => {
    assert.deepEqual(loadConfiguration('{not json'), {});
});

test('PANELS: exposes salesforce + default keys', () => {
    assert.equal(PANELS.SALESFORCE, 'salesforce');
    assert.equal(PANELS.DEFAULT, 'default');
});
