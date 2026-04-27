import { test } from 'node:test';
import assert from 'node:assert/strict';
import logger from '../logger.ts';

function captureConsole() {
    const calls: unknown[][] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => { calls.push(args); };
    return {
        calls,
        restore() { console.log = original; },
    };
}

// NODE_ENV defaults to undefined under node:test — logger.isProduction should be false here.
test('logger: is not in production under test runner', () => {
    assert.equal(logger.isProduction, false);
});

test('logger.log: forwards args to console.log when not production', () => {
    const cap = captureConsole();
    try {
        logger.log('hello', 42);
    } finally { cap.restore(); }
    assert.deepEqual(cap.calls, [['hello', 42]]);
});

test('logger.info: prefixes with INFO', () => {
    const cap = captureConsole();
    try { logger.info('x'); } finally { cap.restore(); }
    assert.equal(cap.calls.length, 1);
    assert.match(String(cap.calls[0]?.[0]), /INFO:/);
    assert.equal(cap.calls[0]?.[1], 'x');
});

test('logger.success: prefixes with SUCCESS', () => {
    const cap = captureConsole();
    try { logger.success('ok'); } finally { cap.restore(); }
    assert.match(String(cap.calls[0]?.[0]), /SUCCESS:/);
});

test('logger.agent: prefixes with [AGENT]:', () => {
    const cap = captureConsole();
    try { logger.agent('m'); } finally { cap.restore(); }
    assert.match(String(cap.calls[0]?.[0]), /\[AGENT\]:/);
});

test('logger.warn: prefixes with WARNING', () => {
    const cap = captureConsole();
    try { logger.warn('w'); } finally { cap.restore(); }
    assert.match(String(cap.calls[0]?.[0]), /WARNING:/);
});

test('logger.error: prefixes with ERROR', () => {
    const cap = captureConsole();
    try { logger.error('e'); } finally { cap.restore(); }
    assert.match(String(cap.calls[0]?.[0]), /ERROR:/);
});

test('logger.debug: prefixes with DEBUG', () => {
    const cap = captureConsole();
    try { logger.debug('d'); } finally { cap.restore(); }
    assert.match(String(cap.calls[0]?.[0]), /DEBUG:/);
});

test('logger.log: passes through multiple args including objects', () => {
    const cap = captureConsole();
    const obj = { a: 1 };
    try { logger.log('prefix', obj, 123); } finally { cap.restore(); }
    assert.deepEqual(cap.calls, [['prefix', obj, 123]]);
});
