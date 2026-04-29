import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reduxSlice, describeSObject } from '../sobject.ts';

const r = reduxSlice.reducer;

test('sobject: initial state is empty entity adapter shape', () => {
    const s = r(undefined, { type: '@@INIT' } as any);
    assert.deepEqual(s.ids, []);
    assert.deepEqual(s.entities, {});
});

test('sobject: describeSObject.pending upserts isFetching entry keyed by lowercased name', () => {
    const action = {
        type: describeSObject.pending.type,
        meta: { requestId: 'r1', arg: { sObjectName: 'Account' } },
    };
    const s = r(undefined, action as any);
    assert.deepEqual(s.ids, ['account']);
    assert.equal(s.entities.account.isFetching, true);
    assert.equal(s.entities.account.error, null);
});

test('sobject: describeSObject.fulfilled stores data + clears isFetching', () => {
    let s = r(undefined, {
        type: describeSObject.pending.type,
        meta: { requestId: 'r1', arg: { sObjectName: 'Contact' } },
    } as any);
    s = r(s, {
        type: describeSObject.fulfilled.type,
        meta: { requestId: 'r1', arg: { sObjectName: 'Contact' } },
        payload: { sObjectName: 'Contact', data: { fields: [] } },
    } as any);
    assert.equal(s.entities.contact.isFetching, false);
    assert.deepEqual(s.entities.contact.data, { fields: [] });
});

test('sobject: describeSObject.rejected stores error on entry', () => {
    let s = r(undefined, {
        type: describeSObject.pending.type,
        meta: { requestId: 'r1', arg: { sObjectName: 'Lead' } },
    } as any);
    s = r(s, {
        type: describeSObject.rejected.type,
        meta: { requestId: 'r1', arg: { sObjectName: 'Lead' } },
        error: { message: 'boom' },
    } as any);
    assert.equal(s.entities.lead.isFetching, false);
    assert.ok(s.entities.lead.error);
});
