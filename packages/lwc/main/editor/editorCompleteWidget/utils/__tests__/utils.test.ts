import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    tripleTick,
    defaultQuickEditFimTags,
    voidPrefixAndSuffix,
    ctrlKStream_userMessage,
    ctrlKStream_systemMessage,
    CompletionFormatter,
} from '../utils.js';

test('tripleTick: symmetric triple-backtick delimiters', () => {
    assert.deepEqual(tripleTick, ['```', '```']);
});

test('defaultQuickEditFimTags: ABOVE/BELOW/SELECTION', () => {
    assert.deepEqual(defaultQuickEditFimTags, {
        preTag: 'ABOVE',
        sufTag: 'BELOW',
        midTag: 'SELECTION',
    });
});

test('voidPrefixAndSuffix: returns lines before/after the selection range', () => {
    const file = 'a\nb\nc\nd\ne\nf\ng';
    // startLine=3 → selection starts at "c" (1-indexed)
    // endLine=4   → selection ends at "d"
    const { prefix, suffix } = voidPrefixAndSuffix({
        fullFileStr: file,
        startLine: 3,
        endLine: 4,
    });
    // Prefix contains lines before startLine (a, b).
    assert.ok(prefix.includes('a'));
    assert.ok(prefix.includes('b'));
    assert.ok(!prefix.includes('c'));
    // Suffix contains lines after endLine (e, f, g).
    assert.ok(suffix.includes('e'));
    assert.ok(suffix.includes('f'));
    assert.ok(suffix.includes('g'));
    assert.ok(!suffix.includes('d'));
});

test('voidPrefixAndSuffix: returns empty prefix when selection starts at line 1', () => {
    const { prefix } = voidPrefixAndSuffix({
        fullFileStr: 'a\nb\nc',
        startLine: 1,
        endLine: 1,
    });
    assert.equal(prefix, '');
});

test('voidPrefixAndSuffix: returns empty suffix when selection ends at last line', () => {
    const file = 'a\nb\nc';
    const { suffix } = voidPrefixAndSuffix({
        fullFileStr: file,
        startLine: 3,
        endLine: 3,
    });
    assert.equal(suffix, '');
});

test('ctrlKStream_userMessage: embeds selection, prefix, suffix, instructions, and tags', () => {
    const out = ctrlKStream_userMessage({
        selection: 'const x = 1;',
        prefix: 'before();',
        suffix: 'after();',
        instructions: 'Make x a string.',
        fimTags: { preTag: 'BEFORE', sufTag: 'AFTER', midTag: 'MID' },
        isOllamaFIM: false,
        language: 'ts',
    });
    assert.ok(out.includes('<MID>const x = 1;</MID>'));
    assert.ok(out.includes('<BEFORE>before();</BEFORE>'));
    assert.ok(out.includes('<AFTER>after();</AFTER>'));
    assert.ok(out.includes('Make x a string.'));
    assert.ok(out.includes('```ts'));
});

test('ctrlKStream_systemMessage: references all three FIM tags', () => {
    const out = ctrlKStream_systemMessage({
        quickEditFIMTags: { preTag: 'B', midTag: 'M', sufTag: 'A' },
    });
    assert.ok(out.includes('<M>'));
    assert.ok(out.includes('<B>'));
    assert.ok(out.includes('<A>'));
    assert.ok(out.includes('FIM'));
});

test('CompletionFormatter: setCompletion returns `this` for chaining', () => {
    const f = new CompletionFormatter('', 1);
    const ret = f.setCompletion('hello');
    assert.equal(ret, f);
    assert.equal(f.build(), 'hello');
});

test('CompletionFormatter: removeInvalidLineBreaks trims trailing whitespace', () => {
    const f = new CompletionFormatter('hello\n\n   \n', 1).removeInvalidLineBreaks();
    assert.equal(f.build(), 'hello');
});

test('CompletionFormatter: removeMarkdownCodeSyntax strips ```lang fences', () => {
    const f = new CompletionFormatter(
        '```ts\nconst x = 1;\nconst y = 2;\n```',
        1
    ).removeMarkdownCodeSyntax();
    const out = f.build();
    assert.ok(out.includes('const x = 1;'));
    assert.ok(out.includes('const y = 2;'));
    assert.ok(!out.includes('```'));
});

test('CompletionFormatter: removeExcessiveNewlines collapses 3+ newlines to 2', () => {
    const f = new CompletionFormatter('a\n\n\n\n\nb', 1).removeExcessiveNewlines();
    assert.equal(f.build(), 'a\n\nb');
});

test('CompletionFormatter: indentByColumn leaves first line alone, indents the rest', () => {
    // currentColumn=5 → indentation of 4 spaces on continuation lines.
    const f = new CompletionFormatter('first\nsecond\nthird', 5).indentByColumn();
    assert.equal(f.build(), 'first\n    second\n    third');
});

test('CompletionFormatter: indentByColumn is a no-op for single-line completions', () => {
    const f = new CompletionFormatter('single', 10).indentByColumn();
    assert.equal(f.build(), 'single');
});
