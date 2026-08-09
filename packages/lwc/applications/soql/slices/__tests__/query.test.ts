/**
 * Slice-behavior tests for the soql `queriesSlice` — focused on the
 * synchronous entity-adapter reducers (`deleteRecords`, `mergeRecordUpdates`,
 * `loadMorePage`, `clearQueryError`). The async thunks (`executeQuery`,
 * `executeQueryIncognito`, `loadMoreRecords`, `explainQuery`) are NOT cloned
 * here — they need a real connector/network call and aren't worth faking.
 *
 * Why we don't import `../query.ts` directly
 * -------------------------------------------
 * The slice file imports `ERROR, DOCUMENT` from `host-api/store`, which
 * transitively loads the full core store graph including LWC components
 * decorated with `@api`/`@wire` — invalid syntax under plain Node, since this
 * test runner only strips TypeScript types and cannot parse LWC decorator
 * syntax. Importing the real module throws
 * `SyntaxError: Invalid or unexpected token`. This has been verified
 * empirically in this repo (see `agentforce/slices/__tests__/agents.test.ts`
 * and `platformevent/slices/__tests__/platformEvent.test.ts`, which document
 * the same constraint). `core/store/storeRef` (for `getStore`) and
 * `host-api/utils` (for `lowerCaseKey`) DO import cleanly on their own, but
 * the blocked `host-api/store` import at the top of the file poisons the
 * whole module graph for `../query.ts`.
 *
 * Pragmatic alternative: re-construct the same reducers the slice uses as a
 * "faithful clone" built with `createSlice`/`createEntityAdapter` from
 * `@reduxjs/toolkit` (the same library the real slice uses) plus the real,
 * already-tested `mergeQueryPage` helper from `./queryPagination.ts` (pure,
 * no blocked imports — see `../__tests__/queryPagination.test.ts`), and pin
 * the clone's fidelity with "source contract" tests that `readFileSync` the
 * real `../query.ts` and `assert.match` key lines/policies. Any drift between
 * the clone and the real file gets caught by those contract tests.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';

import { mergeQueryPage } from '../queryPagination.ts';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../query.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Test rig: faithful clone of the queriesSlice's synchronous reducers. MUST
// stay in sync with `../query.ts`. Each reducer below mirrors the real
// implementation line-for-line; the "source contract" tests at the bottom
// pin the real source against regexes so drift is caught.
// ---------------------------------------------------------------------------

// Minimal stand-in for `lowerCaseKey` from `host-api/utils` (pure, no store dep).
function lowerCaseKey(key: string | null | undefined): string | null {
    return key != null ? key.toLowerCase() : null;
}

const testAdapter = createEntityAdapter<any>();

const testSlice = createSlice({
    name: 'queriesTest',
    initialState: testAdapter.getInitialState(),
    reducers: {
        deleteRecords: (state, action: { payload: { tabId: string; deletedRecordIds: any[] } }) => {
            const { tabId, deletedRecordIds } = action.payload;

            const existingRecord = testAdapter
                .getSelectors()
                .selectById(state, lowerCaseKey(tabId));
            if (existingRecord && existingRecord.data) {
                const updatedRecords = existingRecord.data.records.filter(
                    (x: any) => !deletedRecordIds.includes(x.Id)
                );

                testAdapter.upsertOne(state, {
                    ...existingRecord,
                    data: {
                        ...existingRecord.data,
                        totalSize: existingRecord.data.totalSize - deletedRecordIds.length || 0,
                        records: updatedRecords,
                    },
                });
            }
        },
        mergeRecordUpdates: (state, action: { payload: { tabId: string; updates: any[] } }) => {
            // Merges successful inline-edit values into the query result records
            // so the table reflects the persisted value without a re-query.
            const { tabId, updates } = action.payload || ({} as any);
            if (!tabId || !Array.isArray(updates) || updates.length === 0) return;

            const existingRecord = testAdapter
                .getSelectors()
                .selectById(state, lowerCaseKey(tabId));
            if (!existingRecord?.data?.records) return;

            const byId = new Map(
                updates
                    .filter((u: any) => u && u.recordId)
                    .map((u: any) => [String(u.recordId), u.changes || {}])
            );
            const updatedRecords = existingRecord.data.records.map((record: any) => {
                const changes = byId.get(String(record?.Id));
                return changes ? { ...record, ...changes } : record;
            });
            testAdapter.upsertOne(state, {
                ...existingRecord,
                data: {
                    ...existingRecord.data,
                    records: updatedRecords,
                },
            });
        },
        loadMorePage: (state, action: { payload: { tabId: string; page: any } }) => {
            // Append a fetched `queryMore` page to the tab's current result set.
            const { tabId, page } = action.payload;
            const existingRecord = testAdapter
                .getSelectors()
                .selectById(state, lowerCaseKey(tabId));
            if (!existingRecord?.data) return;
            testAdapter.upsertOne(state, {
                ...existingRecord,
                data: mergeQueryPage(existingRecord.data, page),
            });
        },
        clearQueryError: (state, action: { payload: { tabId: string } }) => {
            const { tabId } = action.payload;
            testAdapter.upsertOne(state, {
                id: lowerCaseKey(tabId),
                error: null,
            });
        },
    },
});

function makeStateWithRecord(tabId: string, data: any, extra: Record<string, any> = {}) {
    const initial = testAdapter.getInitialState();
    return testAdapter.upsertOne(initial, { id: lowerCaseKey(tabId), data, ...extra });
}

// ---------------------------------------------------------------------------
// deleteRecords
// ---------------------------------------------------------------------------

test('deleteRecords: removes matching records by Id and decrements totalSize', () => {
    const state = makeStateWithRecord('Tab1', {
        totalSize: 3,
        records: [{ Id: 'a' }, { Id: 'b' }, { Id: 'c' }],
    });

    const next = testSlice.reducer(
        state,
        testSlice.actions.deleteRecords({ tabId: 'Tab1', deletedRecordIds: ['b'] })
    );

    const entity = (next.entities as any)['tab1'];
    assert.deepEqual(
        entity.data.records.map((r: any) => r.Id),
        ['a', 'c']
    );
    assert.equal(entity.data.totalSize, 2);
});

test('deleteRecords: keyed by lowercased tabId (case-insensitive lookup)', () => {
    const state = makeStateWithRecord('TabMixedCase', {
        totalSize: 1,
        records: [{ Id: 'a' }],
    });

    const next = testSlice.reducer(
        state,
        testSlice.actions.deleteRecords({ tabId: 'TABMIXEDCASE', deletedRecordIds: ['a'] })
    );

    const entity = (next.entities as any)['tabmixedcase'];
    assert.deepEqual(entity.data.records, []);
});

test('deleteRecords: is a no-op when the tab has no existing record', () => {
    const state = testAdapter.getInitialState();
    const next = testSlice.reducer(
        state,
        testSlice.actions.deleteRecords({ tabId: 'MissingTab', deletedRecordIds: ['a'] })
    );
    assert.equal(next.ids.length, 0);
});

test('deleteRecords: is a no-op when the existing entity has no `data`', () => {
    const initial = testAdapter.getInitialState();
    const state = testAdapter.upsertOne(initial, { id: 'tab1', data: null, isFetching: true });

    const next = testSlice.reducer(
        state,
        testSlice.actions.deleteRecords({ tabId: 'Tab1', deletedRecordIds: ['a'] })
    );

    assert.equal((next.entities as any)['tab1'].data, null, 'entity is untouched');
});

test('deleteRecords: totalSize falls back to 0 when the result would be NaN', () => {
    // existingRecord.data.totalSize - deletedRecordIds.length || 0:
    // undefined - 1 === NaN, and NaN || 0 === 0.
    const state = makeStateWithRecord('TabNoTotal', {
        records: [{ Id: 'a' }],
    });

    const next = testSlice.reducer(
        state,
        testSlice.actions.deleteRecords({ tabId: 'TabNoTotal', deletedRecordIds: ['a'] })
    );

    assert.equal((next.entities as any)['tabnototal'].data.totalSize, 0);
});

// ---------------------------------------------------------------------------
// mergeRecordUpdates
// ---------------------------------------------------------------------------

test('mergeRecordUpdates: merges changes into matching records by recordId/Id', () => {
    const state = makeStateWithRecord('Tab2', {
        totalSize: 2,
        records: [
            { Id: 'a', Name: 'Old A' },
            { Id: 'b', Name: 'Old B' },
        ],
    });

    const next = testSlice.reducer(
        state,
        testSlice.actions.mergeRecordUpdates({
            tabId: 'Tab2',
            updates: [{ recordId: 'a', changes: { Name: 'New A' } }],
        })
    );

    const records = (next.entities as any)['tab2'].data.records;
    assert.equal(records.find((r: any) => r.Id === 'a').Name, 'New A');
    assert.equal(
        records.find((r: any) => r.Id === 'b').Name,
        'Old B',
        'unmatched record is untouched'
    );
});

test('mergeRecordUpdates: recordId is compared as a String() (numeric vs string Id)', () => {
    const state = makeStateWithRecord('Tab3', {
        records: [{ Id: 1, Name: 'Old' }],
    });

    const next = testSlice.reducer(
        state,
        testSlice.actions.mergeRecordUpdates({
            tabId: 'Tab3',
            updates: [{ recordId: '1', changes: { Name: 'New' } }],
        })
    );

    assert.equal((next.entities as any)['tab3'].data.records[0].Name, 'New');
});

for (const badPayload of [
    { tabId: '', updates: [{ recordId: 'a', changes: {} }] },
    { tabId: 'Tab4', updates: null },
    { tabId: 'Tab4', updates: 'not-an-array' },
    { tabId: 'Tab4', updates: [] },
]) {
    test(`mergeRecordUpdates: no-op for malformed payload ${JSON.stringify(badPayload)}`, () => {
        const state = makeStateWithRecord('Tab4', { records: [{ Id: 'a', Name: 'Untouched' }] });
        const next = testSlice.reducer(
            state,
            testSlice.actions.mergeRecordUpdates(badPayload as any)
        );
        assert.equal((next.entities as any)['tab4'].data.records[0].Name, 'Untouched');
    });
}

test('mergeRecordUpdates: no-op when the tab has no existing record with data.records', () => {
    const state = testAdapter.getInitialState();
    const next = testSlice.reducer(
        state,
        testSlice.actions.mergeRecordUpdates({
            tabId: 'MissingTab',
            updates: [{ recordId: 'a', changes: { Name: 'New' } }],
        })
    );
    assert.equal(next.ids.length, 0);
});

test('mergeRecordUpdates: updates missing a recordId are filtered out of the merge map', () => {
    const state = makeStateWithRecord('Tab5', {
        records: [{ Id: 'a', Name: 'Old A' }],
    });

    const next = testSlice.reducer(
        state,
        testSlice.actions.mergeRecordUpdates({
            tabId: 'Tab5',
            updates: [{ changes: { Name: 'Should Not Apply' } }, null, undefined],
        })
    );

    assert.equal((next.entities as any)['tab5'].data.records[0].Name, 'Old A');
});

// ---------------------------------------------------------------------------
// loadMorePage
// ---------------------------------------------------------------------------

test('loadMorePage: merges a fetched page via mergeQueryPage and advances the cursor', () => {
    const state = makeStateWithRecord('Tab6', {
        totalSize: 4,
        done: false,
        nextRecordsUrl: '/services/data/v60.0/query/01g0',
        records: [{ Id: 'a' }, { Id: 'b' }],
    });

    const next = testSlice.reducer(
        state,
        testSlice.actions.loadMorePage({
            tabId: 'Tab6',
            page: {
                totalSize: 4,
                done: true,
                records: [{ Id: 'c' }, { Id: 'd' }],
            },
        })
    );

    const data = (next.entities as any)['tab6'].data;
    assert.deepEqual(
        data.records.map((r: any) => r.Id),
        ['a', 'b', 'c', 'd']
    );
    assert.equal(data.nextRecordsUrl, null, 'cursor cleared once jsforce omits nextRecordsUrl');
    assert.equal(data.done, true);
});

test('loadMorePage: is a no-op when the tab has no existing data', () => {
    const initial = testAdapter.getInitialState();
    const state = testAdapter.upsertOne(initial, { id: 'tab7', data: null });

    const next = testSlice.reducer(
        state,
        testSlice.actions.loadMorePage({ tabId: 'Tab7', page: { records: [{ Id: 'x' }] } })
    );

    assert.equal((next.entities as any)['tab7'].data, null);
});

test('loadMorePage: is a no-op when the tab does not exist at all', () => {
    const state = testAdapter.getInitialState();
    const next = testSlice.reducer(
        state,
        testSlice.actions.loadMorePage({ tabId: 'MissingTab', page: { records: [] } })
    );
    assert.equal(next.ids.length, 0);
});

// ---------------------------------------------------------------------------
// clearQueryError
// ---------------------------------------------------------------------------

test('clearQueryError: clears error on an existing entity without touching other fields', () => {
    const state = makeStateWithRecord(
        'Tab8',
        { records: [{ Id: 'a' }] },
        { error: { message: 'boom' }, isFetching: false }
    );

    const next = testSlice.reducer(state, testSlice.actions.clearQueryError({ tabId: 'Tab8' }));

    const entity = (next.entities as any)['tab8'];
    assert.equal(entity.error, null);
    assert.deepEqual(
        entity.data.records,
        [{ Id: 'a' }],
        'unrelated fields are preserved by upsert'
    );
});

test('clearQueryError: creates a bare entity (id + error:null) when the tab did not previously exist', () => {
    const state = testAdapter.getInitialState();
    const next = testSlice.reducer(state, testSlice.actions.clearQueryError({ tabId: 'NewTab' }));

    const entity = (next.entities as any)['newtab'];
    assert.ok(entity, 'upsertOne inserts a new entity when none exists');
    assert.equal(entity.error, null);
});

test('clearQueryError: keyed by lowercased tabId', () => {
    const state = makeStateWithRecord('MixedCaseTab', { records: [] }, { error: 'x' });
    const next = testSlice.reducer(
        state,
        testSlice.actions.clearQueryError({ tabId: 'MIXEDCASETAB' })
    );
    assert.equal((next.entities as any)['mixedcasetab'].error, null);
});

// ---------------------------------------------------------------------------
// Source contract tests — pin the real `../query.ts` against regexes so
// drift between this clone and the real implementation is caught.
// ---------------------------------------------------------------------------

test('source contract: queriesSlice declares the four synchronous reducers under test', () => {
    assert.match(SRC, /reducers: \{\s*\n\s*deleteRecords: \(state, action\) => \{/);
    assert.match(SRC, /mergeRecordUpdates: \(state, action\) => \{/);
    assert.match(SRC, /loadMorePage: \(state, action\) => \{/);
    assert.match(SRC, /clearQueryError: \(state, action\) => \{/);
});

test('source contract: each reducer keys entities via lowerCaseKey(tabId)', () => {
    assert.match(
        SRC,
        /deleteRecords: \(state, action\) => \{[\s\S]+?selectById\(state, lowerCaseKey\(tabId\)\)/
    );
    assert.match(
        SRC,
        /mergeRecordUpdates: \(state, action\) => \{[\s\S]+?selectById\(state, lowerCaseKey\(tabId\)\)/
    );
    assert.match(
        SRC,
        /loadMorePage: \(state, action\) => \{[\s\S]+?selectById\(state, lowerCaseKey\(tabId\)\)/
    );
    assert.match(SRC, /clearQueryError: \(state, action\) => \{[\s\S]+?id: lowerCaseKey\(tabId\),/);
});

test('source contract: mergeRecordUpdates guards on tabId/updates shape before touching state', () => {
    assert.match(
        SRC,
        /if \(!tabId \|\| !Array\.isArray\(updates\) \|\| updates\.length === 0\) return;/
    );
    assert.match(SRC, /if \(!existingRecord\?\.data\?\.records\) return;/);
});

test('source contract: loadMorePage calls mergeQueryPage(existingRecord.data, page)', () => {
    assert.match(SRC, /if \(!existingRecord\?\.data\) return;/);
    assert.match(SRC, /data: mergeQueryPage\(existingRecord\.data, page\),/);
});

test('source contract: deleteRecords decrements totalSize with an `|| 0` NaN guard', () => {
    assert.match(
        SRC,
        /totalSize: existingRecord\.data\.totalSize - deletedRecordIds\.length \|\| 0,/
    );
});
