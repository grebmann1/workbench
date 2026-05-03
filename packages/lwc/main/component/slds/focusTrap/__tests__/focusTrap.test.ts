import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Minimal DOM shim matching the repo's hotkeysmanager.test.ts pattern.
 * The focus-trap utility needs: document.addEventListener /
 * removeEventListener (capture phase), document.activeElement, and
 * elements that respond to .focus() and .querySelectorAll().
 *
 * Rather than pulling jsdom (heavy), we wire up a small fake DOM that
 * satisfies the trap's assumptions. Covers tab cycling + focus restore.
 */

interface FakeEl {
    tagName: string;
    disabled?: boolean;
    hidden?: boolean;
    attrs: Record<string, string>;
    parent: FakeEl | null;
    children: FakeEl[];
    offsetParent: FakeEl | null;
    getClientRects: () => Array<unknown>;
    focus: () => void;
    addEventListener: () => void;
    removeEventListener: () => void;
    getAttribute: (name: string) => string | null;
    matches: (sel: string) => boolean;
    querySelectorAll: (sel: string) => FakeEl[];
}

let activeEl: FakeEl | null = null;
const keydownListeners: Array<(event: KeyboardEvent) => void> = [];

function makeEl(tagName: string, attrs: Record<string, string> = {}): FakeEl {
    const el: FakeEl = {
        tagName: tagName.toUpperCase(),
        attrs: { ...attrs },
        parent: null,
        children: [],
        offsetParent: { tagName: 'BODY' } as FakeEl,
        getClientRects: () => [{}],
        focus() {
            activeEl = el;
        },
        addEventListener() {},
        removeEventListener() {},
        getAttribute(name: string) {
            return el.attrs[name] ?? null;
        },
        matches(sel: string) {
            // Crude selector matcher — enough for the trap's filter list.
            const parts = sel.split(',').map(s => s.trim());
            for (const part of parts) {
                if (part === 'a[href]' && el.tagName === 'A' && el.attrs.href !== undefined)
                    return true;
                if (part === 'button:not([disabled])' && el.tagName === 'BUTTON' && !el.disabled)
                    return true;
                if (
                    part === 'input:not([disabled]):not([type="hidden"])' &&
                    el.tagName === 'INPUT' &&
                    !el.disabled &&
                    el.attrs.type !== 'hidden'
                )
                    return true;
                if (
                    part === '[tabindex]:not([tabindex="-1"])' &&
                    el.attrs.tabindex !== undefined &&
                    el.attrs.tabindex !== '-1'
                )
                    return true;
            }
            return false;
        },
        querySelectorAll(_sel: string) {
            const out: FakeEl[] = [];
            for (const child of el.children) {
                if (child.matches(_sel)) out.push(child);
                out.push(...child.querySelectorAll(_sel));
            }
            return out;
        },
    };
    return el;
}

function appendChild(parent: FakeEl, child: FakeEl): void {
    child.parent = parent;
    parent.children.push(child);
}

const documentStub = {
    get activeElement() {
        return activeEl;
    },
    addEventListener(type: string, handler: (event: KeyboardEvent) => void) {
        if (type === 'keydown') keydownListeners.push(handler);
    },
    removeEventListener(type: string, handler: (event: KeyboardEvent) => void) {
        if (type !== 'keydown') return;
        const i = keydownListeners.indexOf(handler);
        if (i >= 0) keydownListeners.splice(i, 1);
    },
};

(globalThis as unknown as { document?: unknown }).document ??= documentStub;
// Override even if an earlier test set one up — our shim is specialized.
Object.defineProperty(globalThis, 'document', { value: documentStub, writable: true });

function dispatchTab(shiftKey = false): boolean {
    let defaultPrevented = false;
    const event = {
        key: 'Tab',
        shiftKey,
        preventDefault: () => {
            defaultPrevented = true;
        },
    } as unknown as KeyboardEvent;
    for (const handler of keydownListeners) handler(event);
    return defaultPrevented;
}

// eslint-disable-next-line import/first
import { createFocusTrap, __focusableForTests } from '../focusTrap.ts';

test.beforeEach(() => {
    activeEl = null;
    keydownListeners.length = 0;
});

test('__focusableForTests: finds button, input, a[href], [tabindex]', () => {
    const root = makeEl('div');
    appendChild(root, makeEl('button'));
    appendChild(root, makeEl('input', { type: 'text' }));
    appendChild(root, makeEl('a', { href: '#' }));
    appendChild(root, makeEl('div', { tabindex: '0' }));
    // filter out: disabled button, hidden input, tabindex=-1
    const disabled = makeEl('button');
    disabled.disabled = true;
    appendChild(root, disabled);
    const focusables = __focusableForTests(root as unknown as ParentNode);
    assert.equal(focusables.length, 4);
});

test('createFocusTrap: activate focuses the first focusable element', () => {
    const root = makeEl('div');
    const first = makeEl('button');
    const second = makeEl('button');
    appendChild(root, first);
    appendChild(root, second);
    const trap = createFocusTrap(root as unknown as ParentNode);
    trap.activate();
    assert.equal(activeEl, first);
    trap.deactivate();
});

test('createFocusTrap: Tab from last element wraps to first', () => {
    const root = makeEl('div');
    const first = makeEl('button');
    const last = makeEl('button');
    appendChild(root, first);
    appendChild(root, last);
    const trap = createFocusTrap(root as unknown as ParentNode);
    trap.activate();
    activeEl = last;
    const prevented = dispatchTab(false);
    assert.equal(prevented, true);
    assert.equal(activeEl, first);
    trap.deactivate();
});

test('createFocusTrap: Shift+Tab from first element wraps to last', () => {
    const root = makeEl('div');
    const first = makeEl('button');
    const last = makeEl('button');
    appendChild(root, first);
    appendChild(root, last);
    const trap = createFocusTrap(root as unknown as ParentNode);
    trap.activate();
    activeEl = first;
    const prevented = dispatchTab(true);
    assert.equal(prevented, true);
    assert.equal(activeEl, last);
    trap.deactivate();
});

test('createFocusTrap: deactivate removes the keydown listener', () => {
    const root = makeEl('div');
    appendChild(root, makeEl('button'));
    const trap = createFocusTrap(root as unknown as ParentNode);
    trap.activate();
    assert.equal(keydownListeners.length, 1);
    trap.deactivate();
    assert.equal(keydownListeners.length, 0);
});

test('createFocusTrap: deactivate restores focus to previously focused element', () => {
    const outsideButton = makeEl('button');
    activeEl = outsideButton;
    const root = makeEl('div');
    const inside = makeEl('button');
    appendChild(root, inside);
    const trap = createFocusTrap(root as unknown as ParentNode);
    trap.activate();
    assert.equal(activeEl, inside);
    trap.deactivate();
    assert.equal(activeEl, outsideButton);
});

test('createFocusTrap: activate() is idempotent — second call does not re-register', () => {
    const root = makeEl('div');
    appendChild(root, makeEl('button'));
    const trap = createFocusTrap(root as unknown as ParentNode);
    trap.activate();
    trap.activate();
    assert.equal(keydownListeners.length, 1);
    trap.deactivate();
});

test('createFocusTrap: root=null returns a noop trap', () => {
    const trap = createFocusTrap(null);
    assert.doesNotThrow(() => trap.activate());
    assert.doesNotThrow(() => trap.deactivate());
    assert.equal(keydownListeners.length, 0);
});

test('createFocusTrap: with no focusable elements, Tab is prevented but does not crash', () => {
    const root = makeEl('div');
    const trap = createFocusTrap(root as unknown as ParentNode);
    trap.activate();
    const prevented = dispatchTab(false);
    assert.equal(prevented, true);
    trap.deactivate();
});
