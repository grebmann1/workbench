import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    registerCommand,
    invokeCommand,
    hasCommand,
    __resetCommandsForTests,
} from '../commands.ts';

test('registerCommand + invokeCommand round-trip', async () => {
    __resetCommandsForTests();
    registerCommand('soql.executeQuery', async payload => ({ echoed: payload }));
    const result = await invokeCommand('soql.executeQuery', { soql: 'SELECT Id FROM Account' });
    assert.deepEqual(result, { echoed: { soql: 'SELECT Id FROM Account' } });
});

test('invokeCommand on an unregistered id returns undefined', async () => {
    __resetCommandsForTests();
    const result = await invokeCommand('does.not.exist', {});
    assert.equal(result, undefined);
});

test('hasCommand reflects registration state', () => {
    __resetCommandsForTests();
    assert.equal(hasCommand('a.b'), false);
    registerCommand('a.b', () => 1);
    assert.equal(hasCommand('a.b'), true);
});

test('re-registering an id replaces the handler', async () => {
    __resetCommandsForTests();
    registerCommand('x.run', () => 'first');
    registerCommand('x.run', () => 'second');
    assert.equal(await invokeCommand('x.run'), 'second');
});

test('unregister callback only clears its own registration', async () => {
    __resetCommandsForTests();
    const unregisterFirst = registerCommand('y.run', () => 'first');
    registerCommand('y.run', () => 'second');
    unregisterFirst();
    assert.equal(await invokeCommand('y.run'), 'second');
});

test('payload is passed through unchanged', async () => {
    __resetCommandsForTests();
    let received;
    registerCommand('z.run', payload => {
        received = payload;
        return null;
    });
    const payload = { tabId: 't1', nested: { n: 2 } };
    await invokeCommand('z.run', payload);
    assert.equal(received, payload);
});

test('__resetCommandsForTests clears all registrations', () => {
    registerCommand('a.b', () => 1);
    registerCommand('c.d', () => 2);
    __resetCommandsForTests();
    assert.equal(hasCommand('a.b'), false);
    assert.equal(hasCommand('c.d'), false);
});

test('registerCommand rejects invalid id', () => {
    assert.throws(() => registerCommand('', () => {}), /non-empty string/);
});

test('registerCommand rejects non-function handler', () => {
    assert.throws(() => registerCommand('a.b', 'not a function'), /must be a function/);
});

test('handler errors propagate to the caller', async () => {
    __resetCommandsForTests();
    registerCommand('boom', () => {
        throw new Error('nope');
    });
    await assert.rejects(() => invokeCommand('boom'), /nope/);
});

test('concurrent invocations resolve independently with their own payloads', async () => {
    __resetCommandsForTests();
    let order = 0;
    registerCommand('slow', async payload => {
        const myOrder = ++order;
        // Interleave resolution so the second call can overtake if state leaks.
        await new Promise(r => setTimeout(r, payload.ms));
        return { payload, myOrder };
    });
    const [slow, fast] = await Promise.all([
        invokeCommand('slow', { id: 'A', ms: 30 }),
        invokeCommand('slow', { id: 'B', ms: 5 }),
    ]);
    // Both resolve with their own payload (no cross-contamination).
    assert.equal(slow.payload.id, 'A');
    assert.equal(fast.payload.id, 'B');
    // Order counter: A entered first (order 1), B entered second (order 2).
    assert.equal(slow.myOrder, 1);
    assert.equal(fast.myOrder, 2);
});

test('handlers registered to different ids do not share payload state', async () => {
    __resetCommandsForTests();
    const seen = [];
    registerCommand('alpha', p => { seen.push(['alpha', p]); return 'alpha-result'; });
    registerCommand('beta', p => { seen.push(['beta', p]); return 'beta-result'; });

    const [a, b] = await Promise.all([
        invokeCommand('alpha', { n: 1 }),
        invokeCommand('beta', { n: 2 }),
    ]);
    assert.equal(a, 'alpha-result');
    assert.equal(b, 'beta-result');
    assert.deepEqual(
        seen.sort((x, y) => x[0].localeCompare(y[0])),
        [['alpha', { n: 1 }], ['beta', { n: 2 }]],
    );
});

test('async handler rejection propagates as a rejected promise', async () => {
    __resetCommandsForTests();
    registerCommand('asyncBoom', async () => {
        await Promise.resolve();
        throw new Error('async failure');
    });
    await assert.rejects(() => invokeCommand('asyncBoom'), /async failure/);
});
