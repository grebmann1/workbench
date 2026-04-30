import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    keyCodes,
    normalizeKeyValue,
    isShiftMetaOrControlKey,
    runActionOnBufferedTypedCharacters,
} from '../keyboard.ts';

test('keyCodes: exposes common key codes', () => {
    assert.equal(keyCodes.enter, 13);
    assert.equal(keyCodes.escape, 27);
    assert.equal(keyCodes.tab, 9);
});

test('normalizeKeyValue: rewrites legacy key names to modern ones', () => {
    assert.equal(normalizeKeyValue('Spacebar'), ' ');
    assert.equal(normalizeKeyValue('Esc'), 'Escape');
    assert.equal(normalizeKeyValue('Del'), 'Delete');
    assert.equal(normalizeKeyValue('Left'), 'ArrowLeft');
    assert.equal(normalizeKeyValue('Right'), 'ArrowRight');
    assert.equal(normalizeKeyValue('Up'), 'ArrowUp');
    assert.equal(normalizeKeyValue('Down'), 'ArrowDown');
});

test('normalizeKeyValue: passes other values through', () => {
    assert.equal(normalizeKeyValue('a'), 'a');
    assert.equal(normalizeKeyValue('Enter'), 'Enter');
});

test('isShiftMetaOrControlKey: returns true when any modifier is pressed', () => {
    assert.equal(
        isShiftMetaOrControlKey({
            shiftKey: true,
            metaKey: false,
            ctrlKey: false,
        } as KeyboardEvent),
        true
    );
    assert.equal(
        isShiftMetaOrControlKey({
            shiftKey: false,
            metaKey: true,
            ctrlKey: false,
        } as KeyboardEvent),
        true
    );
    assert.equal(
        isShiftMetaOrControlKey({
            shiftKey: false,
            metaKey: false,
            ctrlKey: true,
        } as KeyboardEvent),
        true
    );
});

test('isShiftMetaOrControlKey: false with no modifiers', () => {
    assert.equal(
        isShiftMetaOrControlKey({
            shiftKey: false,
            metaKey: false,
            ctrlKey: false,
        } as KeyboardEvent),
        false
    );
});

test('runActionOnBufferedTypedCharacters: accumulates + fires action with lowercase buffer', () => {
    const seen: string[] = [];
    const ev = (key: string) => ({ key }) as KeyboardEvent;
    runActionOnBufferedTypedCharacters(ev('H'), m => seen.push(m));
    runActionOnBufferedTypedCharacters(ev('i'), m => seen.push(m));
    assert.deepEqual(seen, ['h', 'hi']);
});

test('runActionOnBufferedTypedCharacters: ignores non-single-character keys', () => {
    const seen: string[] = [];
    const ev = (key: string) => ({ key }) as KeyboardEvent;
    runActionOnBufferedTypedCharacters(ev('Enter'), m => seen.push(m));
    assert.deepEqual(seen, []);
});
