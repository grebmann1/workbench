import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ChatCodeHighlighter, normalizeCodeLanguage, prepareChatMarkdown } from '../chatCode';
import { marked } from '../../../../../shared/modules/markdown/markdown';
import {
    HIGHLIGHT_CACHE_CHARACTERS,
    HIGHLIGHT_CACHE_ENTRIES,
    MAX_HIGHLIGHT_LENGTH,
} from '../constants';

test('unfinished fences render as code before the next newline or closing fence arrives', () => {
    for (const fence of ['```', '~~~']) {
        const source = `${fence}javascript\nconst value = "<unsafe> &lt;";`;
        const html = marked(undefined)(prepareChatMarkdown(source));
        assert.match(html, /<pre><code class="language-javascript">/);
        assert.match(html, /&lt;unsafe&gt; &amp;lt;/);
        assert.doesNotMatch(html, /<unsafe>/);
    }
});

test('completed fences and a later unfinished fence retain distinct code boundaries', () => {
    const source = '```json\n{"ok": true}\n```\n\n```soql\nSELECT Id FROM Account';
    const html = marked(undefined)(prepareChatMarkdown(source));
    assert.equal(html.match(/<pre>/g)?.length, 2);
    assert.match(html, /language-soql/);
    assert.match(html, /SELECT Id FROM Account<\/code>/);
});

test('reuses completed blocks while another block streams and maps Salesforce aliases', () => {
    const calls: string[] = [];
    const highlighter = new ChatCodeHighlighter(() => ({
        languages: { javascript: {}, sql: {}, apex: {} },
        highlight: (code, _grammar, language) => {
            calls.push(language);
            return `<span>${code}</span>`;
        },
    }));
    for (let i = 0; i < 12; i++) {
        highlighter.highlight('SELECT Id FROM Account', 'soql');
        highlighter.highlight('const value = 1', 'js');
        highlighter.highlight(`System.debug(${i});`, 'apex');
    }
    assert.equal(calls.filter(language => language === 'sql').length, 1);
    assert.equal(calls.filter(language => language === 'javascript').length, 1);
    assert.equal(calls.filter(language => language === 'apex').length, 12);
    highlighter.clear();
    highlighter.highlight('SELECT Id FROM Account', 'soql');
    assert.equal(calls.filter(language => language === 'sql').length, 2);
});

test('unknown languages, inherited names and oversized blocks fall back to escaped Markdown code', () => {
    const highlighter = new ChatCodeHighlighter(() => ({
        languages: { javascript: {} },
        highlight() {
            throw new Error('Must not invoke highlighting');
        },
    }));
    assert.equal(highlighter.highlight('<script>unsafe()</script>', 'invented'), undefined);
    assert.equal(highlighter.highlight('value', '__proto__'), undefined);
    assert.equal(highlighter.highlight('value', 'constructor'), undefined);
    assert.equal(highlighter.highlight('x'.repeat(MAX_HIGHLIGHT_LENGTH + 1), 'js'), undefined);
    assert.equal(normalizeCodeLanguage('JS title="example"'), 'js');
    assert.equal(normalizeCodeLanguage('<img>'), 'plain');
});

test('absent or failing highlighters leave code readable and can recover on a later update', () => {
    let ready = false;
    let failing = true;
    const prism = {
        languages: { json: {} },
        highlight() {
            if (failing) throw new Error('Partial syntax');
            return 'highlighted';
        },
    };
    const highlighter = new ChatCodeHighlighter(() => (ready ? prism : undefined));
    assert.equal(highlighter.highlight('{}', 'json'), undefined);
    ready = true;
    assert.equal(highlighter.highlight('{}', 'json'), undefined);
    failing = false;
    assert.equal(highlighter.highlight('{}', 'json'), 'highlighted');
});

test('cache retention is bounded by entry count', () => {
    let calls = 0;
    const highlighter = new ChatCodeHighlighter(() => ({
        languages: { javascript: {} },
        highlight: code => {
            calls++;
            return code;
        },
    }));
    for (let i = 0; i <= HIGHLIGHT_CACHE_ENTRIES; i++) highlighter.highlight(String(i), 'js');
    highlighter.highlight('0', 'js');
    assert.equal(calls, HIGHLIGHT_CACHE_ENTRIES + 2);
});

test('large highlighted output cannot accumulate an unbounded cache', () => {
    let calls = 0;
    const highlighter = new ChatCodeHighlighter(() => ({
        languages: { javascript: {} },
        highlight: () => {
            calls++;
            return 'x'.repeat(HIGHLIGHT_CACHE_CHARACTERS / 2);
        },
    }));
    highlighter.highlight('first', 'js');
    highlighter.highlight('second', 'js');
    highlighter.highlight('first', 'js');
    assert.equal(calls, 3);
});
