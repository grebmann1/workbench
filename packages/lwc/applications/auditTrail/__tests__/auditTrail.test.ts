import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    reduxSlice,
    fetchAuditTrail,
    setFilter,
    resetFilter,
    setLimit,
    buildAuditSoql,
    matchesFilter,
    distinctValues,
    distinctEntities,
    DEFAULT_LIMIT,
} from '../slices/auditTrail.ts';
import { parseAuditDisplay } from '../parser.ts';

const { reducer } = reduxSlice;

function initial() {
    return reducer(undefined, { type: '@@INIT' });
}

const sampleRaw = [
    {
        Id: 'a1',
        CreatedDate: '2026-05-01T10:00:00.000Z',
        Action: 'changedProfile',
        Section: 'Manage Users',
        Display: 'Changed profile System Administrator',
        DelegateUser: null,
        ResponsibleNamespacePrefix: null,
        CreatedBy: { Name: 'Alice', Username: 'alice@example.com' },
    },
    {
        Id: 'a2',
        CreatedDate: '2026-05-01T11:00:00.000Z',
        Action: 'deployed',
        Section: 'Deploy',
        Display: 'Deployed package Foo',
        DelegateUser: 'del@example.com',
        ResponsibleNamespacePrefix: null,
        CreatedBy: { Name: 'Bob', Username: 'bob@example.com' },
    },
    {
        Id: 'a3',
        CreatedDate: '2026-05-01T12:00:00.000Z',
        Action: 'changedPermset',
        Section: 'Manage Users',
        Display: 'Permission Set MyPerm: granted to alice@example.com',
        DelegateUser: null,
        ResponsibleNamespacePrefix: null,
        CreatedBy: { Name: 'Alice', Username: 'alice@example.com' },
    },
];

const sampleParsed = sampleRaw.map(r => ({
    ...r,
    _parsed: parseAuditDisplay(r.Display),
}));

test('auditTrail: initial state has category/entity = all', () => {
    const s = initial();
    assert.equal(s.filter.category, 'all');
    assert.equal(s.filter.entity, 'all');
    assert.equal(s.limit, DEFAULT_LIMIT);
});

test('auditTrail: setFilter changing category clears entity', () => {
    let s = reducer(initial(), setFilter({ entity: 'X' }));
    assert.equal(s.filter.entity, 'X');
    s = reducer(s, setFilter({ category: 'profile' }));
    assert.equal(s.filter.category, 'profile');
    assert.equal(s.filter.entity, 'all');
});

test('auditTrail: setFilter merges and resetFilter clears', () => {
    let s = reducer(initial(), setFilter({ search: 'profile' }));
    assert.equal(s.filter.search, 'profile');
    s = reducer(s, resetFilter());
    assert.equal(s.filter.search, '');
});

test('auditTrail: setLimit', () => {
    assert.equal(reducer(initial(), setLimit({ limit: 1000 })).limit, 1000);
});

test('auditTrail: fetch fulfilled attaches _parsed to every row', () => {
    const s = reducer(
        initial(),
        fetchAuditTrail.fulfilled({ records: sampleRaw }, 'req-1', {
            connector: {} as any,
            filter: initial().filter,
            limit: DEFAULT_LIMIT,
        })
    );
    assert.equal(s.data.length, 3);
    assert.equal(s.data[0]._parsed?.category, 'profile');
    assert.equal(s.data[0]._parsed?.entity, 'System Administrator');
    assert.equal(s.data[1]._parsed?.category, 'package');
    assert.equal(s.data[2]._parsed?.category, 'permset');
});

test('auditTrail: fetch rejected captures error', () => {
    const s = reducer(
        initial(),
        fetchAuditTrail.rejected(new Error('boom'), 'req-2', {
            connector: {} as any,
            filter: initial().filter,
            limit: DEFAULT_LIMIT,
        })
    );
    assert.equal(s.error, 'boom');
});

test('auditTrail: buildAuditSoql without filters', () => {
    const soql = buildAuditSoql(initial().filter, DEFAULT_LIMIT);
    assert.match(soql, /FROM SetupAuditTrail ORDER BY CreatedDate DESC LIMIT 500/);
});

test('auditTrail: buildAuditSoql caps limit at 2000', () => {
    const soql = buildAuditSoql(initial().filter, 99999);
    assert.match(soql, /LIMIT 2000/);
});

test('auditTrail: buildAuditSoql pads YYYY-MM-DD to start/end of day ISO', () => {
    const soql = buildAuditSoql(
        { ...initial().filter, since: '2026-05-04', until: '2026-05-05' },
        DEFAULT_LIMIT
    );
    assert.match(soql, /CreatedDate >= 2026-05-04T00:00:00Z/);
    assert.match(soql, /CreatedDate <= 2026-05-05T23:59:59Z/);
    // No quotes around the datetime literal.
    assert.equal(/'2026-05/.test(soql), false);
});

test('auditTrail: buildAuditSoql preserves full ISO timestamps unchanged', () => {
    const soql = buildAuditSoql(
        { ...initial().filter, since: '2026-05-04T08:00:00Z' },
        DEFAULT_LIMIT
    );
    assert.match(soql, /CreatedDate >= 2026-05-04T08:00:00Z/);
});

test('auditTrail: matchesFilter honors category', () => {
    const f = { ...initial().filter, category: 'profile' as const };
    assert.equal(matchesFilter(sampleParsed[0], f), true);
    assert.equal(matchesFilter(sampleParsed[1], f), false);
    assert.equal(matchesFilter(sampleParsed[2], f), false);
});

test('auditTrail: matchesFilter honors category + entity together', () => {
    const f = {
        ...initial().filter,
        category: 'profile' as const,
        entity: 'System Administrator',
    };
    assert.equal(matchesFilter(sampleParsed[0], f), true);
    const other = {
        ...sampleParsed[0],
        _parsed: { category: 'profile' as const, entity: 'Other' },
    };
    assert.equal(matchesFilter(other, f), false);
});

test('auditTrail: matchesFilter search also searches parsed entity', () => {
    const f = { ...initial().filter, search: 'MyPerm' };
    assert.equal(matchesFilter(sampleParsed[2], f), true);
});

test('auditTrail: matchesFilter search is case-insensitive', () => {
    const f = { ...initial().filter, search: 'PROFILE' };
    assert.equal(matchesFilter(sampleParsed[0], f), true);
});

test('auditTrail: distinctValues returns sorted uniques', () => {
    assert.deepEqual(distinctValues(sampleParsed, 'Section'), ['Deploy', 'Manage Users']);
    assert.deepEqual(distinctValues(sampleParsed, 'userName'), ['Alice', 'Bob']);
});

test('auditTrail: distinctEntities scoped to category', () => {
    assert.deepEqual(distinctEntities(sampleParsed, 'all'), [
        'Foo',
        'MyPerm',
        'System Administrator',
    ]);
    assert.deepEqual(distinctEntities(sampleParsed, 'profile'), ['System Administrator']);
    assert.deepEqual(distinctEntities(sampleParsed, 'permset'), ['MyPerm']);
    assert.deepEqual(distinctEntities(sampleParsed, 'user'), []);
});
