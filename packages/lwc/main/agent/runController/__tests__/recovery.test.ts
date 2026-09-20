import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationRunController } from '../runController';
import {
    loadRunJournal,
    saveRunJournal,
    assertRecoveryContext,
    RUN_JOURNAL_PATH,
} from '../runJournal';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const request = (id: string) => ({
    id,
    prompt: `Task ${id}`,
    fileNames: [],
    model: 'chosen-model',
});
test('active and queued requests survive restart, remain paused, and complete once explicitly resumed', async () => {
    let saved = '';
    const fs = {
        writeFile: async (_path: string, content: string) => {
            saved = content;
        },
        readFile: async () => saved,
        exists: async () => !!saved,
    };
    const running = new ConversationRunController(
        () => {},
        () => {},
        { persist: runs => saveRunJournal(fs, runs) }
    );
    running.enqueue('chat', request('a'), () => new Promise(() => {}));
    running.enqueue('chat', request('b'), () => new Promise(() => {}));
    await tick();
    const snapshots = await loadRunJournal(fs);
    assert.equal(snapshots[0].requests[0].interrupted, true);
    assert.equal(snapshots[0].requests[1].id, 'b');
    const seen: string[] = [];
    const restored = new ConversationRunController(
        () => {},
        error => assert.fail(String(error)),
        { persist: runs => saveRunJournal(fs, runs) }
    );
    restored.restore(snapshots, async (_id, run) => {
        seen.push(run.id);
    });
    await tick();
    assert.deepEqual(seen, []);
    restored.enqueue('chat', request('c'), async () => {
        seen.push('c');
    });
    await tick();
    assert.deepEqual(seen, [], 'sending a new prompt must not start recovered work');
    restored.resume('chat');
    await tick();
    await tick();
    assert.deepEqual(seen, ['a', 'b', 'c']);
    assert.deepEqual(await loadRunJournal(fs), []);
});
test('execution waits for durable checkpoint and stops when persistence fails', async () => {
    let release!: () => void;
    let started = false;
    const controller = new ConversationRunController(
        () => {},
        () => {},
        {
            persist: () =>
                new Promise(resolve => {
                    release = resolve;
                }),
        }
    );
    controller.enqueue('chat', request('a'), async () => {
        started = true;
    });
    await tick();
    assert.equal(started, false);
    release();
    await tick();
    release();
    await tick();
    assert.equal(started, true);
    const failed = new ConversationRunController(
        () => {},
        () => {},
        {
            persist: async () => {
                throw new Error('disk full');
            },
        }
    );
    failed.enqueue('chat', request('b'), async () =>
        assert.fail('must not execute without persistence')
    );
    await tick();
    assert.equal(failed.snapshots()[0].requests[0].id, 'b');
});
test('wrong org/tab blocks resume and preserves the recovered request', async () => {
    const errors: unknown[] = [];
    const controller = new ConversationRunController(
        () => {},
        (_id, error) => errors.push(error)
    );
    controller.restore(
        [{ id: 'chat', requests: [{ ...request('a'), orgId: 'org1', browserTabId: 5 }] }],
        async (_id, run) => assertRecoveryContext(run, { orgId: 'org2', browserTabId: 5 })
    );
    controller.resume('chat');
    await tick();
    assert.equal(errors.length, 1);
    assert.equal(controller.snapshots()[0].requests[0].id, 'a');
    assert.throws(
        () => assertRecoveryContext({ browserTabId: 5 }, { browserTabId: 6 }),
        /original browser tab/
    );
});
test('journal rejects unknown versions and traversal attachment paths', async () => {
    const fs = {
        exists: async () => true,
        readFile: async () => JSON.stringify({ version: 2, runs: [] }),
    };
    await assert.rejects(loadRunJournal(fs));
    fs.readFile = async () =>
        JSON.stringify({
            version: 1,
            runs: [
                {
                    id: 'a',
                    requests: [
                        {
                            ...request('a'),
                            attachments: [
                                {
                                    path: '/workspace/agent-runs/files/../../secret',
                                    name: 'x',
                                    type: 'text/plain',
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    await assert.rejects(loadRunJournal(fs));
    assert.equal(RUN_JOURNAL_PATH, '/workspace/agent-runs/pending.json');
});

test('saving one conversation preserves other views pending tasks', async () => {
    let saved = '';
    const fs = {
        writeFile: async (_path: string, content: string) => {
            saved = content;
        },
        readFile: async () => saved,
        exists: async () => !!saved,
    };
    await saveRunJournal(fs, [{ id: 'a', requests: [request('first')] }], 'a');
    await saveRunJournal(fs, [{ id: 'b', requests: [request('second')] }], 'b');
    assert.deepEqual(
        (await loadRunJournal(fs)).map(run => run.id),
        ['a', 'b']
    );
    await saveRunJournal(fs, [], 'a');
    assert.deepEqual(
        (await loadRunJournal(fs)).map(run => run.id),
        ['b']
    );
});

test('a notification failure cannot requeue completed recovered work', async () => {
    const controller = new ConversationRunController(
        () => {},
        () => assert.fail('completed task should not fail'),
        {
            onComplete: () => {
                throw new Error('view unmounted');
            },
        }
    );
    controller.restore([{ id: 'chat', requests: [request('done')] }], async () => {});
    controller.resume('chat');
    await tick();
    assert.deepEqual(controller.snapshots(), []);
});
