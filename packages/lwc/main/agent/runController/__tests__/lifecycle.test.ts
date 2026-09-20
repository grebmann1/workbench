import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationRunController } from '../runController';
import { prepareRetry } from '../retry';
import { StepCheckpoint } from '../stepCheckpoint';
import { migrateConversationData } from '../conversationSchema';
import { mergeToolResults } from '../../messageList/normalizeMessages';
import type { ModelMessage } from 'ai';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const request = (id: string) => ({
    id,
    prompt: id,
    fileNames: ['data.csv'],
    model: 'chosen-model',
});

test('runs serialize per conversation while different conversations run independently', async () => {
    const seen: string[] = [];
    let finish!: () => void;
    const controller = new ConversationRunController(
        () => {},
        error => assert.fail(String(error))
    );
    controller.enqueue('a', request('a1'), async () => {
        seen.push('a1');
        await new Promise<void>(resolve => {
            finish = resolve;
        });
    });
    controller.enqueue('a', request('a2'), async () => {
        seen.push('a2');
    });
    controller.enqueue('b', request('b1'), async () => {
        seen.push('b1');
    });
    await tick();
    assert.deepEqual(seen, ['a1', 'b1']);
    finish();
    await tick();
    assert.deepEqual(seen, ['a1', 'b1', 'a2']);
});

test('Stop pauses pending work and aborts setup; resume starts the preserved request', async () => {
    const seen: string[] = [];
    const controller = new ConversationRunController(
        () => {},
        () => assert.fail('abort must not become an error')
    );
    controller.enqueue(
        'a',
        request('a1'),
        signal =>
            new Promise<void>((resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            })
    );
    controller.enqueue('a', request('a2'), async () => {
        seen.push('a2');
    });
    controller.stop('a');
    await tick();
    assert.deepEqual(seen, []);
    controller.resume('a');
    await tick();
    assert.deepEqual(seen, ['a2']);
});

test('deleting a running conversation cannot publish late work or drain its queue', async () => {
    const seen: string[] = [];
    let finish!: () => void;
    const controller = new ConversationRunController(
        state => seen.push(state.running ? 'running' : 'idle'),
        () => {}
    );
    controller.enqueue(
        'a',
        request('a1'),
        () =>
            new Promise<void>(resolve => {
                finish = resolve;
            })
    );
    controller.enqueue('a', request('a2'), async () => assert.fail('deleted queue ran'));
    controller.delete('a');
    const count = seen.length;
    finish();
    await tick();
    assert.equal(seen.length, count);
});

test('failure pauses pending requests instead of cascading failed operations', async () => {
    let errors = 0;
    const controller = new ConversationRunController(
        () => {},
        () => errors++
    );
    controller.enqueue('a', request('a1'), async () => {
        throw new Error('provider unavailable');
    });
    controller.enqueue('a', request('a2'), async () => assert.fail('queue should be paused'));
    await tick();
    assert.equal(errors, 1);
});

test('a new run after Clear waits for the old run to release conversation resources', async () => {
    let finish!: () => void;
    const seen: string[] = [];
    const controller = new ConversationRunController(
        () => {},
        () => assert.fail('unexpected error')
    );
    controller.enqueue('a', request('old'), async () => {
        await new Promise<void>(resolve => {
            finish = resolve;
        });
        seen.push('old cleanup');
    });
    controller.delete('a');
    controller.enqueue('a', request('new'), async () => {
        seen.push('new setup');
    });
    await tick();
    assert.deepEqual(seen, []);
    finish();
    await tick();
    assert.deepEqual(seen, ['old cleanup', 'new setup']);
});

test('cumulative SDK checkpoints return only new completed messages', () => {
    const a: ModelMessage = { role: 'assistant', content: 'A' };
    const b: ModelMessage = { role: 'assistant', content: 'B' };
    const checkpoint = new StepCheckpoint();
    assert.deepEqual(checkpoint.takeNewMessages([a]), [a]);
    assert.deepEqual(checkpoint.takeNewMessages([a, b]), [b]);
    assert.deepEqual(checkpoint.takeNewMessages([a, b]), []);
});

test('retry truncates the failed exchange and sends the original user prompt', () => {
    const messages: ModelMessage[] = [
        { role: 'user', content: 'Earlier' },
        { role: 'assistant', content: 'Earlier reply' },
        { role: 'user', content: 'Retry me' },
        { role: 'assistant', content: 'Partial failed response' },
    ];
    assert.deepEqual(prepareRetry(messages), {
        history: messages.slice(0, 2),
        messages: [messages[2]],
    });
    assert.equal(prepareRetry([]), null);
});

test('every parallel tool result is merged without changing provider history', () => {
    const messages: ModelMessage[] = [
        {
            role: 'assistant',
            content: [
                { type: 'tool-call', toolCallId: 'a', toolName: 'first', input: {} },
                { type: 'tool-call', toolCallId: 'b', toolName: 'second', input: {} },
            ],
        },
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'b',
                    toolName: 'second',
                    output: { type: 'text', value: 'B' },
                },
                {
                    type: 'tool-result',
                    toolCallId: 'a',
                    toolName: 'first',
                    output: { type: 'text', value: 'A' },
                },
            ],
        },
    ];
    const original = JSON.stringify(messages);
    const merged = mergeToolResults(messages);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].content.length, 4);
    assert.equal(JSON.stringify(messages), original);
});

test('schema migration preserves history and refuses unknown future versions', () => {
    const conversations = [{ id: 'a', streamHistory: [{ role: 'user', content: 'Saved' }] }];
    assert.deepEqual(migrateConversationData({ conversations }), {
        schemaVersion: 1,
        conversations,
    });
    assert.throws(
        () => migrateConversationData({ schemaVersion: 999, conversations }),
        /newer Workbench/
    );
});
