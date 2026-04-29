import { test } from 'node:test';
import assert from 'node:assert/strict';

import { structurizedMarkdown } from '../utils.js';

test('structurizedMarkdown: empty string → empty array', () => {
    assert.deepEqual(structurizedMarkdown(''), []);
});

test('structurizedMarkdown: plain lines (no headers) push to content', () => {
    const out = structurizedMarkdown('hello\nworld');
    assert.deepEqual(out, ['hello', 'world']);
});

test('structurizedMarkdown: single ### category with links', () => {
    const md = '### Cat\n- [a](/a)\n- [b](/b)';
    const out = structurizedMarkdown(md);
    assert.equal(out.length, 1);
    assert.equal(out[0].content, '\r### Cat');
    assert.deepEqual(out[0].links, ['- [a](/a)', '- [b](/b)']);
    assert.deepEqual(out[0].children, []);
});

test('structurizedMarkdown: ### category containing #### subcategory with links', () => {
    const md = '### Cat\n#### Sub\n- [a](/a)';
    const out = structurizedMarkdown(md);
    assert.equal(out.length, 1);
    assert.equal(out[0].children.length, 1);
    assert.equal(out[0].children[0].content, '\r#### Sub');
    assert.deepEqual(out[0].children[0].links, ['- [a](/a)']);
});

test('structurizedMarkdown: multiple ### categories flush prior category', () => {
    const md = '### A\n- [a1](/a1)\n### B\n- [b1](/b1)';
    const out = structurizedMarkdown(md);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0].links, ['- [a1](/a1)']);
    assert.deepEqual(out[1].links, ['- [b1](/b1)']);
});

test('structurizedMarkdown: prose lines before links populate "before" array', () => {
    const md = '### Cat\nintro line\n- [a](/a)';
    const out = structurizedMarkdown(md);
    assert.deepEqual(out[0].before, ['intro line']);
    assert.deepEqual(out[0].links, ['- [a](/a)']);
});
