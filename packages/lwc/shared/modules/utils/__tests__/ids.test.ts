import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guid, guidFromHash } from '../ids.ts';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('guid: returns a UUID-shaped lowercase hex string', () => {
    const id = guid();
    assert.match(id, GUID_PATTERN);
});

test('guid: produces 100 unique values (collision check)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
        set.add(guid());
    }
    assert.equal(set.size, 100);
});

test('guidFromHash: returns a UUID-shaped string when input omitted', () => {
    assert.match(guidFromHash(), GUID_PATTERN);
});

test('guidFromHash: returns a UUID-shaped string for arbitrary input', () => {
    assert.match(guidFromHash('foobar'), GUID_PATTERN);
});

test('guidFromHash: same input produces matching first 8 hex chars across calls', () => {
    // The first 8 hex characters (minus the dash) are deterministic from the input hash.
    const a = guidFromHash('salesforce');
    const b = guidFromHash('salesforce');
    const headA = a.replace('-', '').slice(0, 8);
    const headB = b.replace('-', '').slice(0, 8);
    // Character positions 0-3 and 9-12 (of the raw hash) are copied in from hashHex,
    // but are interleaved with random s4(). Assert that position 0-3 (hashHex[0..4]) matches.
    assert.equal(a.slice(0, 4), b.slice(0, 4));
    // And the segment after the first dash starts with hashHex[4..8].
    assert.equal(a.split('-')[1].slice(0, 4), b.split('-')[1].slice(0, 4));
    // Force an "unused" reference silencer for the derived heads.
    assert.ok(headA.length === 8 && headB.length === 8);
});

test('guidFromHash: empty string and undefined input both yield hashHex starting with 00000000', () => {
    const a = guidFromHash('');
    const b = guidFromHash(undefined);
    assert.equal(a.slice(0, 4), '0000');
    assert.equal(b.slice(0, 4), '0000');
});
