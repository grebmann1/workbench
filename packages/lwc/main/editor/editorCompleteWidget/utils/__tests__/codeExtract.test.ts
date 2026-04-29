import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StreamParser } from '../codeExtract.js';

test('StreamParser: captures content between start + end tags in one chunk', () => {
    const p = new StreamParser('<code>', '</code>');
    p.is('prefix<code>hello world</code>suffix');
    assert.equal(p.getResult(), 'hello world');
});

test('StreamParser: streams content across multiple chunks', () => {
    const p = new StreamParser('<c>', '</c>');
    p.is('before<c>hel');
    p.is('lo wo');
    p.is('rld</c>after');
    assert.equal(p.getResult(), 'hello world');
});

test('StreamParser: handles start tag split across chunks', () => {
    const p = new StreamParser('<code>', '</code>');
    // Start tag split in two
    p.is('before<co');
    p.is('de>body</code>');
    assert.equal(p.getResult(), 'body');
});

test('StreamParser: handles end tag split across chunks', () => {
    const p = new StreamParser('<code>', '</code>');
    p.is('<code>body</co');
    p.is('de>tail');
    assert.equal(p.getResult(), 'body');
});

test('StreamParser: ignores content before start tag', () => {
    const p = new StreamParser('[[', ']]');
    p.is('ignore me [[keep]]');
    assert.equal(p.getResult(), 'keep');
});

test('StreamParser: returns empty when no start tag has been seen', () => {
    const p = new StreamParser('<x>', '</x>');
    p.is('just some text with no tags');
    assert.equal(p.getResult(), '');
});

test('StreamParser: captures multiple blocks across calls', () => {
    const p = new StreamParser('<b>', '</b>');
    p.is('<b>first</b>middle<b>sec');
    p.is('ond</b>end');
    assert.equal(p.getResult(), 'firstsecond');
});

test('StreamParser: clears non-matching buffer so partial tags do not leak', () => {
    const p = new StreamParser('<abc>', '</abc>');
    // Buffer contains "<aXY" which isn't a valid prefix of "<abc>" after the X.
    p.is('<aXY<abc>payload</abc>');
    assert.equal(p.getResult(), 'payload');
});

test('StreamParser: collecting state preserves already-captured content when buffer holds partial end tag', () => {
    const p = new StreamParser('<s>', '</s>');
    p.is('<s>hello</'); // partial end tag at end of buffer
    // "</" is a valid prefix of "</s>" so it must stay in buffer, not emit.
    assert.equal(p.getResult(), 'hello');
    p.is('s>');
    assert.equal(p.getResult(), 'hello');
});
