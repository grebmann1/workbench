import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    computeFileLists,
    createCompactionSummaryMessage,
    isCompactionSummaryMessage,
    getCompactionSummaryText,
    COMPACTION_SUMMARY_HEADER,
    DEFAULT_RESERVE_TOKENS,
    DEFAULT_KEEP_RECENT_TOKENS,
    estimateMessageTokens,
    estimateConversationTokens,
    shouldCompactContext,
    findCutPoint,
    createFileOps,
    extractFileOpsFromMessage,
    formatFileOperations,
    relaxCompactionSettings,
    prepareCompaction,
} from '../compaction.ts';

test('computeFileLists: modified set wins over read-only', () => {
    const fileOps = {
        read: new Set(['a', 'b', 'c']),
        written: new Set(['b']),
        edited: new Set(['c']),
    };
    const out = computeFileLists(fileOps);
    assert.deepEqual(out.readFiles, ['a']);
    assert.deepEqual(out.modifiedFiles, ['b', 'c']);
});

test('createCompactionSummaryMessage + isCompactionSummaryMessage + getCompactionSummaryText round-trip', () => {
    const msg = createCompactionSummaryMessage('  summary body  ');
    assert.equal(msg.role, 'system');
    assert.ok(typeof msg.content === 'string' && msg.content.startsWith(COMPACTION_SUMMARY_HEADER));
    assert.equal(isCompactionSummaryMessage(msg), true);
    assert.equal(getCompactionSummaryText(msg), 'summary body');
});

test('isCompactionSummaryMessage: returns false for non-summary / undefined', () => {
    assert.equal(isCompactionSummaryMessage(undefined), false);
    assert.equal(isCompactionSummaryMessage({ role: 'user', content: 'hi' } as any), false);
    assert.equal(isCompactionSummaryMessage({ role: 'system', content: 'other' } as any), false);
});

test('estimateMessageTokens: ~chars/4 for system messages', () => {
    const msg = { role: 'system', content: 'x'.repeat(400) } as any;
    assert.equal(estimateMessageTokens(msg), 100);
});

test('estimateConversationTokens: sums system prompt + messages (chars/4)', () => {
    const system = 'x'.repeat(40); // 10 tokens
    const messages = [
        { role: 'system', content: 'x'.repeat(40) } as any, // 10 tokens
        { role: 'system', content: 'x'.repeat(80) } as any, // 20 tokens
    ];
    assert.equal(estimateConversationTokens(system, messages), 40);
});

test('shouldCompactContext: triggers when tokens exceed window - reserve', () => {
    const settings = { reserveTokens: 100, keepRecentTokens: 500 };
    assert.equal(shouldCompactContext(950, 1000, settings), true);
    assert.equal(shouldCompactContext(800, 1000, settings), false);
});

test('findCutPoint: empty / all-tool messages → firstKeptIndex=startIndex', () => {
    const allTools = [{ role: 'tool', content: [] }] as any[];
    const out = findCutPoint(allTools, 0, 1000);
    assert.equal(out.firstKeptIndex, 0);
    assert.equal(out.turnStartIndex, -1);
    assert.equal(out.isSplitTurn, false);
});

test('createFileOps: returns empty sets', () => {
    const ops = createFileOps();
    assert.equal(ops.read.size, 0);
    assert.equal(ops.written.size, 0);
    assert.equal(ops.edited.size, 0);
});

test('extractFileOpsFromMessage: records read/write/edit by tool name + path', () => {
    const ops = createFileOps();
    extractFileOpsFromMessage(
        {
            role: 'assistant',
            content: [
                { type: 'tool-call', name: 'read', arguments: { path: '/a' } },
                { type: 'tool-call', name: 'write', arguments: { path: '/b' } },
                { type: 'tool-call', name: 'editFile', arguments: { path: '/c' } },
                { type: 'tool-call', name: 'other', arguments: { path: '/d' } },
            ],
        } as any,
        ops
    );
    assert.ok(ops.read.has('/a'));
    assert.ok(ops.written.has('/b'));
    assert.ok(ops.edited.has('/c'));
    assert.equal(ops.read.has('/d'), false);
});

test('extractFileOpsFromMessage: skips non-assistant messages', () => {
    const ops = createFileOps();
    extractFileOpsFromMessage(
        {
            role: 'user',
            content: [{ type: 'tool-call', name: 'read', arguments: { path: '/x' } }],
        } as any,
        ops
    );
    assert.equal(ops.read.size, 0);
});

test('formatFileOperations: builds read-files / modified-files blocks; empty → ""', () => {
    assert.equal(formatFileOperations([], []), '');
    const out = formatFileOperations(['r.ts'], ['w.ts']);
    assert.match(out, /<read-files>\nr\.ts\n<\/read-files>/);
    assert.match(out, /<modified-files>\nw\.ts\n<\/modified-files>/);
});

test('relaxCompactionSettings: lowers keep-recent toward a minimum', () => {
    const relaxed = relaxCompactionSettings({ reserveTokens: 1000, keepRecentTokens: 20_000 });
    assert.ok(relaxed.keepRecentTokens < 20_000);
});

test('prepareCompaction: returns null when no messages past summary', () => {
    const msgs = [createCompactionSummaryMessage('prev')];
    const out = prepareCompaction(msgs as any, 'sys', {
        reserveTokens: 10,
        keepRecentTokens: 10,
    });
    assert.equal(out, null);
});

test('exports sensible DEFAULT constants', () => {
    assert.ok(DEFAULT_RESERVE_TOKENS > 0);
    assert.ok(DEFAULT_KEEP_RECENT_TOKENS > 0);
});
