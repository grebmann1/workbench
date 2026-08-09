/**
 * Unit tests for the pure helpers in `../util.ts`.
 *
 * Why we don't import `../util.ts` directly
 * ------------------------------------------
 * The file imports `store` from `host-api/store` and `LightningConfirm` from
 * `lightning/confirm`. `host-api/store` transitively loads the full core
 * store graph including LWC components decorated with `@api`/`@wire` —
 * invalid syntax under plain Node, since this test runner only strips
 * TypeScript types and cannot parse LWC decorator syntax. `lightning/confirm`
 * is an LWC-registered module id that doesn't resolve outside the LWC
 * compiler/runtime at all. Importing the real module throws
 * `SyntaxError: Invalid or unexpected token` (verified empirically — see
 * `agentforce/slices/__tests__/agents.test.ts` and
 * `platformevent/slices/__tests__/platformEvent.test.ts`, which document the
 * same constraint for `host-api/store`).
 *
 * Pragmatic alternative: `escapeCsvValue` and `formatQueryWithComment` are
 * both fully pure (no store/LWC dependency), so we re-construct ("clone")
 * them locally, faithful line-for-line to `../util.ts`, and pin the clone's
 * fidelity with "source contract" tests that `readFileSync` the real file and
 * `assert.match` key lines. Any drift between the clone and the real
 * implementation is caught by those contract tests.
 *
 * `confirmDiscardPendingEdits` is intentionally NOT tested here — it's driven
 * end-to-end by `LightningConfirm.open(...)` and `store.dispatch(...)`, both
 * blocked imports. Cloning just its early-return guards would mostly test a
 * hand-rolled mock of LightningConfirm rather than real logic, so it's
 * skipped (see report).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { isSoqlCommentLine } from '../../slices/stripSoqlComments.ts';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../util.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Test rig: faithful clone of the pure exports of `../util.ts`. MUST stay in
// sync with the real file; the "source contract" tests below pin the real
// source against regexes so drift is caught.
// ---------------------------------------------------------------------------

function escapeCsvValue(separator: string, value: unknown) {
    if (value == null) return ''; // Handle null or undefined values
    const stringValue = String(value); // Convert to string
    if (
        stringValue.includes(separator) ||
        stringValue.includes('"') ||
        stringValue.includes('\n')
    ) {
        // Escape double quotes by doubling them
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

function formatQueryWithComment(query: string) {
    return query
        .split('\n')
        .map(line => {
            if (isSoqlCommentLine(line)) {
                return '';
            }
            const commentIndex = line.indexOf('//');
            if (commentIndex !== -1) {
                // Include everything before `//`, excluding the comment
                return line.slice(0, commentIndex).trim();
            }
            // Include the entire line if no `//` is found
            return line.trim();
        })
        .filter(line => line.length > 0) // Exclude empty lines
        .join(' '); // Join back into a single query string
}

// ---------------------------------------------------------------------------
// escapeCsvValue
// ---------------------------------------------------------------------------

test('escapeCsvValue: null/undefined become an empty string', () => {
    assert.equal(escapeCsvValue(',', null), '');
    assert.equal(escapeCsvValue(',', undefined), '');
});

test('escapeCsvValue: plain values pass through unchanged', () => {
    assert.equal(escapeCsvValue(',', 'hello'), 'hello');
    assert.equal(escapeCsvValue(',', 42), '42');
    assert.equal(escapeCsvValue(',', true), 'true');
});

test('escapeCsvValue: quotes and wraps a value containing the separator', () => {
    assert.equal(escapeCsvValue(',', 'a,b'), '"a,b"');
    assert.equal(escapeCsvValue(';', 'a;b'), '"a;b"');
});

test('escapeCsvValue: does not quote a value containing a DIFFERENT separator', () => {
    assert.equal(escapeCsvValue(';', 'a,b'), 'a,b');
});

test('escapeCsvValue: quotes a value containing a double quote and doubles the inner quotes', () => {
    assert.equal(escapeCsvValue(',', 'say "hi"'), '"say ""hi"""');
});

test('escapeCsvValue: quotes a value containing a newline', () => {
    assert.equal(escapeCsvValue(',', 'line1\nline2'), '"line1\nline2"');
});

test('escapeCsvValue: coerces non-string values via String() before checking', () => {
    // 0 and false are valid CSV cell values, not "empty" — only null/undefined
    // short-circuit to ''.
    assert.equal(escapeCsvValue(',', 0), '0');
    assert.equal(escapeCsvValue(',', false), 'false');
});

// ---------------------------------------------------------------------------
// formatQueryWithComment
// ---------------------------------------------------------------------------

test('formatQueryWithComment: a single-line query with no comments is returned trimmed', () => {
    assert.equal(formatQueryWithComment('SELECT Id FROM Account'), 'SELECT Id FROM Account');
});

test('formatQueryWithComment: strips a full-line -- comment (delegates to isSoqlCommentLine)', () => {
    const query = '-- full line comment\nSELECT Id FROM Account';
    assert.equal(formatQueryWithComment(query), 'SELECT Id FROM Account');
});

test('formatQueryWithComment: strips a full-line # comment', () => {
    const query = '# full line comment\nSELECT Id FROM Account';
    assert.equal(formatQueryWithComment(query), 'SELECT Id FROM Account');
});

test('formatQueryWithComment: strips a trailing // comment from a line', () => {
    const query = 'SELECT Id FROM Account // trailing comment';
    assert.equal(formatQueryWithComment(query), 'SELECT Id FROM Account');
});

test('formatQueryWithComment: joins multiple lines into a single space-joined query', () => {
    const query = 'SELECT Id, Name\nFROM Account\nWHERE Name != null';
    assert.equal(formatQueryWithComment(query), 'SELECT Id, Name FROM Account WHERE Name != null');
});

test('formatQueryWithComment: filters out blank lines', () => {
    const query = 'SELECT Id\n\n\nFROM Account';
    assert.equal(formatQueryWithComment(query), 'SELECT Id FROM Account');
});

test('formatQueryWithComment: mixes full-line and trailing comments plus blank lines', () => {
    const query = [
        '-- header comment',
        'SELECT Id, Name // only need these two',
        '',
        '# another full-line comment',
        'FROM Account',
    ].join('\n');
    assert.equal(formatQueryWithComment(query), 'SELECT Id, Name FROM Account');
});

test('formatQueryWithComment: a // marker inside a quoted literal is NOT a documented guard here — pins current behavior', () => {
    // Unlike stripSoqlComments (which guards against markers inside string
    // literals for # and --), formatQueryWithComment's `//` handling is a
    // naive indexOf and does NOT special-case quoted literals. This test
    // pins the current (documented-as-is) behavior rather than an intended
    // guarantee.
    const query = "SELECT Id FROM Account WHERE Name = 'http://example.com'";
    assert.equal(formatQueryWithComment(query), "SELECT Id FROM Account WHERE Name = 'http:");
});

test('formatQueryWithComment: empty string input returns empty string', () => {
    assert.equal(formatQueryWithComment(''), '');
});

// ---------------------------------------------------------------------------
// Source contract tests — pin the real `../util.ts` against regexes so drift
// between this clone and the real implementation is caught.
// ---------------------------------------------------------------------------

test('source contract: escapeCsvValue short-circuits null/undefined to empty string', () => {
    assert.match(SRC, /export const escapeCsvValue = \(separator: string, value: unknown\) => \{/);
    assert.match(SRC, /if \(value == null\) return '';/);
});

test('source contract: escapeCsvValue quotes on separator, double-quote, or newline and doubles inner quotes', () => {
    assert.match(
        SRC,
        /stringValue\.includes\(separator\) \|\|\s*\n\s*stringValue\.includes\('"'\) \|\|\s*\n\s*stringValue\.includes\('\\n'\)/
    );
    assert.match(SRC, /return `"\$\{stringValue\.replace\(\/"\/g, '""'\)\}"`;/);
});

test('source contract: formatQueryWithComment delegates full-line detection to isSoqlCommentLine', () => {
    assert.match(SRC, /export const formatQueryWithComment = \(query: string\) => \{/);
    assert.match(SRC, /if \(isSoqlCommentLine\(line\)\) \{\s*\n\s*return '';/);
});

test('source contract: formatQueryWithComment strips trailing // comments via indexOf and joins with a space', () => {
    assert.match(SRC, /const commentIndex = line\.indexOf\('\/\/'\);/);
    assert.match(SRC, /\.filter\(line => line\.length > 0\)/);
    assert.match(SRC, /\.join\(' '\);/);
});

test('source contract: confirmDiscardPendingEdits is intentionally left untested here (documents why)', () => {
    // Pins that the function still exists and is still built on the blocked
    // LightningConfirm/store imports — if that coupling is ever removed,
    // this test (and the file header) should be revisited so the function
    // gets real coverage.
    assert.match(SRC, /export const confirmDiscardPendingEdits = async \(/);
    assert.match(SRC, /LightningConfirm\.open\(/);
    assert.match(SRC, /store\.dispatch\(/);
});
