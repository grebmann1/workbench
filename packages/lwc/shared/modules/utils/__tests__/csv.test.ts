import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    CSV_DELIMITERS,
    parseCsvText,
    escapeCsvValue,
    serializeCsvFromObjects,
} from '../modules/csv.ts';

test('CSV_DELIMITERS: exposes the expected separators', () => {
    assert.equal(CSV_DELIMITERS.COMMA, ',');
    assert.equal(CSV_DELIMITERS.SEMICOLON, ';');
    assert.equal(CSV_DELIMITERS.TAB, '\t');
    assert.equal(CSV_DELIMITERS.PIPE, '|');
});

test('parseCsvText: parses comma-separated rows with headers', () => {
    const out = parseCsvText('a,b\n1,2\n3,4');
    assert.deepEqual(out.headers, ['a', 'b']);
    assert.equal(out.rows.length, 2);
    assert.equal(out.rows[0].a, '1');
    assert.equal(out.rows[1].b, '4');
    assert.equal(out.error, null);
});

test('parseCsvText: honours custom delimiter + strips BOM from headers', () => {
    const out = parseCsvText('\uFEFFa;b\n1;2', { delimiter: ';' });
    assert.deepEqual(out.headers, ['a', 'b']);
    assert.equal(out.rows[0].a, '1');
});

test('parseCsvText: returns empty headers/rows for empty input', () => {
    const out = parseCsvText('');
    assert.deepEqual(out.headers, []);
    assert.deepEqual(out.rows, []);
});

test('escapeCsvValue: null/undefined become empty string', () => {
    assert.equal(escapeCsvValue(',', null), '');
    assert.equal(escapeCsvValue(',', undefined), '');
});

test('escapeCsvValue: wraps values containing separator / quotes / newlines', () => {
    assert.equal(escapeCsvValue(',', 'a,b'), '"a,b"');
    assert.equal(escapeCsvValue(',', 'he said "hi"'), '"he said ""hi"""');
    assert.equal(escapeCsvValue(',', 'line1\nline2'), '"line1\nline2"');
});

test('escapeCsvValue: plain values pass through unchanged', () => {
    assert.equal(escapeCsvValue(',', 'plain'), 'plain');
    assert.equal(escapeCsvValue(',', 42), '42');
    assert.equal(escapeCsvValue(',', true), 'true');
});

test('serializeCsvFromObjects: builds header line + data lines', () => {
    const out = serializeCsvFromObjects({
        headers: ['a', 'b'],
        rows: [
            { a: '1', b: '2' },
            { a: '3', b: '4' },
        ],
    });
    assert.equal(out, 'a,b\n1,2\n3,4');
});

test('serializeCsvFromObjects: missing fields become empty cells; quotes escape', () => {
    const out = serializeCsvFromObjects({
        headers: ['a', 'b'],
        rows: [{ a: 'x,y' }, { b: 'z' }],
        separator: ',',
    });
    assert.equal(out, 'a,b\n"x,y",\n,z');
});

test('serializeCsvFromObjects: round-trips through parseCsvText', () => {
    const headers = ['Name', 'Value'];
    const rows = [
        { Name: 'alpha', Value: '1' },
        { Name: 'beta,comma', Value: '2' },
    ];
    const serialized = serializeCsvFromObjects({ headers, rows });
    const parsed = parseCsvText(serialized);
    assert.deepEqual(parsed.headers, headers);
    assert.equal(parsed.rows[0].Name, 'alpha');
    assert.equal(parsed.rows[1].Name, 'beta,comma');
});
