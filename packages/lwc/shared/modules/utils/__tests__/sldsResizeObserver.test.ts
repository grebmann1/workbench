import assert from 'node:assert/strict';
import { test } from 'node:test';

type ROInstance = {
    observed: Element[];
    disconnected: boolean;
    callback: () => void;
};
const roInstances: ROInstance[] = [];

class FakeResizeObserver {
    observed: Element[] = [];
    disconnected = false;
    callback: () => void;
    constructor(cb: () => void) {
        this.callback = cb;
        roInstances.push(this as unknown as ROInstance);
    }
    observe(el: Element) {
        this.observed.push(el);
    }
    disconnect() {
        this.disconnected = true;
    }
}

let rafQueue: Array<(n: number) => void> = [];
let rafId = 0;
let cancelled: number[] = [];
const windowListeners: Record<string, Array<(...args: unknown[]) => void>> = {};

function installGlobals(withResizeObserver: boolean) {
    rafQueue = [];
    cancelled = [];
    rafId = 0;
    for (const k of Object.keys(windowListeners)) delete windowListeners[k];
    roInstances.length = 0;

    if (withResizeObserver) {
        Object.defineProperty(globalThis, 'ResizeObserver', {
            value: FakeResizeObserver,
            writable: true,
            configurable: true,
        });
    } else {
        Object.defineProperty(globalThis, 'ResizeObserver', {
            value: undefined,
            writable: true,
            configurable: true,
        });
    }

    Object.defineProperty(globalThis, 'requestAnimationFrame', {
        value: (cb: (n: number) => void) => {
            rafQueue.push(cb);
            return ++rafId;
        },
        writable: true,
        configurable: true,
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
        value: (id: number) => {
            cancelled.push(id);
        },
        writable: true,
        configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
        value: {
            requestAnimationFrame: (cb: (n: number) => void) => {
                rafQueue.push(cb);
                return ++rafId;
            },
            addEventListener(name: string, cb: (...args: unknown[]) => void) {
                (windowListeners[name] ||= []).push(cb);
            },
            removeEventListener(name: string, cb: (...args: unknown[]) => void) {
                const arr = windowListeners[name];
                if (!arr) return;
                const i = arr.indexOf(cb);
                if (i >= 0) arr.splice(i, 1);
            },
        },
        writable: true,
        configurable: true,
    });
}

installGlobals(true);
const { LightningResizeObserver } = await import('../sldsResizeObserver.ts');

function flushRaf() {
    const queue = rafQueue.slice();
    rafQueue = [];
    for (const cb of queue) cb(0);
}

test('LightningResizeObserver: uses ResizeObserver when available', () => {
    installGlobals(true);
    const cb = () => {};
    const observer = new (LightningResizeObserver as unknown as new (cb: () => void) => {
        observe: (el: Element) => void;
        disconnect: () => void;
    })(cb);

    observer.observe({} as Element);
    flushRaf();

    assert.equal(roInstances.length, 1);
    assert.equal(roInstances[0].observed.length, 1);
    assert.equal((windowListeners.resize ?? []).length, 0);
});

test('LightningResizeObserver: falls back to window resize listener when ResizeObserver missing', () => {
    installGlobals(false);
    const observer = new (LightningResizeObserver as unknown as new (cb: () => void) => {
        observe: (el: Element) => void;
        disconnect: () => void;
    })(() => {});

    observer.observe({} as Element);
    flushRaf();

    assert.equal(roInstances.length, 0);
    assert.equal((windowListeners.resize ?? []).length, 1);
});

test('LightningResizeObserver: disconnect calls RO.disconnect + cancels raf + removes listener', () => {
    installGlobals(true);
    const observer = new (LightningResizeObserver as unknown as new (cb: () => void) => {
        observe: (el: Element) => void;
        disconnect: () => void;
    })(() => {});

    observer.observe({} as Element);
    // Do not flush raf so cancellation path exercises the stored request id
    observer.disconnect();

    assert.equal(roInstances[0].disconnected, true);
    assert.ok(cancelled.length >= 1);
    assert.equal((windowListeners.resize ?? []).length, 0);
});

test('LightningResizeObserver: fallback listener is removed on disconnect', () => {
    installGlobals(false);
    const observer = new (LightningResizeObserver as unknown as new (cb: () => void) => {
        observe: (el: Element) => void;
        disconnect: () => void;
    })(() => {});

    observer.observe({} as Element);
    flushRaf();
    assert.equal((windowListeners.resize ?? []).length, 1);

    observer.disconnect();
    assert.equal((windowListeners.resize ?? []).length, 0);
});
