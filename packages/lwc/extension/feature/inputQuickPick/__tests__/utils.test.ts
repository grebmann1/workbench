import assert from 'node:assert/strict';
import { test } from 'node:test';

function setNavigatorPlatform(platform: string) {
    Object.defineProperty(globalThis, 'navigator', {
        value: { platform },
        configurable: true,
        writable: true,
    });
}

setNavigatorPlatform('MacIntel');
(globalThis as any).window = { innerWidth: 1024, innerHeight: 768 };

const mod = await import('../utils.ts');
const { isMac, isTextInputLike, positionFor, positionForFallback } = mod as any;

test('isMac: true for MacIntel navigator.platform', () => {
    setNavigatorPlatform('MacIntel');
    assert.equal(isMac(), true);
});

test('isMac: false for Win32', () => {
    setNavigatorPlatform('Win32');
    assert.equal(isMac(), false);
});

test('isTextInputLike: returns false for null', () => {
    assert.equal(isTextInputLike(null), false);
});

test('isTextInputLike: INPUT with text-like type is true', () => {
    const el = {
        tagName: 'INPUT',
        getAttribute: (name: string) => (name === 'type' ? 'text' : ''),
    };
    assert.equal(isTextInputLike(el), true);
});

test('isTextInputLike: INPUT checkbox is false', () => {
    const el = {
        tagName: 'INPUT',
        getAttribute: () => 'checkbox',
    };
    assert.equal(isTextInputLike(el), false);
});

test('isTextInputLike: TEXTAREA is true', () => {
    assert.equal(isTextInputLike({ tagName: 'TEXTAREA' }), true);
});

test('isTextInputLike: contentEditable is true', () => {
    assert.equal(isTextInputLike({ tagName: 'DIV', isContentEditable: true }), true);
});

test('positionFor: below-viewport preferred when spaceBelow sufficient', () => {
    (globalThis as any).window = { innerWidth: 1024, innerHeight: 768 };
    const target = {
        getBoundingClientRect: () => ({ left: 100, top: 100, bottom: 120, right: 200 }),
    };
    const container = { offsetWidth: 320, offsetHeight: 160, style: {} as any };
    const { top, left } = positionFor(target, container);
    assert.equal(top, 126); // 120 + 6 margin
    assert.equal(left, 100);
    assert.equal(container.style.top, '126px');
});

test('positionFor: flips above when not enough space below', () => {
    (globalThis as any).window = { innerWidth: 1024, innerHeight: 200 };
    const target = {
        getBoundingClientRect: () => ({ left: 50, top: 180, bottom: 195, right: 100 }),
    };
    const container = { offsetWidth: 320, offsetHeight: 160, style: {} as any };
    const { top } = positionFor(target, container);
    // spaceBelow < 160 → should flip above to top=180-160-6=14
    assert.equal(top, 14);
});

test('positionForFallback: centers container', () => {
    (globalThis as any).window = { innerWidth: 800, innerHeight: 600 };
    const container = { offsetWidth: 200, offsetHeight: 100, style: {} as any };
    const { top, left } = positionForFallback(container);
    assert.equal(top, 250); // (600-100)/2
    assert.equal(left, 300); // (800-200)/2
});
