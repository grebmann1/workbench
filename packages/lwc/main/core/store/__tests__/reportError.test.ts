import { test } from 'node:test';
import assert from 'node:assert/strict';

import { storeRef } from '../storeRef.ts';
import { reportError } from '../reportError.ts';

function makeCapturingStore() {
    const actions: any[] = [];
    return {
        store: {
            dispatch: (action: any) => {
                actions.push(action);
                return action;
            },
            getState: () => ({}),
        },
        actions,
    };
}

test('reportError: no-op when store is unset', () => {
    storeRef.current = null;
    assert.doesNotThrow(() => reportError('boom'));
});

test('reportError: Error instance → message + stack as details', () => {
    const { store, actions } = makeCapturingStore();
    storeRef.current = store as any;
    const err = new Error('boom');
    reportError(err, { source: 'agent' });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].payload.message, 'boom');
    assert.equal(actions[0].payload.source, 'agent');
    assert.ok(actions[0].payload.details.includes('Error'));
    storeRef.current = null;
});

test('reportError: string error → used as message, empty details', () => {
    const { store, actions } = makeCapturingStore();
    storeRef.current = store as any;
    reportError('plain-msg', { details: 'extra-info' });
    assert.equal(actions[0].payload.message, 'plain-msg');
    assert.equal(actions[0].payload.details, 'extra-info');
    storeRef.current = null;
});

test('reportError: object with message/details/source → extracted fields', () => {
    const { store, actions } = makeCapturingStore();
    storeRef.current = store as any;
    reportError({ message: 'm', details: 'd', source: 's' });
    assert.equal(actions[0].payload.message, 'm');
    assert.equal(actions[0].payload.details, 'd');
    assert.equal(actions[0].payload.source, 's');
    storeRef.current = null;
});

test('reportError: options.source overrides error.source', () => {
    const { store, actions } = makeCapturingStore();
    storeRef.current = store as any;
    reportError({ message: 'm', source: 'inner' }, { source: 'override' });
    assert.equal(actions[0].payload.source, 'override');
    storeRef.current = null;
});

test('reportError: falsy error → "Unknown error" fallback', () => {
    const { store, actions } = makeCapturingStore();
    storeRef.current = store as any;
    reportError(null as any);
    assert.equal(actions[0].payload.message, 'Unknown error');
    storeRef.current = null;
});
