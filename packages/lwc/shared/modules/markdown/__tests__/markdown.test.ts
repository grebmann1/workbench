import assert from 'node:assert/strict';
import { test } from 'node:test';

import { marked } from '../markdown.ts';

const m = marked();

test('marked: renders ATX headings with slug id', () => {
    assert.match(m('# Hello'), /<h1 id="hello">Hello<\/h1>/);
});

test('marked: renders bold and italic inline', () => {
    const out = m('**bold** and *italic*');
    assert.match(out, /<strong>bold<\/strong>/);
    assert.match(out, /<em>italic<\/em>/);
});

test('marked: renders fenced code blocks with language class', () => {
    const out = m('```js\nconst x = 1;\n```');
    assert.match(out, /<pre><code class="language-js">const x = 1;<\/code><\/pre>/);
});

test('marked: renders fenced code blocks without language', () => {
    const out = m('```\nplain\n```');
    assert.match(out, /<pre><code>plain<\/code><\/pre>/);
});

test('marked: renders inline code', () => {
    assert.match(m('use `foo` here'), /<code>foo<\/code>/);
});

test('marked: renders unordered and ordered lists', () => {
    const ul = m('- a\n- b');
    assert.match(ul, /<ul>[\s\S]*<li>a<\/li>[\s\S]*<li>b<\/li>[\s\S]*<\/ul>/);

    const ol = m('1. a\n2. b');
    assert.match(ol, /<ol>[\s\S]*<li>a<\/li>[\s\S]*<li>b<\/li>[\s\S]*<\/ol>/);
});

test('marked: renders links with href', () => {
    assert.match(
        m('[Anthropic](https://anthropic.com)'),
        /<a href="https:\/\/anthropic\.com">Anthropic<\/a>/
    );
});

test('marked: renders images with src and alt', () => {
    assert.match(m('![alt](/path/x.png)'), /<img src="\/path\/x\.png" alt="alt">/);
});

test('marked: renders blockquotes', () => {
    assert.match(m('> quoted'), /<blockquote>[\s\S]*<p>quoted<\/p>[\s\S]*<\/blockquote>/);
});

test('marked: renders GFM tables', () => {
    const out = m('| A | B |\n|---|---|\n| 1 | 2 |');
    assert.match(out, /<table>/);
    assert.match(out, /<th>A<\/th>\s*<th>B<\/th>/);
    assert.match(out, /<td>1<\/td>\s*<td>2<\/td>/);
});

test('marked: renders horizontal rules', () => {
    assert.match(m('---'), /<hr>/);
});

test('marked: escapes HTML inside code fences (XSS guard)', () => {
    const out = m('```\n<script>alert(1)</script>\n```');
    assert.match(out, /&lt;script&gt;/);
    assert.doesNotMatch(out, /<script>/);
});

test('marked: throws on null/undefined input', () => {
    assert.throws(() => m(null as unknown as string), /input parameter is undefined or null/);
    assert.throws(() => m(undefined as unknown as string), /input parameter is undefined or null/);
});
