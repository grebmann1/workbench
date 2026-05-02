import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    registerShortcut,
    listShortcuts,
    subscribeShortcuts,
    __resetShortcutsForTests,
} from '../shortcuts.ts';

test('registerShortcut + listShortcuts: round trip a single shortcut', () => {
    __resetShortcutsForTests();
    registerShortcut({
        id: 'skills.close',
        keys: 'Escape',
        label: 'Close skills panel',
        scope: 'Agent',
    });
    const all = listShortcuts();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'skills.close');
    assert.equal(all[0].keys, 'Escape');
});

test('listShortcuts: sorts by scope then label', () => {
    __resetShortcutsForTests();
    registerShortcut({ id: 'b', keys: 'B', label: 'Bravo', scope: 'Agent' });
    registerShortcut({ id: 'a', keys: 'A', label: 'Alpha', scope: 'Agent' });
    registerShortcut({ id: 'z', keys: 'Z', label: 'Zulu', scope: 'Settings' });
    const ids = listShortcuts().map(s => s.id);
    assert.deepEqual(ids, ['a', 'b', 'z']);
});

test('registerShortcut: unregister removes only its own entry', () => {
    __resetShortcutsForTests();
    const un1 = registerShortcut({ id: 'a', keys: 'A', label: 'A' });
    registerShortcut({ id: 'b', keys: 'B', label: 'B' });
    un1();
    assert.deepEqual(listShortcuts().map(s => s.id), ['b']);
});

test('registerShortcut: re-registering the same id replaces (hot reload)', () => {
    __resetShortcutsForTests();
    registerShortcut({ id: 'a', keys: 'A', label: 'First' });
    registerShortcut({ id: 'a', keys: 'A', label: 'Second' });
    assert.equal(listShortcuts()[0].label, 'Second');
});

test('registerShortcut: missing id / keys / label throws', () => {
    __resetShortcutsForTests();
    assert.throws(() => registerShortcut({ id: '', keys: 'A', label: 'X' } as never));
    assert.throws(() => registerShortcut({ id: 'x', keys: '', label: 'X' } as never));
    assert.throws(() => registerShortcut({ id: 'x', keys: 'A', label: '' } as never));
});

test('subscribeShortcuts: notified on register + unregister', () => {
    __resetShortcutsForTests();
    let calls = 0;
    const unsubscribe = subscribeShortcuts(() => {
        calls += 1;
    });
    const un1 = registerShortcut({ id: 'a', keys: 'A', label: 'A' });
    un1();
    unsubscribe();
    registerShortcut({ id: 'b', keys: 'B', label: 'B' });
    assert.equal(calls, 2); // one for register, one for unregister — no call after unsubscribe
});

test('subscribeShortcuts: a throwing listener does not break sibling listeners', () => {
    __resetShortcutsForTests();
    let good = 0;
    subscribeShortcuts(() => {
        throw new Error('boom');
    });
    subscribeShortcuts(() => {
        good += 1;
    });
    registerShortcut({ id: 'a', keys: 'A', label: 'A' });
    assert.equal(good, 1);
});
