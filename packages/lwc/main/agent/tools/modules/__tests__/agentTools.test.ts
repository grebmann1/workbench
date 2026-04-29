import { test } from 'node:test';
import assert from 'node:assert/strict';

const listeners: Record<string, ((e: any) => void)[]> = {};
class FakeCustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init: { detail?: any } = {}) {
        this.type = type;
        this.detail = init.detail;
    }
}
Object.defineProperty(globalThis, 'window', {
    value: {
        addEventListener(type: string, cb: (e: any) => void) {
            (listeners[type] ||= []).push(cb);
        },
        dispatchEvent(event: any) {
            (listeners[event.type] || []).forEach(cb => cb(event));
            return true;
        },
    },
    writable: true,
    configurable: true,
});
Object.defineProperty(globalThis, 'CustomEvent', {
    value: FakeCustomEvent,
    writable: true,
    configurable: true,
});

const { askUserTool } = await import('../agentTools.ts');
const { resolveQuestion, rejectQuestion } = await import('../askUserBridge.ts');

test('askUserTool: shape + name', () => {
    assert.equal(askUserTool.type, 'function');
    assert.equal(typeof askUserTool.name, 'string');
    assert.ok(askUserTool.name.length > 0);
    assert.equal(typeof askUserTool.execute, 'function');
});

test('askUserTool.execute: dispatches agent:ask_user and resolves with answer prefix', async () => {
    const seen: any[] = [];
    (globalThis as any).window.addEventListener('agent:ask_user', (e: any) => {
        seen.push(e.detail);
        setTimeout(() => resolveQuestion(e.detail.id, 'yes'), 1);
    });
    const result = await askUserTool.execute({
        description: 'why',
        question: 'Ready?',
        options: ['yes', 'no'],
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].question, 'Ready?');
    assert.deepEqual(seen[0].options, ['yes', 'no']);
    assert.ok(String(result).includes('yes'));
});

test('askUserTool.execute: rejected question yields skipped answer (no throw)', async () => {
    (globalThis as any).window.addEventListener('agent:ask_user', (e: any) => {
        setTimeout(() => rejectQuestion(e.detail.id), 1);
    });
    const result = await askUserTool.execute({
        description: 'd',
        question: 'q',
        options: ['a', 'b'],
    });
    assert.equal(typeof result, 'string');
    // skippedAnswer constant — just assert it's non-empty
    assert.ok(result.length > 0);
});

test('askUserTool.execute: filters falsy options before emitting event', async () => {
    let captured: any = null;
    (globalThis as any).window.addEventListener('agent:ask_user', (e: any) => {
        captured = e.detail;
        setTimeout(() => resolveQuestion(e.detail.id, 'ok'), 1);
    });
    await askUserTool.execute({
        description: 'd',
        question: 'q',
        options: ['a', '', 'b'] as any,
    });
    assert.deepEqual(captured.options, ['a', 'b']);
});
