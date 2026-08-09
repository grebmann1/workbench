import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    getDescribeEntriesByName,
    getDescribeByName,
    getDescribeByPrefix,
    getAllDescribeEntries,
} from '../describeResolver.ts';

test('soql/getDescribeEntriesByName: returns [] when describeState is null/undefined', () => {
    assert.deepEqual(getDescribeEntriesByName(null, 'Account'), []);
    assert.deepEqual(getDescribeEntriesByName(undefined, 'Account'), []);
});

test('soql/getDescribeEntriesByName: returns [] when sobjectName is missing', () => {
    const describeState = { nameEntriesMap: { account: [{ name: 'Account' }] } };
    assert.deepEqual(getDescribeEntriesByName(describeState, null), []);
    assert.deepEqual(getDescribeEntriesByName(describeState, undefined), []);
    assert.deepEqual(getDescribeEntriesByName(describeState, ''), []);
});

test('soql/getDescribeEntriesByName: looks up nameEntriesMap case-insensitively', () => {
    const entry = { name: 'Account', useToolingApi: false };
    const describeState = { nameEntriesMap: { account: [entry] } };
    assert.deepEqual(getDescribeEntriesByName(describeState, 'ACCOUNT'), [entry]);
    assert.deepEqual(getDescribeEntriesByName(describeState, 'Account'), [entry]);
});

test('soql/getDescribeEntriesByName: returns [] when the entries array is empty and there is no legacy entry', () => {
    const describeState = { nameEntriesMap: { account: [] }, nameMap: {} };
    assert.deepEqual(getDescribeEntriesByName(describeState, 'Account'), []);
});

test('soql/getDescribeEntriesByName: falls back to the legacy nameMap entry when nameEntriesMap has none', () => {
    const legacyEntry = { name: 'Account', useToolingApi: false };
    const describeState = { nameEntriesMap: { account: [] }, nameMap: { account: legacyEntry } };
    assert.deepEqual(getDescribeEntriesByName(describeState, 'Account'), [legacyEntry]);
});

test('soql/getDescribeEntriesByName: falls back to the legacy entry when nameEntriesMap is missing entirely', () => {
    const legacyEntry = { name: 'Account', useToolingApi: false };
    const describeState = { nameMap: { account: legacyEntry } };
    assert.deepEqual(getDescribeEntriesByName(describeState, 'Account'), [legacyEntry]);
});

test('soql/getDescribeEntriesByName: does not duplicate the legacy entry when a matching name+useToolingApi entry already exists', () => {
    const entry = { name: 'Account', useToolingApi: false, source: 'entries' };
    const legacyEntry = { name: 'Account', useToolingApi: false, source: 'legacy' };
    const describeState = {
        nameEntriesMap: { account: [entry] },
        nameMap: { account: legacyEntry },
    };
    assert.deepEqual(getDescribeEntriesByName(describeState, 'Account'), [entry]);
});

test('soql/getDescribeEntriesByName: appends the legacy entry when its useToolingApi differs from any existing entry', () => {
    const entry = { name: 'Account', useToolingApi: false };
    const legacyEntry = { name: 'Account', useToolingApi: true };
    const describeState = {
        nameEntriesMap: { account: [entry] },
        nameMap: { account: legacyEntry },
    };
    assert.deepEqual(getDescribeEntriesByName(describeState, 'Account'), [entry, legacyEntry]);
});

test('soql/getDescribeEntriesByName: filters out falsy entries from nameEntriesMap groups', () => {
    const entry = { name: 'Account', useToolingApi: false };
    const describeState = { nameEntriesMap: { account: [entry, null, undefined] } };
    assert.deepEqual(getDescribeEntriesByName(describeState, 'Account'), [entry]);
});

test('soql/getDescribeByName: returns null when there are no entries', () => {
    assert.equal(getDescribeByName({ describeState: null, sobjectName: 'Account' }), null);
    const describeState = { nameEntriesMap: { account: [] } };
    assert.equal(getDescribeByName({ describeState, sobjectName: 'Account' }), null);
});

test('soql/getDescribeByName: useToolingApi true prefers the tooling entry', () => {
    const standardEntry = { name: 'Account', useToolingApi: false };
    const toolingEntry = { name: 'Account', useToolingApi: true };
    const describeState = { nameEntriesMap: { account: [standardEntry, toolingEntry] } };
    assert.equal(
        getDescribeByName({ describeState, sobjectName: 'Account', useToolingApi: true }),
        toolingEntry
    );
});

test('soql/getDescribeByName: useToolingApi true falls back to the first entry when no tooling entry exists', () => {
    const standardEntry = { name: 'Account', useToolingApi: false };
    const otherEntry = { name: 'Account', useToolingApi: false, tag: 'second' };
    const describeState = { nameEntriesMap: { account: [standardEntry, otherEntry] } };
    assert.equal(
        getDescribeByName({ describeState, sobjectName: 'Account', useToolingApi: true }),
        standardEntry
    );
});

test('soql/getDescribeByName: useToolingApi false/undefined prefers the non-tooling entry', () => {
    const toolingEntry = { name: 'Account', useToolingApi: true };
    const standardEntry = { name: 'Account', useToolingApi: false };
    const describeState = { nameEntriesMap: { account: [toolingEntry, standardEntry] } };
    assert.equal(
        getDescribeByName({ describeState, sobjectName: 'Account', useToolingApi: false }),
        standardEntry
    );
    assert.equal(getDescribeByName({ describeState, sobjectName: 'Account' }), standardEntry);
});

test('soql/getDescribeByName: useToolingApi false falls back to the first entry when every entry is a tooling entry', () => {
    const toolingEntry = { name: 'Account', useToolingApi: true };
    const otherToolingEntry = { name: 'Account', useToolingApi: true, tag: 'second' };
    const describeState = { nameEntriesMap: { account: [toolingEntry, otherToolingEntry] } };
    assert.equal(
        getDescribeByName({ describeState, sobjectName: 'Account', useToolingApi: false }),
        toolingEntry
    );
});

test('soql/getDescribeByPrefix: returns null when describeState or idPrefix is missing', () => {
    assert.equal(getDescribeByPrefix({ describeState: null, idPrefix: '001' }), null);
    assert.equal(getDescribeByPrefix({ describeState: {}, idPrefix: null }), null);
    assert.equal(getDescribeByPrefix({ describeState: {}, idPrefix: '' }), null);
});

test('soql/getDescribeByPrefix: looks up prefixEntriesMap case-insensitively', () => {
    const entry = { name: 'Account', useToolingApi: false };
    const describeState = { prefixEntriesMap: { '001': [entry] } };
    assert.equal(getDescribeByPrefix({ describeState, idPrefix: '001' }), entry);
});

test('soql/getDescribeByPrefix: falls back to the legacy prefixMap entry and dedups on name+useToolingApi', () => {
    const entry = { name: 'Account', useToolingApi: false, source: 'entries' };
    const legacyEntry = { name: 'Account', useToolingApi: false, source: 'legacy' };
    const describeState = {
        prefixEntriesMap: { '001': [entry] },
        prefixMap: { '001': legacyEntry },
    };
    assert.equal(getDescribeByPrefix({ describeState, idPrefix: '001' }), entry);
});

test('soql/getDescribeByPrefix: honors useToolingApi preference over the merged legacy entry', () => {
    const standardEntry = { name: 'Account', useToolingApi: false };
    const legacyToolingEntry = { name: 'Account', useToolingApi: true };
    const describeState = {
        prefixEntriesMap: { '001': [standardEntry] },
        prefixMap: { '001': legacyToolingEntry },
    };
    assert.equal(
        getDescribeByPrefix({ describeState, idPrefix: '001', useToolingApi: true }),
        legacyToolingEntry
    );
    assert.equal(
        getDescribeByPrefix({ describeState, idPrefix: '001', useToolingApi: false }),
        standardEntry
    );
});

test('soql/getAllDescribeEntries: returns [] when describeState is null/undefined', () => {
    assert.deepEqual(getAllDescribeEntries(null), []);
    assert.deepEqual(getAllDescribeEntries(undefined), []);
});

test('soql/getAllDescribeEntries: flattens every group in nameEntriesMap', () => {
    const accountEntry = { name: 'Account' };
    const contactEntry1 = { name: 'Contact', useToolingApi: false };
    const contactEntry2 = { name: 'Contact', useToolingApi: true };
    const describeState = {
        nameEntriesMap: {
            account: [accountEntry],
            contact: [contactEntry1, contactEntry2],
        },
    };
    assert.deepEqual(getAllDescribeEntries(describeState), [
        accountEntry,
        contactEntry1,
        contactEntry2,
    ]);
});

test('soql/getAllDescribeEntries: falls back to nameMap values when nameEntriesMap is empty', () => {
    const legacyAccount = { name: 'Account' };
    const legacyContact = { name: 'Contact' };
    const describeState = {
        nameEntriesMap: { account: [], contact: [] },
        nameMap: { account: legacyAccount, contact: legacyContact },
    };
    assert.deepEqual(getAllDescribeEntries(describeState), [legacyAccount, legacyContact]);
});

test('soql/getAllDescribeEntries: falls back to nameMap values when nameEntriesMap is missing entirely', () => {
    const legacyAccount = { name: 'Account' };
    const describeState = { nameMap: { account: legacyAccount } };
    assert.deepEqual(getAllDescribeEntries(describeState), [legacyAccount]);
});

test('soql/getAllDescribeEntries: returns [] when both maps are missing', () => {
    assert.deepEqual(getAllDescribeEntries({}), []);
});
