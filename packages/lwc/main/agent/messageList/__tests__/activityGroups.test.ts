import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupCompletedActivity, type MessageEntry } from '../activityGroups';

const entry = (key: string, role: string, content: unknown): MessageEntry => ({
    key,
    message: { role, content },
    isLast: false,
});
const call = (id: string) => ({ type: 'tool-call', toolCallId: id, toolName: 'exec' });
const result = (id: string, value: unknown = { exitCode: 0 }) => ({
    type: 'tool-result',
    toolCallId: id,
    output: { type: 'json', value },
});
const activity = (id: string) => entry(id, 'assistant', [call(id), result(id)]);

test('completed requests fold once, count calls rather than results, and preserve the answer', () => {
    const entries = [
        entry('u', 'user', 'Inspect this'),
        activity('a'),
        entry('progress', 'assistant', 'Now checking totals.'),
        activity('b'),
        entry('answer', 'assistant', 'The total is 3.'),
    ];
    const before = JSON.stringify(entries);
    const grouped = groupCompletedActivity(entries, false);
    assert.equal(grouped.length, 3);
    const group = grouped[1];
    assert.ok('isGroup' in group);
    assert.equal(group.label, '2 actions completed');
    assert.deepEqual(
        group.messages.map(item => item.key),
        ['a', 'progress', 'b']
    );
    assert.equal('message' in grouped[2] && grouped[2].message.content instanceof Array, true);
    assert.equal(JSON.stringify(entries), before);
});

test('the active request stays open while earlier requests can fold', () => {
    const grouped = groupCompletedActivity(
        [entry('u1', 'user', 'First'), activity('a'), entry('u2', 'user', 'Next'), activity('b')],
        true
    );
    assert.equal('isGroup' in grouped[1], true);
    assert.equal('isGroup' in grouped[3], false);
});

test('pending calls and approval requests never fold', () => {
    for (const part of [
        call('waiting'),
        {
            type: 'tool-browser_click',
            toolCallId: 'waiting',
            state: 'approval-requested',
        },
    ]) {
        const entries = [activity('done'), entry('pending', 'assistant', [part])];
        assert.deepEqual(groupCompletedActivity(entries, false), entries);
    }
});

test('failure and denied counts are explicit, including wrapped shell exit codes', () => {
    const grouped = groupCompletedActivity(
        [
            activity('ok'),
            entry('fail', 'assistant', [
                call('fail'),
                result('fail', { stderr: 'Missing', exitCode: 1 }),
            ]),
            entry('denied', 'assistant', [
                {
                    type: 'tool-result',
                    toolCallId: 'denied',
                    output: { type: 'execution-denied' },
                },
            ]),
            entry('error', 'assistant', [
                {
                    type: 'dynamic-tool',
                    toolCallId: 'error',
                    state: 'output-error',
                    errorText: 'Failed',
                },
            ]),
        ],
        false
    );
    const group = grouped[0];
    assert.ok('isGroup' in group);
    assert.equal(group.label, '4 actions · 2 failed · 1 denied');
    assert.equal(group.hasIssues, true);
});

test('mixed reasoning, tools, answer and attachment retain all content', () => {
    const reasoning = { type: 'reasoning', text: 'Reviewing the result' };
    const text = { type: 'text', text: 'Here is the report.' };
    const file = { type: 'file', filename: 'report.csv', url: 'https://fixture/report.csv' };
    const grouped = groupCompletedActivity(
        [entry('mixed', 'assistant', [reasoning, call('a'), result('a'), text, file])],
        false
    );
    const group = grouped[0];
    assert.ok('isGroup' in group);
    assert.equal(group.label, '1 action completed');
    assert.deepEqual(group.messages[0].message.content, [reasoning, call('a'), result('a')]);
    assert.ok('message' in grouped[1]);
    assert.deepEqual(grouped[1].message.content, [text, file]);
});

test('UI-message tool parts and orphan results each count once', () => {
    const grouped = groupCompletedActivity(
        [
            {
                key: 'ui',
                isLast: true,
                message: {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'tool-exec',
                            toolCallId: 'a',
                            state: 'output-available',
                            output: { exitCode: 0 },
                        },
                        { type: 'text', text: 'Done' },
                    ],
                },
            },
        ],
        false
    );
    assert.ok('isGroup' in grouped[0]);
    assert.equal(grouped[0].label, '1 action completed');
    assert.ok('message' in grouped[1]);
    assert.deepEqual(grouped[1].message.parts, [{ type: 'text', text: 'Done' }]);
    const orphan = groupCompletedActivity([entry('orphan', 'tool', [result('a')])], false);
    assert.ok('isGroup' in orphan[0]);
    assert.equal(orphan[0].label, '1 action completed');
});

test('text-only and reasoning-only requests remain unchanged', () => {
    const entries = [
        entry('text', 'assistant', 'Hello'),
        entry('reason', 'assistant', [{ type: 'reasoning', text: 'Thinking' }]),
    ];
    assert.deepEqual(groupCompletedActivity(entries, false), entries);
});
