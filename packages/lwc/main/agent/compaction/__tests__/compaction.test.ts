import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProviderInstance } from '../../utils/providerRuntime.ts';
import { generateConversationTitle } from '../../utils/generateTitle.ts';
import { extractNestedErrorMessage } from '../../utils/errorMessage.ts';

import {
    computeFileLists,
    createCompactionSummaryMessage,
    isCompactionSummaryMessage,
    getCompactionSummaryText,
    COMPACTION_SUMMARY_HEADER,
    estimateMessageTokens,
    estimateConversationTokens,
    shouldCompactContext,
    findCutPoint,
    createFileOps,
    extractFileOpsFromMessage,
    formatFileOperations,
    relaxCompactionSettings,
    prepareCompaction,
    generateCompactionSummary,
    type PreparedCompaction,
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

function streamedSummary(text: string): Response {
    const events = [
        {
            type: 'response.created',
            response: { id: 'response-test', created_at: 0, model: 'gpt-6.1-sol' },
        },
        {
            type: 'response.output_item.added',
            output_index: 0,
            item: { type: 'message', id: 'message-test' },
        },
        { type: 'response.output_text.delta', item_id: 'message-test', delta: text },
        {
            type: 'response.output_item.done',
            output_index: 0,
            item: { type: 'message', id: 'message-test' },
        },
        {
            type: 'response.completed',
            response: { usage: { input_tokens: 10, output_tokens: 5 } },
        },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' },
    });
}

for (const scenario of ['summary', 'split chunks', 'title']) {
    test(`${scenario}: streams successfully from a provider that rejects temperature`, async t => {
        let historyRequests = 0;
        t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
            assert.equal(typeof init?.body, 'string');
            const body = JSON.parse(String(init?.body));
            if ('temperature' in body) {
                return Response.json(
                    { detail: 'Unsupported parameter: temperature' },
                    { status: 400 }
                );
            }
            assert.equal(body.stream, true);
            if (scenario === 'title') {
                return streamedSummary('  Synthetic Conversation Title  ');
            }
            const input = JSON.stringify(body.input);
            if (input.includes('PREFIX_MARKER')) {
                return streamedSummary('  Current turn context  ');
            }
            historyRequests++;
            if (scenario === 'split chunks' && historyRequests === 2) {
                assert.ok(input.includes('Earlier history'));
                return streamedSummary('  Combined history  ');
            }
            return streamedSummary('  Earlier history  ');
        });

        const settings = {
            provider: 'openai',
            apiKey: 'synthetic-test-key',
            baseUrl: 'https://provider.invalid/v1',
            selectedModel: 'gpt-6.1-sol',
        };
        if (scenario === 'title') {
            assert.equal(
                await generateConversationTitle(settings, 'Discuss a synthetic project'),
                'Synthetic Conversation Title'
            );
            return;
        }
        const preparation: PreparedCompaction = {
            messagesToSummarize:
                scenario === 'split chunks'
                    ? [
                          { role: 'user', content: 'a'.repeat(110_000) },
                          { role: 'assistant', content: 'b'.repeat(110_000) },
                      ]
                    : [{ role: 'user', content: 'Summarize a synthetic project' }],
            turnPrefixMessages: [],
            keptMessages: [],
            firstKeptIndex: 0,
            isSplitTurn: false,
            tokensBefore: 1000,
            settings: { reserveTokens: 1000, keepRecentTokens: 500 },
            fileOps: createFileOps(),
        };
        if (scenario === 'split chunks') {
            preparation.isSplitTurn = true;
            preparation.turnPrefixMessages = [{ role: 'user', content: 'PREFIX_MARKER' }];
        }
        const summary = await generateCompactionSummary(
            createProviderInstance(settings),
            settings.provider,
            settings.selectedModel,
            preparation
        );
        if (scenario === 'split chunks') {
            assert.match(summary, /Combined history/);
            assert.match(summary, /Current turn context/);
            assert.equal(historyRequests, 2);
        } else {
            assert.equal(summary, 'Earlier history');
        }
    });
}

test('a failed summary stream preserves the provider error for the conversation UI', async t => {
    t.mock.method(globalThis, 'fetch', async () =>
        Response.json({ detail: 'Unsupported parameter: temperature' }, { status: 400 })
    );
    const preparation = prepareCompaction(
        [
            { role: 'user', content: 'Earlier task context.' },
            { role: 'assistant', content: 'Saved state.' },
            { role: 'user', content: 'Continue the task.' },
        ],
        '',
        { reserveTokens: 1000, keepRecentTokens: 1 }
    );
    assert.ok(preparation);
    const provider = createProviderInstance({
        provider: 'openai',
        apiKey: 'synthetic-test-key',
        baseUrl: 'https://provider.invalid/v1',
    });
    await assert.rejects(
        generateCompactionSummary(provider, 'openai', 'gpt-6.1-sol', preparation),
        error => {
            assert.equal(extractNestedErrorMessage(error), 'Unsupported parameter: temperature');
            return true;
        }
    );
});
