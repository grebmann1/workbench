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
