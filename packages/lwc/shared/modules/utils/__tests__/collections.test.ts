import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupBy, chunkArray, removeDuplicates, arrayToMap } from '../collections.ts';

test('groupBy: groups records by string key value', () => {
    const input = [
        { id: 1, kind: 'a' },
        { id: 2, kind: 'b' },
        { id: 3, kind: 'a' },
    ];
    const result = groupBy(input, 'kind');
    assert.deepEqual(result, {
        a: [{ id: 1, kind: 'a' }, { id: 3, kind: 'a' }],
        b: [{ id: 2, kind: 'b' }],
    });
});

test('groupBy: empty input yields empty object', () => {
    assert.deepEqual(groupBy([] as Array<{ k: string }>, 'k'), {});
});

test('groupBy: coerces non-string keys via String()', () => {
    const input = [{ id: 1 }, { id: 2 }, { id: 1 }];
    const result = groupBy(input as Array<Record<string, unknown>>, 'id');
    assert.deepEqual(Object.keys(result).sort(), ['1', '2']);
    assert.equal(result['1'].length, 2);
});

test('chunkArray: splits into chunks of specified size', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('chunkArray: default chunk size is 5', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5, 6, 7]), [[1, 2, 3, 4, 5], [6, 7]]);
});

test('chunkArray: empty input yields empty output', () => {
    assert.deepEqual(chunkArray([]), []);
});

test('chunkArray: chunk size larger than input returns a single chunk', () => {
    assert.deepEqual(chunkArray([1, 2], 10), [[1, 2]]);
});

test('removeDuplicates: removes duplicates by the provided property, keeping first occurrence', () => {
    const input = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'c' },
        { id: 3, name: 'd' },
    ];
    assert.deepEqual(removeDuplicates(input, 'id'), [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'd' },
    ]);
});

test('removeDuplicates: empty input yields empty output', () => {
    assert.deepEqual(removeDuplicates([] as Array<{ id: number }>, 'id'), []);
});

test('arrayToMap: keys by id field using String()', () => {
    const input = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }];
    assert.deepEqual(arrayToMap(input, 'id'), { '1': { id: 1, v: 'a' }, '2': { id: 2, v: 'b' } });
});

test('arrayToMap: merges in attributes object', () => {
    const input = [{ id: 'x', v: 1 }];
    assert.deepEqual(arrayToMap(input, 'id', { flag: true }), {
        x: { id: 'x', v: 1, flag: true },
    });
});

test('arrayToMap: uses custom formatter when provided', () => {
    const input = [{ id: 'foo', v: 1 }];
    assert.deepEqual(
        arrayToMap(input, 'id', undefined, v => v.toUpperCase()),
        { FOO: { id: 'foo', v: 1 } },
    );
});
