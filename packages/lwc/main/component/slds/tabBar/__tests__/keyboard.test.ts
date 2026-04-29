import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keyCodes } from 'shared/utils';

import { handleKeyDownOnTabList } from '../keyboard.ts';

function makeEvent(keyCode: number) {
    let prevented = false;
    let stopped = false;
    return {
        keyCode,
        preventDefault: () => {
            prevented = true;
        },
        stopPropagation: () => {
            stopped = true;
        },
        wasPrevented: () => prevented,
        wasStopped: () => stopped,
    };
}

function makeTabset(vertical: boolean, total: number) {
    let selected = -1;
    return {
        isVerticalOrientation: () => vertical,
        totalTabs: () => total,
        selectTabIndex: (i: number) => {
            selected = i;
        },
        selectedIndex: () => selected,
    };
}

test('keyboard: horizontal right-arrow advances by 1', () => {
    const evt = makeEvent(keyCodes.right);
    const ts = makeTabset(false, 4);
    handleKeyDownOnTabList(evt as any, 1, ts as any);
    assert.equal(ts.selectedIndex(), 2);
    assert.equal(evt.wasPrevented(), true);
});

test('keyboard: horizontal left-arrow wraps around at 0 → total-1', () => {
    const evt = makeEvent(keyCodes.left);
    const ts = makeTabset(false, 4);
    handleKeyDownOnTabList(evt as any, 0, ts as any);
    assert.equal(ts.selectedIndex(), 3);
});

test('keyboard: horizontal right-arrow wraps at end → 0', () => {
    const evt = makeEvent(keyCodes.right);
    const ts = makeTabset(false, 3);
    handleKeyDownOnTabList(evt as any, 2, ts as any);
    assert.equal(ts.selectedIndex(), 0);
});

test('keyboard: vertical up-arrow wraps from 0 → total-1', () => {
    const evt = makeEvent(keyCodes.up);
    const ts = makeTabset(true, 5);
    handleKeyDownOnTabList(evt as any, 0, ts as any);
    assert.equal(ts.selectedIndex(), 4);
});

test('keyboard: vertical down-arrow advances', () => {
    const evt = makeEvent(keyCodes.down);
    const ts = makeTabset(true, 5);
    handleKeyDownOnTabList(evt as any, 1, ts as any);
    assert.equal(ts.selectedIndex(), 2);
});

test('keyboard: mismatched orientation is a no-op', () => {
    // horizontal tabset, up/down → no selection change
    const evt = makeEvent(keyCodes.up);
    const ts = makeTabset(false, 5);
    handleKeyDownOnTabList(evt as any, 1, ts as any);
    assert.equal(ts.selectedIndex(), -1);
    assert.equal(evt.wasPrevented(), false);
});

test('keyboard: non-arrow keys are ignored', () => {
    const evt = makeEvent(keyCodes.enter);
    const ts = makeTabset(false, 5);
    handleKeyDownOnTabList(evt as any, 1, ts as any);
    assert.equal(ts.selectedIndex(), -1);
    assert.equal(evt.wasPrevented(), false);
});
