import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeQueryPage, getPaginationSummary } from '../slices/queryPagination.ts';

test('soql/queryPagination: mergeQueryPage appends records and advances the cursor', () => {
    const existing = {
        totalSize: 5,
        done: false,
        nextRecordsUrl: '/services/data/v60.0/query/01g0',
        records: [{ Id: 'a' }, { Id: 'b' }],
    };
    const page = {
        totalSize: 5,
        done: false,
        nextRecordsUrl: '/services/data/v60.0/query/01g1',
        records: [{ Id: 'c' }, { Id: 'd' }],
    };

    const merged = mergeQueryPage(existing, page);

    assert.equal(merged.records.length, 4);
    assert.deepEqual(
        merged.records.map(r => r.Id),
        ['a', 'b', 'c', 'd']
    );
    assert.equal(merged.totalSize, 5, 'totalSize stays the whole-result count');
    assert.equal(merged.nextRecordsUrl, '/services/data/v60.0/query/01g1');
    assert.equal(merged.done, false);
});

test('soql/queryPagination: mergeQueryPage normalises the final page', () => {
    const existing = {
        totalSize: 3,
        done: false,
        nextRecordsUrl: '/services/data/v60.0/query/01g0',
        records: [{ Id: 'a' }, { Id: 'b' }],
    };
    // Final page: jsforce omits nextRecordsUrl entirely.
    const page = { totalSize: 3, done: true, records: [{ Id: 'c' }] };

    const merged = mergeQueryPage(existing, page);

    assert.equal(merged.records.length, 3);
    assert.equal(merged.nextRecordsUrl, null);
    assert.equal(merged.done, true);
});

test('soql/queryPagination: mergeQueryPage does not mutate inputs', () => {
    const existing = { totalSize: 2, records: [{ Id: 'a' }] };
    const page = { records: [{ Id: 'b' }] };

    const merged = mergeQueryPage(existing, page);

    assert.equal(existing.records.length, 1, 'existing untouched');
    assert.equal(page.records.length, 1, 'page untouched');
    assert.notEqual(merged.records, existing.records);
});

test('soql/queryPagination: mergeQueryPage tolerates a null base', () => {
    const merged = mergeQueryPage(null, {
        totalSize: 1,
        done: true,
        records: [{ Id: 'a' }],
    });
    assert.equal(merged.records.length, 1);
    assert.equal(merged.totalSize, 1);
    assert.equal(merged.done, true);
});

test('soql/queryPagination: getPaginationSummary reflects loaded/total/hasMore', () => {
    assert.deepEqual(
        getPaginationSummary({
            totalSize: 10,
            nextRecordsUrl: '/q/01g0',
            records: [{ Id: 'a' }, { Id: 'b' }],
        }),
        { loaded: 2, total: 10, hasMore: true }
    );

    assert.deepEqual(getPaginationSummary({ totalSize: 2, records: [{ Id: 'a' }, { Id: 'b' }] }), {
        loaded: 2,
        total: 2,
        hasMore: false,
    });

    assert.deepEqual(getPaginationSummary(null), { loaded: 0, total: 0, hasMore: false });
});
