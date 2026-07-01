import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stripSoqlComments, isSoqlCommentLine } from '../slices/stripSoqlComments.ts';

test('soql/stripSoqlComments: strips a leading # full-line comment', () => {
    const raw = '# this line is ignored\nSELECT Id FROM Account';
    assert.equal(stripSoqlComments(raw), '\nSELECT Id FROM Account');
});

test('soql/stripSoqlComments: strips a leading -- full-line comment', () => {
    const raw = '-- so is this one\nSELECT Id FROM Account';
    assert.equal(stripSoqlComments(raw), '\nSELECT Id FROM Account');
});

test('soql/stripSoqlComments: allows leading whitespace before the marker', () => {
    const raw = '   \t-- indented comment\n\t# also indented\nSELECT Id FROM Account';
    assert.equal(stripSoqlComments(raw), '\n\nSELECT Id FROM Account');
});

test('soql/stripSoqlComments: preserves the line count (blanks, not deletes)', () => {
    const raw = '# a\n# b\nSELECT Id FROM Account\n-- c';
    const out = stripSoqlComments(raw);
    assert.equal(out.split('\n').length, raw.split('\n').length);
    assert.equal(out, '\n\nSELECT Id FROM Account\n');
});

test('soql/stripSoqlComments: does NOT treat # or -- inside a quoted literal as a comment', () => {
    // The plan's explicit false-positive guard: markers after other tokens or
    // inside a string literal must survive untouched.
    const raw = "SELECT Id, Name FROM Account WHERE Name = 'a -- not a comment'";
    assert.equal(stripSoqlComments(raw), raw);

    const withHash = "SELECT Id FROM Account WHERE Name = 'tag #1'";
    assert.equal(stripSoqlComments(withHash), withHash);
});

test('soql/stripSoqlComments: does NOT strip a marker that follows other tokens on the line', () => {
    const raw = 'SELECT Id FROM Account -- trailing text stays';
    assert.equal(stripSoqlComments(raw), raw);
});

test('soql/stripSoqlComments: normalises CRLF line endings to LF', () => {
    const raw = '# c\r\nSELECT Id FROM Account';
    assert.equal(stripSoqlComments(raw), '\nSELECT Id FROM Account');
});

test('soql/stripSoqlComments: returns nullish / empty input unchanged', () => {
    assert.equal(stripSoqlComments(''), '');
    assert.equal(stripSoqlComments(undefined as any), undefined);
    assert.equal(stripSoqlComments(null as any), null);
});

test('soql/stripSoqlComments: a query with no comments is unchanged', () => {
    const raw = 'SELECT Id, Name FROM Account\nWHERE Name != null\nLIMIT 50';
    assert.equal(stripSoqlComments(raw), raw);
});

test('soql/isSoqlCommentLine: classifies lines correctly', () => {
    assert.equal(isSoqlCommentLine('# x'), true);
    assert.equal(isSoqlCommentLine('  -- x'), true);
    assert.equal(isSoqlCommentLine("SELECT Id FROM Account WHERE Name = 'a -- b'"), false);
    assert.equal(isSoqlCommentLine('SELECT Id -- trailing'), false);
    assert.equal(isSoqlCommentLine(''), false);
});
