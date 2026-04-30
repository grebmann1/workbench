import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    escapeRegExp,
    checkIfPresent,
    isSalesforceId,
    capitalizeFirstLetter,
    compareString,
    isSame,
    lowerCaseKey,
    stripNamespace,
    splitTextByTimestamp,
} from '../string.ts';

test('escapeRegExp: escapes regex metacharacters', () => {
    assert.equal(escapeRegExp('a.b*c?'), 'a\\.b\\*c\\?');
    assert.equal(escapeRegExp('(foo)[bar]{baz}'), '\\(foo\\)\\[bar\\]\\{baz\\}');
});

test('escapeRegExp: empty/null/undefined → empty string', () => {
    assert.equal(escapeRegExp(''), '');
    assert.equal(escapeRegExp(null), '');
    assert.equal(escapeRegExp(undefined), '');
});

test('checkIfPresent: case-insensitive substring check', () => {
    assert.equal(checkIfPresent('Hello World', 'WORLD'), true);
    assert.equal(checkIfPresent('Hello', 'zzz'), false);
});

test('checkIfPresent: null/undefined inputs coerced to empty string', () => {
    assert.equal(checkIfPresent(null, null), true);
    assert.equal(checkIfPresent('hello', null), true);
    assert.equal(checkIfPresent(null, 'x'), false);
});

test('isSalesforceId: accepts 15- and 18-char alphanumerics', () => {
    assert.equal(isSalesforceId('001A000000A1B2C'), true);
    assert.equal(isSalesforceId('001A000000A1B2CAAA'), true);
});

test('isSalesforceId: rejects wrong length or non-alphanumerics', () => {
    assert.equal(isSalesforceId('001'), false);
    assert.equal(isSalesforceId('001A000000A1B2C!'), false);
    assert.equal(isSalesforceId(''), false);
});

test('capitalizeFirstLetter: capitalizes first character', () => {
    assert.equal(capitalizeFirstLetter('hello'), 'Hello');
    assert.equal(capitalizeFirstLetter('h'), 'H');
});

test('compareString / isSame: case-insensitive equality', () => {
    assert.equal(compareString('Foo', 'foo'), true);
    assert.equal(compareString('Foo', 'bar'), false);
    assert.equal(isSame('X', 'x'), true);
});

test('lowerCaseKey: lowercases strings, returns null for null/undefined', () => {
    assert.equal(lowerCaseKey('ABC'), 'abc');
    assert.equal(lowerCaseKey(null), null);
    assert.equal(lowerCaseKey(undefined), null);
});

test('stripNamespace: strips managed package prefix from single string', () => {
    assert.equal(stripNamespace('ns__FieldName'), 'FieldName');
    assert.equal(stripNamespace('FieldName'), 'FieldName');
});

test('stripNamespace: maps over arrays', () => {
    assert.deepEqual(stripNamespace(['ns__A', 'B', 'pkg__C']), ['A', 'B', 'C']);
});

test('stripNamespace: null/undefined pass through', () => {
    assert.equal(stripNamespace(null as never), null);
    assert.equal(stripNamespace(undefined as never), undefined);
});

test('splitTextByTimestamp: splits log lines by Apex-style timestamps', () => {
    const input = [
        '10:00:00.100 (1000000000)|EVENT_A',
        'continuation line for A',
        '10:00:01.200 (2000000000)|EVENT_B',
    ].join('\n');
    const out = splitTextByTimestamp(input);
    assert.equal(out.length, 2);
    assert.match(out[0], /EVENT_A/);
    assert.match(out[0], /continuation/);
    assert.match(out[1], /EVENT_B/);
});

test('splitTextByTimestamp: returns empty array for empty input', () => {
    assert.deepEqual(splitTextByTimestamp(''), []);
});
