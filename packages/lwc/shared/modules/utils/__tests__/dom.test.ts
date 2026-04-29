import assert from 'node:assert/strict';
import { test } from 'node:test';

const bodyEl = { style: { overflow: 'initial' } };
Object.defineProperty(globalThis, 'document', {
    value: {
        querySelector: (sel: string) => (sel === 'body' ? bodyEl : null),
    },
    writable: true,
    configurable: true,
});

let rafCb: ((n: number) => void) | null = null;
Object.defineProperty(globalThis, 'window', {
    value: {
        requestAnimationFrame: (cb: (n: number) => void) => {
            rafCb = cb;
            return 42;
        },
    },
    writable: true,
    configurable: true,
});

const { enableBodyScroll, disableBodyScroll, timeout, animationFrame } = await import('../dom.ts');

test('disableBodyScroll: sets body overflow to hidden', () => {
    bodyEl.style.overflow = '';
    disableBodyScroll();
    assert.equal(bodyEl.style.overflow, 'hidden');
});

test('enableBodyScroll: clears body overflow', () => {
    bodyEl.style.overflow = 'hidden';
    enableBodyScroll();
    assert.equal(bodyEl.style.overflow, '');
});

test('timeout: resolves after interval', async () => {
    const start = Date.now();
    await timeout(10);
    assert.ok(Date.now() - start >= 5);
});

test('animationFrame: resolves with the rAF argument', async () => {
    const pending = animationFrame();
    rafCb?.(123);
    const value = await pending;
    assert.equal(value, 123);
});
