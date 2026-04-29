import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sortObjectsByField, getCurrentRank } from '../sorting.ts';

test('sortObjectsByField: orders objects by the given explicit sequence', () => {
    const items = [
        { id: 'c', weight: 1 },
        { id: 'a', weight: 2 },
        { id: 'b', weight: 3 },
    ];
    const sorted = sortObjectsByField(items, 'id', ['a', 'b', 'c']);
    assert.deepEqual(
        sorted.map(i => i.id),
        ['a', 'b', 'c']
    );
});

test('sortObjectsByField: unknown values sink to the end (ranked 999)', () => {
    const items = [{ id: 'z' }, { id: 'a' }, { id: 'y' }];
    const sorted = sortObjectsByField(items, 'id', ['a']);
    // 'a' first, then the two unknowns in their original relative order.
    assert.equal(sorted[0].id, 'a');
});

test('getCurrentRank: returns the index of the first matching item', () => {
    const mapping = ['red', 'green', 'blue'];
    assert.equal(
        getCurrentRank(mapping, c => c === 'green'),
        1
    );
});

test('getCurrentRank: returns length-1 when nothing matches', () => {
    const mapping = ['x', 'y', 'z'];
    assert.equal(
        getCurrentRank(mapping, () => false),
        2
    );
});
