import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getHighlightedRichText } from '../utils.ts';

test('getHighlightedRichText: no keywords → text verbatim', () => {
    assert.equal(getHighlightedRichText('Hello World', []), 'Hello World');
    assert.equal(getHighlightedRichText('Hello World', null), 'Hello World');
    assert.equal(getHighlightedRichText('Hello World', undefined), 'Hello World');
});

test('getHighlightedRichText: wraps matches in <strong>', () => {
    assert.equal(getHighlightedRichText('Apex Class', ['Apex']), '<strong>Apex</strong> Class');
});

test('getHighlightedRichText: case-insensitive match', () => {
    assert.equal(
        getHighlightedRichText('APEX apex Apex', ['apex']),
        '<strong>APEX</strong> <strong>apex</strong> <strong>Apex</strong>'
    );
});

test('getHighlightedRichText: multiple keywords joined with OR', () => {
    assert.equal(
        getHighlightedRichText('foo bar baz', ['foo', 'baz']),
        '<strong>foo</strong> bar <strong>baz</strong>'
    );
});
