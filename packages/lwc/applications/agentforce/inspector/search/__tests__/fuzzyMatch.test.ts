/**
 * Tests for the inspector's pure fuzzy-match module.
 *
 * Architectural non-negotiables verified here:
 *   - Substring + token-prefix matching only (no Levenshtein).
 *   - 50-item cap with `truncated` flag.
 *   - Empty query is identity.
 *   - Score ordering: score DESC then label ASC.
 *
 * Soft perf benchmark on a 100k-item synthetic index is logged but not
 * asserted (CI variance).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fuzzyMatch, search, type IndexedItem, type LabelType } from '../fuzzyMatch.ts';

function mkItem(
    id: string,
    label: string,
    type: LabelType = 'agent',
    parentId: string | null = null,
    devName?: string
): IndexedItem {
    return { id, label, type, parentId, devName };
}

test('fuzzyMatch: exact match returns score 1.0 with full-range highlight', () => {
    const r = fuzzyMatch('OrderLookup', 'OrderLookup');
    assert.ok(r);
    assert.equal(r.score, 1);
    assert.deepEqual(r.ranges, [[0, 'OrderLookup'.length]]);
});

test('fuzzyMatch: substring match returns ~0.5 with substring highlight', () => {
    const r = fuzzyMatch('rder', 'OrderLookup');
    assert.ok(r);
    assert.equal(r.score, 0.5);
    assert.deepEqual(r.ranges, [[1, 5]]);
});

test('fuzzyMatch: token-prefix match returns ~0.8 with token highlight', () => {
    const r = fuzzyMatch('Order', 'OrderLookup');
    assert.ok(r);
    // Token-prefix wins over substring; first token starts at 0.
    assert.equal(r.score, 0.8);
    assert.deepEqual(r.ranges, [[0, 5]]);
});

test('fuzzyMatch: token-prefix matches second camelCase token', () => {
    const r = fuzzyMatch('Look', 'OrderLookup');
    assert.ok(r);
    assert.equal(r.score, 0.8);
    assert.deepEqual(r.ranges, [[5, 9]]);
});

test('fuzzyMatch: case-insensitive', () => {
    const r = fuzzyMatch('order', 'ORDER');
    assert.ok(r);
    assert.equal(r.score, 1);
});

test('fuzzyMatch: accent-insensitive (cafe matches Café)', () => {
    const r = fuzzyMatch('cafe', 'Café');
    assert.ok(r);
    assert.ok(r.score >= 0.8);
});

test('fuzzyMatch: multi-word query matches multiple tokens', () => {
    // Adjacent ranges [0,5] and [5,9] are merged into a single span — the
    // visual outcome is identical (one continuous <mark>) and prevents
    // duplicate-DOM nodes for back-to-back tokens.
    const r = fuzzyMatch('order look', 'OrderLookup');
    assert.ok(r);
    assert.deepEqual(r.ranges, [[0, 9]]);

    // Non-adjacent words stay separate.
    const r2 = fuzzyMatch('order up', 'OrderLookup');
    assert.ok(r2);
    assert.equal(r2.ranges.length, 2);
});

test('fuzzyMatch: no match returns null', () => {
    assert.equal(fuzzyMatch('xyz', 'OrderLookup'), null);
});

test('fuzzyMatch: empty query returns null', () => {
    assert.equal(fuzzyMatch('', 'OrderLookup'), null);
    assert.equal(fuzzyMatch('   ', 'OrderLookup'), null);
});

test('fuzzyMatch: camelCase tokenization splits HTTPData correctly', () => {
    // 'HTTP' is one token, 'Data' is another
    const r = fuzzyMatch('Data', 'fetchHTTPData');
    assert.ok(r);
    assert.equal(r.score, 0.8);
    // 'Data' starts at index 9 (f-e-t-c-h-H-T-T-P-D)
    assert.deepEqual(r.ranges, [[9, 13]]);
});

test('search: caps at 50 items and sets truncated flag', () => {
    const big: IndexedItem[] = Array.from({ length: 200 }, (_, i) =>
        mkItem(`a${i}`, `Apple ${i}`, 'agent')
    );
    const r = search(big, 'apple', { cap: 50 });
    assert.equal(r.items.length, 50);
    assert.equal(r.truncated, true);
    assert.equal(r.totalMatched, 200);
});

test('search: empty query returns the full index (untruncated unless > cap)', () => {
    const items = [mkItem('a', 'Alpha'), mkItem('b', 'Beta')];
    const r = search(items, '');
    assert.equal(r.items.length, 2);
    assert.equal(r.truncated, false);
    assert.equal(r.totalMatched, 2);

    const ws = search(items, '   ');
    assert.equal(ws.items.length, 2);
    assert.equal(ws.truncated, false);
});

test('search: orders by score DESC then label ASC', () => {
    const items: IndexedItem[] = [
        mkItem('a', 'OrderXyz'), // exact-token-prefix (0.8) for 'order'
        mkItem('b', 'BorderArea'), // substring (0.5)
        mkItem('c', 'OrderAbc'), // exact-token-prefix (0.8) for 'order'
    ];
    const r = search(items, 'order');
    assert.equal(r.items.length, 3);
    // Both 0.8s sort before the 0.5; within 0.8s, 'OrderAbc' < 'OrderXyz' alphabetically.
    assert.deepEqual(
        r.items.map(i => i.id),
        ['c', 'a', 'b']
    );
});

test('search: matches devName when label does not match (demoted score)', () => {
    const items: IndexedItem[] = [
        mkItem('a', 'Customer Service Bot', 'agent', null, 'CSB_internal'),
        mkItem('b', 'CSB Display', 'agent', null, 'OtherName'),
    ];
    const r = search(items, 'csb');
    // 'CSB Display' has a label match (token-prefix 0.8) — should win.
    // 'Customer Service Bot' matches via devName (0.8 * 0.9 = 0.72).
    assert.equal(r.items.length, 2);
    assert.equal(r.items[0].id, 'b');
    assert.equal(r.items[1].id, 'a');
});

test('search: stores matchRanges and matchScore on returned items', () => {
    const items = [mkItem('a', 'OrderLookup')];
    const r = search(items, 'order');
    assert.equal(r.items.length, 1);
    assert.ok(r.items[0].matchRanges);
    assert.deepEqual(r.items[0].matchRanges, [[0, 5]]);
    assert.equal(r.items[0].matchScore, 0.8);
});

test('search: type-then-label sort orders agent < topic < action', () => {
    const items: IndexedItem[] = [
        mkItem('act', 'OrderAction', 'action'),
        mkItem('topic', 'OrderTopic', 'topic'),
        mkItem('agent', 'OrderAgent', 'agent'),
    ];
    const r = search(items, 'order', { sortBy: 'type-then-label' });
    assert.deepEqual(
        r.items.map(i => i.id),
        ['agent', 'topic', 'act']
    );
});

test('search: 100k-item soft perf benchmark (logged, not asserted)', () => {
    const N = 100_000;
    const big: IndexedItem[] = Array.from({ length: N }, (_, i) => {
        const types: LabelType[] = ['agent', 'topic', 'action', 'script'];
        return mkItem(`id${i}`, `LabelOrderItem${i}`, types[i % 4]);
    });
    const t0 = process.hrtime.bigint();
    const r = search(big, 'a', { cap: 50 });
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - t0) / 1e6;
    // Soft log — don't fail on CI variance. Architect target: <16ms.
    // eslint-disable-next-line no-console
    console.log(`[fuzzyMatch perf] 100k items, 1-char query: ${ms.toFixed(2)}ms`);
    assert.equal(r.items.length, 50);
    assert.equal(r.truncated, true);
});
