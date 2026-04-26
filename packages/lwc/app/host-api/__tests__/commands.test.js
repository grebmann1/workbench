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
