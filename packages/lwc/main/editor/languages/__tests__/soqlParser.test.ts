import { test } from 'node:test';
import assert from 'node:assert/strict';

import SOQLParser from '../soqlParser.js';

const parse = (before: string, after = ''): any => {
    const p = new SOQLParser();
    return p.process(before, after);
};

test('SOQLParser: detects a complete simple query (hasSelect, fromObject, position=from)', () => {
    const r = parse('select Id from Account', '');
    assert.equal(r.hasSelect, true);
    assert.equal(r.fromObject, 'account');
    assert.equal(r.position, 'from');
    assert.equal(r.isSubQuery, false);
    assert.deepEqual(r.fields, ['id']);
});

test('SOQLParser: position=select when cursor is inside the SELECT clause', () => {
    const r = parse('select ', 'from Account');
    assert.equal(r.position, 'select');
    assert.equal(r.fromObject, 'account');
});

test('SOQLParser: position tracks WHERE / ORDER BY / LIMIT / HAVING / GROUP BY', () => {
    assert.equal(parse('select Id from Account where ').position, 'where');
    assert.equal(parse('select Id from Account order by ').position, 'order by');
    assert.equal(parse('select Id from Account limit 1').position, 'limit');
    assert.equal(parse('select Id from Account having ').position, 'having');
    assert.equal(parse('select Id from Account group by ').position, 'group by');
});

test('SOQLParser: lastWord returns the token after the last space or comma', () => {
    assert.equal(parse('select Id from Acc').lastWord, 'acc');
    assert.equal(parse('select Id, Nam').lastWord, 'nam');
    assert.equal(parse('select Id from Account where ').lastWord, '');
});

test('SOQLParser: parseFields splits the SELECT list and strips function-call parens', () => {
    const r = parse('select Id, Name, count(Id) from Account');
    // function arguments stripped; commas split the list (values may include leading whitespace)
    const trimmed = r.fields.map((f: string) => f.trim());
    assert.ok(trimmed.includes('id'));
    assert.ok(trimmed.includes('name'));
    assert.ok(trimmed.some((f: string) => f.startsWith('count')));
});

test('SOQLParser: fromRelation extracts parents from dotted field names', () => {
    const r = parse('select Contact.Account.Name', ' from Contact');
    assert.deepEqual(r.fromRelation, ['contact', 'account']);
    assert.equal(r.lastWord, 'contact.account.name');
});

test('SOQLParser: fromRelation is empty when lastWord has no dot', () => {
    const r = parse('select Name from Account');
    assert.deepEqual(r.fromRelation, []);
});

test('SOQLParser: SELECT-clause subquery sets isSubQuery + subquery.type="select"', () => {
    const r = parse('select Id, (select Id ', 'from Contacts) from Account');
    assert.equal(r.isSubQuery, true);
    assert.equal(r.subquery.type, 'select');
    assert.equal(r.subquery.hasSelect, true);
    assert.equal(r.subquery.fromObject, 'contacts');
    assert.equal(r.subquery.position, 'select');
});

test('SOQLParser: WHERE-clause IN (SELECT ...) subquery sets subquery.type="filter"', () => {
    const r = parse('select Id from Account where Id in (select AccountId ', 'from Contact)');
    assert.equal(r.isSubQuery, true);
    assert.equal(r.subquery.type, 'filter');
    assert.equal(r.subquery.fromObject, 'contact');
});

test('SOQLParser: WHERE filter parses field / operator / value for `=`', () => {
    const r = parse('select Id from Account where Name = ', "'Acme'");
    assert.equal(r.position, 'where');
    assert.equal(r.filter.field, 'name');
    assert.equal(r.filter.operator, '=');
    // value reflects content before the cursor only
    assert.equal(r.filter.value, '');
});

test('SOQLParser: WHERE filter recognizes comparison operators (>=, <=, !=, LIKE, IN)', () => {
    assert.equal(parse('select Id from Account where Age >= 10').filter.operator, '>=');
    assert.equal(parse('select Id from Account where Age <= 10').filter.operator, '<=');
    assert.equal(parse('select Id from Account where Age != 10').filter.operator, '!=');
    const like = parse("select Id from Account where Name LIKE 'A%'");
    assert.equal(like.filter.operator?.toLowerCase(), 'like');
    const inOp = parse("select Id from Account where Id IN ('x','y')");
    assert.ok(/in/i.test(inOp.filter.operator ?? ''));
});

test('SOQLParser: incomplete query (no FROM) still detects SELECT and has no fromObject', () => {
    const r = parse('select Id', '');
    assert.equal(r.hasSelect, true);
    assert.equal(r.fromObject, null);
});

test('SOQLParser: text with no SELECT returns hasSelect=false and empty fields', () => {
    const r = parse('from Account', '');
    assert.equal(r.hasSelect, false);
    assert.deepEqual(r.fields, []);
});

test('SOQLParser: process() returns the same parsedData reference (caller must snapshot)', () => {
    const p = new SOQLParser();
    const a = p.process('select Id from Account', '');
    const b = p.process('select Name from Contact where Id = ', '');
    // Both handles point to the same underlying object — reflects current behavior
    assert.equal(a, b);
    assert.equal(b.fromObject, 'contact');
    assert.equal(b.position, 'where');
    // isSubQuery resets between calls
    assert.equal(b.isSubQuery, false);
});
