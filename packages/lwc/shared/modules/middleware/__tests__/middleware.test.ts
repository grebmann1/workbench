import assert from 'node:assert/strict';
import { test } from 'node:test';

import loggerMiddleware from '../middleware.ts';

function captureConsole() {
    const logs: any[] = [];
    const orig = {
        group: console.group,
        info: console.info,
        groupEnd: console.groupEnd,
        log: console.log,
    };
    console.group = (...args: any[]) => {
        logs.push(['group', ...args]);
    };
    console.info = (...args: any[]) => {
        logs.push(['info', ...args]);
    };
    console.groupEnd = () => {
        logs.push(['groupEnd']);
    };
    console.log = () => {};
    return {
        logs,
        restore: () => {
            Object.assign(console, orig);
        },
    };
}

test('loggerMiddleware: passes action to next and returns its result', () => {
    const cap = captureConsole();
    try {
        const store = { getState: () => ({}), dispatch: () => {} } as any;
        const next = (action: any) => ({ forwarded: action });
        const result = loggerMiddleware(store)(next)({ type: 'FOO/bar', payload: 1 });
        assert.deepEqual(result, { forwarded: { type: 'FOO/bar', payload: 1 } });
        // group was called with the action type
        assert.ok(cap.logs.some(l => l[0] === 'group' && l[1] === 'FOO/bar'));
        assert.ok(cap.logs.some(l => l[0] === 'groupEnd'));
    } finally {
        cap.restore();
    }
});

test('loggerMiddleware: unknown action shape falls back to "unknown"', () => {
    const cap = captureConsole();
    try {
        const store = { getState: () => ({}) } as any;
        const next = (a: any) => a;
        loggerMiddleware(store)(next)(null);
        assert.ok(cap.logs.some(l => l[0] === 'group' && l[1] === 'unknown'));
    } finally {
        cap.restore();
    }
});
