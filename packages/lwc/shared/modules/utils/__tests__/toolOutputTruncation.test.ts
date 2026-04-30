import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    buildCapNotice,
    buildHeadSectionHeader,
    buildTailSectionHeader,
    buildTruncationSummary,
    buildTruncatedText,
    MAX_TOOL_OUTPUT_CHARS,
    TAIL_CHARS,
    TOOL_OUTPUT_TRUNCATED_MARKER,
} from '../toolOutputTruncation.ts';

test('buildCapNotice: includes path, total chars, sed commands', () => {
    const notice = buildCapNotice('/tmp/out.txt', 99999);
    assert.ok(notice.includes(TOOL_OUTPUT_TRUNCATED_MARKER));
    assert.ok(notice.includes('/tmp/out.txt'));
    assert.ok(notice.includes('99999 chars'));
    assert.ok(notice.includes('sed -n'));
});

test('buildHeadSectionHeader: mentions char count', () => {
    assert.match(buildHeadSectionHeader(123), /first 123 chars/);
});

test('buildTailSectionHeader: mentions the tail-chars constant', () => {
    assert.ok(buildTailSectionHeader().includes(String(TAIL_CHARS)));
});

test('buildTruncationSummary: embeds the saved path + total chars', () => {
    const out = buildTruncationSummary('/p', 500);
    assert.ok(out.includes('/p'));
    assert.ok(out.includes('500 chars total'));
});

test('buildTruncatedText: output never exceeds maxToolOutputChars (default)', () => {
    const big = 'a'.repeat(MAX_TOOL_OUTPUT_CHARS * 2);
    const notice = buildCapNotice('/p', big.length);
    const combined = buildTruncatedText(big, '/p', notice);
    assert.ok(combined.length <= MAX_TOOL_OUTPUT_CHARS);
});

test('buildTruncatedText: preserves the last TAIL_CHARS characters of the input', () => {
    // Input ends with a distinct marker; it must survive truncation.
    const marker = 'END-OF-INPUT-MARKER';
    const big = 'x'.repeat(MAX_TOOL_OUTPUT_CHARS * 2) + marker;
    const combined = buildTruncatedText(big, '/p', 'notice');
    assert.ok(combined.includes(marker));
});

test('buildTruncatedText: custom maxToolOutputChars is respected', () => {
    const text = 'a'.repeat(5000);
    const cap = 800;
    const combined = buildTruncatedText(text, '/p', 'notice', {
        maxToolOutputChars: cap,
        tailChars: 100,
    });
    assert.ok(combined.length <= cap);
});
