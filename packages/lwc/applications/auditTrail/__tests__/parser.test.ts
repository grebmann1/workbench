import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAuditDisplay } from '../parser.ts';

test('parser: profile category + entity', () => {
    const p = parseAuditDisplay('Changed profile System Administrator: marketing users');
    assert.equal(p.category, 'profile');
    assert.equal(p.entity, 'System Administrator');
});

test('parser: quoted profile entity', () => {
    const p = parseAuditDisplay('Created profile "Custom: Partner Community User"');
    assert.equal(p.category, 'profile');
    assert.equal(p.entity, 'Custom');
});

test('parser: permission set category + entity', () => {
    const p = parseAuditDisplay('Permission Set MyPerm: added user alice@example.com');
    assert.equal(p.category, 'permset');
    assert.equal(p.entity, 'MyPerm');
});

test('parser: permission set group', () => {
    const p = parseAuditDisplay('Created permission set group SalesOps');
    assert.equal(p.category, 'permset');
    assert.equal(p.entity, 'SalesOps');
});

test('parser: permset is detected even when "profile" word appears later', () => {
    const p = parseAuditDisplay('Permission Set MyPerm: granted to profile System Administrator');
    assert.equal(p.category, 'permset');
    assert.equal(p.entity, 'MyPerm');
});

test('parser: user category + entity', () => {
    const p = parseAuditDisplay('New User: alice@example.com');
    assert.equal(p.category, 'user');
    assert.equal(p.entity, 'alice@example.com');
});

test('parser: package category + entity', () => {
    const p = parseAuditDisplay('Installed package Foo 1.2.3');
    assert.equal(p.category, 'package');
    assert.equal(p.entity, 'Foo 1.2.3');
});

test('parser: metadata via "for field" anchor', () => {
    const p = parseAuditDisplay('Changed Read access for field Account.Revenue__c on profile X');
    assert.equal(p.category, 'metadata');
    assert.equal(p.entity, 'Account.Revenue__c');
});

test('parser: metadata via FLS with no entity', () => {
    const p = parseAuditDisplay('Field-level security changed');
    assert.equal(p.category, 'metadata');
    assert.equal(p.entity, null);
});

test('parser: fallback to other', () => {
    const p = parseAuditDisplay('Something unrelated happened today');
    assert.equal(p.category, 'other');
    assert.equal(p.entity, null);
});

test('parser: empty input', () => {
    const p = parseAuditDisplay('');
    assert.equal(p.category, 'other');
    assert.equal(p.entity, null);
});

test('parser: null/undefined input', () => {
    assert.deepEqual(parseAuditDisplay(null), { category: 'other', entity: null });
    assert.deepEqual(parseAuditDisplay(undefined), { category: 'other', entity: null });
});

test('parser: entity over 80 chars gets truncated', () => {
    const long = 'A'.repeat(200);
    const p = parseAuditDisplay(`Installed package ${long}`);
    assert.equal(p.category, 'package');
    assert.equal(p.entity?.length, 80);
});
