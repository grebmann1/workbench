import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateOverflow } from '../sldsOverflowLibrary.ts';

test('calculateOverflow: all items fit → visibleItems=items, no overflow', () => {
    const items = [
        { width: 30, value: 'a' },
        { width: 40, value: 'b' },
    ];
    const out = calculateOverflow({ items, containerWidth: 200, overflowWidth: 20 });
    assert.deepEqual(out.visibleItems, items);
    assert.deepEqual(out.overflowItems, []);
});

test('calculateOverflow: containerWidth <= 0 returns all visible (no math)', () => {
    const items = [{ width: 100, value: 'x' }];
    const out = calculateOverflow({ items, containerWidth: 0, overflowWidth: 20 });
    assert.deepEqual(out.visibleItems, items);
});

test('calculateOverflow: overflowing items pushed to overflow bucket', () => {
    const items = [
        { width: 50, value: 'a' },
        { width: 50, value: 'b' },
        { width: 50, value: 'c' },
    ];
    const out = calculateOverflow({ items, containerWidth: 80, overflowWidth: 20 });
    // overflow eats 20 of 80 → only 60 left. 'a' (50) fits, then 'b' does not.
    assert.equal(out.visibleItems.length, 1);
    assert.equal(out.visibleItems[0].value, 'a');
    assert.equal(out.overflowItems.length, 2);
});

test('calculateOverflow: activeItem already visible stays in place', () => {
    const items = [
        { width: 30, value: 'a' },
        { width: 30, value: 'b' },
        { width: 30, value: 'c' },
    ];
    const activeItem = items[0];
    const out = calculateOverflow({
        items,
        activeItem,
        containerWidth: 70,
        overflowWidth: 20,
    });
    assert.equal(out.visibleItems[0].value, 'a');
});

test('calculateOverflow: activeItem not naturally visible gets appended to visible list', () => {
    const items = [
        { width: 50, value: 'a' },
        { width: 50, value: 'b' },
        { width: 50, value: 'c' },
    ];
    const activeItem = items[2];
    const out = calculateOverflow({
        items,
        activeItem,
        containerWidth: 90,
        overflowWidth: 20,
    });
    assert.ok(out.visibleItems.some(i => i.value === 'c'));
});
