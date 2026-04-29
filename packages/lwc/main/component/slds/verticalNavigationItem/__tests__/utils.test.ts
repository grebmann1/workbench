import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hasSelectedDescendant } from '../utils.ts';

test('hasSelectedDescendant: empty / non-array → false', () => {
    assert.equal(hasSelectedDescendant([]), false);
    assert.equal(hasSelectedDescendant(null as any), false);
    assert.equal(hasSelectedDescendant(undefined as any), false);
});

test('hasSelectedDescendant: true when direct child selected', () => {
    assert.equal(hasSelectedDescendant([{ isSelected: false }, { isSelected: true }]), true);
});

test('hasSelectedDescendant: recurses through children', () => {
    const items = [
        {
            isSelected: false,
            children: [{ isSelected: false, children: [{ isSelected: true }] }],
        },
    ];
    assert.equal(hasSelectedDescendant(items), true);
});

test('hasSelectedDescendant: none selected → false', () => {
    const items = [{ isSelected: false, children: [{ isSelected: false }, { isSelected: false }] }];
    assert.equal(hasSelectedDescendant(items), false);
});
