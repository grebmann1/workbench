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
