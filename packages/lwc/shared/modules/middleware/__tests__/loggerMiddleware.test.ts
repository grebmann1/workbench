import assert from 'node:assert/strict';
import { test } from 'node:test';

import loggerMiddleware from '../middleware.ts';

function captureConsole() {
    const log: unknown[][] = [];
    const info: unknown[][] = [];
    const groupCalls: unknown[][] = [];
    let groupEndCount = 0;
    const orig = {
        log: console.log,
        info: console.info,
        group: console.group,
        groupEnd: console.groupEnd,
    };
    console.log = (...a) => log.push(a);
    console.info = (...a) => info.push(a);
    console.group = (...a) => groupCalls.push(a);
    console.groupEnd = () => {
        groupEndCount++;
    };
    return {
        log,
        info,
        groupCalls,
        get groupEndCount() {
            return groupEndCount;
        },
        restore() {
            console.log = orig.log;
            console.info = orig.info;
            console.group = orig.group;
            console.groupEnd = orig.groupEnd;
        },
    };
}

const fakeStore = { getState: () => ({ mock: true }), dispatch: () => undefined };

test('loggerMiddleware: invokes next(action) with the action', () => {
    const cap = captureConsole();
    let receivedAction: unknown;
    const next = (a: unknown) => {
        receivedAction = a;
        return 'next-result';
    };
    try {
        const enhanced = loggerMiddleware(fakeStore as never)(next);
        const result = enhanced({ type: 'TEST/action', payload: 42 });
        assert.equal(result, 'next-result');
        assert.deepEqual(receivedAction, { type: 'TEST/action', payload: 42 });
    } finally {
        cap.restore();
    }
});

test('loggerMiddleware: groups logs using action.type', () => {
    const cap = captureConsole();
    try {
        loggerMiddleware(fakeStore as never)(() => undefined)({ type: 'counter/increment' });
    } finally {
        cap.restore();
    }
    assert.deepEqual(cap.groupCalls, [['counter/increment']]);
    assert.equal(cap.groupEndCount, 1);
});

test('loggerMiddleware: falls back to "unknown" for missing action.type', () => {
    const cap = captureConsole();
    try {
        loggerMiddleware(fakeStore as never)(() => undefined)({ payload: 1 } as never);
    } finally {
        cap.restore();
    }
    assert.deepEqual(cap.groupCalls, [['unknown']]);
});

test('loggerMiddleware: falls back to "unknown" for non-object actions', () => {
    const cap = captureConsole();
    try {
        loggerMiddleware(fakeStore as never)(() => undefined)('not-an-object' as never);
    } finally {
        cap.restore();
    }
    assert.deepEqual(cap.groupCalls, [['unknown']]);
});

test('loggerMiddleware: does not mutate the action', () => {
    const cap = captureConsole();
    const action = { type: 'x/y', payload: { nested: true } };
    const frozen = JSON.parse(JSON.stringify(action));
    try {
        loggerMiddleware(fakeStore as never)(() => undefined)(action);
    } finally {
        cap.restore();
    }
    assert.deepEqual(action, frozen);
});
