import { test } from 'node:test';
import assert from 'node:assert/strict';

import { storeRef, getStore } from '../storeRef.ts';

test('storeRef: starts null, getStore returns null', () => {
    storeRef.current = null;
    assert.equal(getStore(), null);
});

test('storeRef: setting .current is reflected by getStore()', () => {
    const fake = { dispatch: () => {}, getState: () => ({}) };
    storeRef.current = fake as any;
    assert.equal(getStore(), fake);
    storeRef.current = null;
});
