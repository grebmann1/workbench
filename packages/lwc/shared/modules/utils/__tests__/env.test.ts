import { test } from 'node:test';
import assert from 'node:assert/strict';

function setGlobal(key: string, value: unknown) {
    Object.defineProperty(globalThis, key, {
        value,
        writable: true,
        configurable: true,
    });
}

function delGlobal(key: string) {
    try {
        delete (globalThis as any)[key];
    } catch {
        setGlobal(key, undefined);
    }
}

const { isElectronApp, isChromeExtension, isMac } = await import('../env.ts');

test('isElectronApp: true when window.desktop present', () => {
    setGlobal('window', { desktop: {} });
    assert.equal(isElectronApp(), true);
});

test('isElectronApp: true when window.electron present', () => {
    setGlobal('window', { electron: {} });
    assert.equal(isElectronApp(), true);
});

test('isElectronApp: false when neither bridge present', () => {
    setGlobal('window', {});
    assert.equal(isElectronApp(), false);
});

test('isChromeExtension: true when chrome.runtime.id set', () => {
    setGlobal('chrome', { runtime: { id: 'abc' } });
    delGlobal('browser');
    assert.equal(isChromeExtension(), true);
});

test('isChromeExtension: true when browser.runtime.id set (firefox)', () => {
    setGlobal('chrome', undefined);
    setGlobal('browser', { runtime: { id: 'ff' } });
    assert.equal(isChromeExtension(), true);
});

test('isChromeExtension: false when neither present', () => {
    setGlobal('chrome', undefined);
    setGlobal('browser', undefined);
    assert.equal(isChromeExtension(), false);
});

test('isMac: true for Mac platform', () => {
    setGlobal('navigator', { platform: 'MacIntel' });
    assert.equal(isMac(), true);
});

test('isMac: false for non-Mac platform', () => {
    setGlobal('navigator', { platform: 'Win32' });
    assert.equal(isMac(), false);
});
