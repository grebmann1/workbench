import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
    toNumber,
    toNumberArray,
    createErrorResponse,
    createSuccessResponse,
    isEmpty,
    isNotNullOrUndefined,
    compareMajorMinor,
    parsePatterns,
    normalizeUrlForPatternMatch,
} = await import('../utils.js');

test('toNumber: parses integer strings, passes numbers through', () => {
    assert.equal(toNumber('42'), 42);
    assert.equal(toNumber('007'), 7);
    assert.equal(toNumber(42), 42);
});

test('toNumberArray: maps arrays, returns [] for non-arrays', () => {
    assert.deepEqual(toNumberArray(['1', '2', 3]), [1, 2, 3]);
    assert.deepEqual(toNumberArray(null), []);
    assert.deepEqual(toNumberArray(undefined), []);
    assert.deepEqual(toNumberArray('x'), []);
});

test('createErrorResponse: default message + isError=true', () => {
    const r = createErrorResponse();
    assert.equal(r.isError, true);
    assert.equal(r.content[0].type, 'text');
    assert.match(r.content[0].text, /Unknown error/);
});

test('createErrorResponse: custom message preserved', () => {
    const r = createErrorResponse('Boom');
    assert.equal(r.content[0].text, 'Boom');
});

test('createSuccessResponse: default + custom, isError=false', () => {
    assert.equal(createSuccessResponse().content[0].text, 'Success');
    const r = createSuccessResponse('done');
    assert.equal(r.isError, false);
    assert.equal(r.content[0].text, 'done');
});

test('isEmpty: true for empty/null/undefined, false otherwise', () => {
    assert.equal(isEmpty(''), true);
    assert.equal(isEmpty(null), true);
    assert.equal(isEmpty(undefined), true);
    assert.equal(isEmpty('x'), false);
});

test('isNotNullOrUndefined: discriminates null/undefined from 0/""/false', () => {
    assert.equal(isNotNullOrUndefined(null), false);
    assert.equal(isNotNullOrUndefined(undefined), false);
    assert.equal(isNotNullOrUndefined(0), true);
    assert.equal(isNotNullOrUndefined(''), true);
    assert.equal(isNotNullOrUndefined(false), true);
});

test('compareMajorMinor: equal major+minor returns false', () => {
    assert.equal(compareMajorMinor('1.2.3', '1.2.9'), false);
    assert.equal(compareMajorMinor('1.2', '1.2'), false);
});

test('compareMajorMinor: different major or minor returns true', () => {
    assert.equal(compareMajorMinor('2.0.0', '1.0.0'), true);
    assert.equal(compareMajorMinor('1.3.0', '1.2.9'), true);
});

test('parsePatterns: falls back when patternString empty/null', () => {
    const out = parsePatterns('', ['^https://a\\.com']);
    assert.equal(out.length, 1);
    assert.ok(out[0].test('https://a.com'));
});

test('parsePatterns: splits multiline strings, builds regexes, drops blanks', () => {
    const out = parsePatterns('^https://a\\.com\n\n^https://b\\.com', []);
    assert.equal(out.length, 2);
    assert.ok(out[0].test('https://a.com/x'));
    assert.ok(out[1].test('https://b.com/x'));
});

test('parsePatterns: invalid regex lines filtered out (returns null)', () => {
    const out = parsePatterns('valid\n[invalid', []);
    assert.equal(out.length, 1);
    assert.ok(out[0].test('valid'));
});

test('parsePatterns: strips leading/trailing slashes before building regex', () => {
    const out = parsePatterns('/^https:\\/\\/a\\.com/', []);
    assert.equal(out.length, 1);
    assert.ok(out[0].test('https://a.com'));
});

test('normalizeUrlForPatternMatch: http(s) returns origin+pathname', () => {
    assert.equal(
        normalizeUrlForPatternMatch('https://example.com/path?q=1#frag'),
        'https://example.com/path'
    );
    assert.equal(normalizeUrlForPatternMatch('http://example.com/'), 'http://example.com/');
});

test('normalizeUrlForPatternMatch: non-http protocols → null', () => {
    assert.equal(normalizeUrlForPatternMatch('ftp://example.com'), null);
    assert.equal(normalizeUrlForPatternMatch('file:///tmp/x'), null);
    assert.equal(normalizeUrlForPatternMatch('chrome-extension://abc/'), null);
});

test('normalizeUrlForPatternMatch: malformed URL → null', () => {
    assert.equal(normalizeUrlForPatternMatch('not a url'), null);
    assert.equal(normalizeUrlForPatternMatch(''), null);
});
