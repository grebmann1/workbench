import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reduxSlice, describeSObjects, getDescribeTableName } from '../describe.ts';

const r = reduxSlice.reducer;

test('describe: getDescribeTableName maps tooling flag to id', () => {
    assert.equal(getDescribeTableName(true), 'TOOLING');
    assert.equal(getDescribeTableName(false), 'STANDARD');
});

test('describe: initial state', () => {
    const s = r(undefined, { type: '@@INIT' } as any);
    assert.deepEqual(s.prefixMap, {});
    assert.deepEqual(s.nameMap, {});
    assert.equal(s.error, null);
    assert.equal(s.isFetching, false);
});

test('describe: describeSObjects.pending flips isFetching + clears error', () => {
    const s = r(
        { prefixMap: {}, nameMap: {}, error: 'prev', isFetching: false } as any,
        { type: describeSObjects.pending.type } as any
    );
    assert.equal(s.isFetching, true);
    assert.equal(s.error, null);
});

test('describe: describeSObjects.fulfilled merges standard + tooling maps', () => {
    const payload = {
        standard: {
            sobjects: [{ name: 'Account', keyPrefix: '001' }],
        },
        tooling: {
            sobjects: [{ name: 'ApexClass', keyPrefix: '01p' }],
        },
    };
    const s = r(undefined, {
        type: describeSObjects.fulfilled.type,
        payload,
    } as any);
    assert.equal(s.isFetching, false);
    assert.ok(s.nameMap.account);
    assert.ok(s.nameMap.apexclass);
    assert.ok(s.prefixMap['001']);
    assert.ok(s.prefixMap['01p']);
    assert.ok(Array.isArray(s.nameEntriesMap.account));
    assert.equal(s.nameEntriesMap.account.length, 1);
    assert.equal(s.nameEntriesMap.account[0].source, 'standard');
    assert.ok(Array.isArray(s.nameEntriesMap.apexclass));
    assert.equal(s.nameEntriesMap.apexclass.length, 1);
    assert.equal(s.nameEntriesMap.apexclass[0].source, 'tooling');
});

test('describe: duplicate names keep legacy winner and preserve both entries', () => {
    const payload = {
        standard: {
            sobjects: [{ name: 'BotDefinition', keyPrefix: '0Xx', label: 'Bot Definition' }],
        },
        tooling: {
            sobjects: [
                { name: 'BotDefinition', keyPrefix: '0Xx', label: 'Bot Definition Tooling' },
            ],
        },
    };
    const s = r(undefined, {
        type: describeSObjects.fulfilled.type,
        payload,
    } as any);

    // Legacy single map keeps standard as winner (backward compatibility).
    assert.equal(s.nameMap.botdefinition.useToolingApi, false);
    assert.equal(s.nameMap.botdefinition.source, 'standard');

    // Collision-safe maps keep both entries.
    assert.ok(Array.isArray(s.nameEntriesMap.botdefinition));
    assert.equal(s.nameEntriesMap.botdefinition.length, 2);
    assert.deepEqual(s.nameEntriesMap.botdefinition.map(x => x.source).sort(), [
        'standard',
        'tooling',
    ]);
});

test('describe: describeSObjects.fulfilled with forceRefresh resets stale entries', () => {
    const seeded = r(undefined, {
        type: describeSObjects.fulfilled.type,
        payload: {
            standard: [
                { name: 'StaleObject__c', keyPrefix: 'a01' },
                { name: 'Account', keyPrefix: '001' },
            ].reduce((acc, item) => {
                acc.sobjects = acc.sobjects || [];
                acc.sobjects.push(item);
                return acc;
            }, {} as any),
            tooling: { sobjects: [] },
        },
    } as any);
    assert.ok(seeded.nameMap.staleobject__c, 'precondition: stale entry seeded');

    const refreshed = r(seeded, {
        type: describeSObjects.fulfilled.type,
        payload: {
            standard: { sobjects: [{ name: 'Account', keyPrefix: '001' }] },
            tooling: { sobjects: [] },
        },
        meta: { arg: { forceRefresh: true } },
    } as any);

    assert.equal(
        refreshed.nameMap.staleobject__c,
        undefined,
        'forceRefresh should remove entries absent from new payload'
    );
    assert.ok(refreshed.nameMap.account, 'fresh entries still applied');
    assert.equal(refreshed.nameEntriesMap.staleobject__c, undefined);
});

test('describe: describeSObjects.fulfilled without forceRefresh keeps existing entries (merge)', () => {
    const seeded = r(undefined, {
        type: describeSObjects.fulfilled.type,
        payload: {
            standard: { sobjects: [{ name: 'OldObject__c', keyPrefix: 'a02' }] },
            tooling: { sobjects: [] },
        },
    } as any);

    const merged = r(seeded, {
        type: describeSObjects.fulfilled.type,
        payload: {
            standard: { sobjects: [{ name: 'NewObject__c', keyPrefix: 'a03' }] },
            tooling: { sobjects: [] },
        },
    } as any);

    assert.ok(
        merged.nameMap.oldobject__c,
        'non-forced fulfilled should preserve previous entries (merge semantics)'
    );
    assert.ok(merged.nameMap.newobject__c);
});

test('describe: describeSObjects.rejected stores error message', () => {
    const s = r(undefined, {
        type: describeSObjects.rejected.type,
        error: { message: 'network down' },
    } as any);
    assert.equal(s.isFetching, false);
    assert.equal(s.error, 'network down');
});

test('describe: describeSObjects.rejected without message falls back to "Unknown error"', () => {
    const s = r(undefined, {
        type: describeSObjects.rejected.type,
        error: {},
    } as any);
    assert.equal(s.error, 'Unknown error');
});
