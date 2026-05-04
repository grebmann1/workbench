import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    countQueryFields,
    deriveTabName,
    extractErrorMarkers,
    formatBytes,
    formatResponse,
    runShortcutLabel,
    validateVariablesJson,
} from '../app/util.ts';

test('graphql/util: formatResponse returns empty string when nothing to show', () => {
    assert.equal(formatResponse(null, null), '');
    assert.equal(formatResponse(undefined, undefined), '');
    assert.equal(formatResponse(null, []), '');
});

test('graphql/util: formatResponse emits data-only payload', () => {
    const out = formatResponse({ uiapi: { query: {} } }, null);
    const parsed = JSON.parse(out);
    assert.deepEqual(parsed, { data: { uiapi: { query: {} } } });
});

test('graphql/util: formatResponse emits errors-only payload', () => {
    const out = formatResponse(null, [{ message: 'boom' }]);
    const parsed = JSON.parse(out);
    assert.deepEqual(parsed, { errors: [{ message: 'boom' }] });
});

test('graphql/util: formatResponse emits data + errors together', () => {
    const out = formatResponse({ partial: true }, [{ message: 'x' }]);
    const parsed = JSON.parse(out);
    assert.equal(parsed.data.partial, true);
    assert.equal(parsed.errors[0].message, 'x');
});

test('graphql/util: formatResponse survives unstringifiable data (cycle)', () => {
    const cyclic: any = {};
    cyclic.self = cyclic;
    // No throw; returns '' by contract.
    assert.equal(formatResponse(cyclic, null), '');
});

test('graphql/util: validateVariablesJson accepts empty, whitespace, and objects', () => {
    assert.deepEqual(validateVariablesJson(''), { ok: true });
    assert.deepEqual(validateVariablesJson('   '), { ok: true });
    assert.deepEqual(validateVariablesJson(null), { ok: true });
    assert.deepEqual(validateVariablesJson('{}'), { ok: true });
    assert.deepEqual(validateVariablesJson('{"a":1}'), { ok: true });
});

test('graphql/util: validateVariablesJson rejects arrays and primitives with friendly error', () => {
    const a = validateVariablesJson('[1,2]');
    assert.equal(a.ok, false);
    if (!a.ok) assert.match(a.error, /JSON object/);

    const b = validateVariablesJson('42');
    assert.equal(b.ok, false);

    const c = validateVariablesJson('null');
    assert.equal(c.ok, false);
});

test('graphql/util: validateVariablesJson surfaces parse errors', () => {
    const r = validateVariablesJson('{bad}');
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.error && r.error.length > 0);
});

test('graphql/util: deriveTabName pulls named-operation name', () => {
    assert.equal(deriveTabName('query GetAccounts { Account { Id } }', 0), 'GetAccounts');
    assert.equal(
        deriveTabName('mutation CreateFoo($i: Input!) { create(input: $i) { Id } }', 1),
        'CreateFoo'
    );
    assert.equal(deriveTabName('subscription Evts { events { Id } }', 2), 'Evts');
});

test('graphql/util: deriveTabName pulls first field from anonymous query', () => {
    assert.equal(deriveTabName('{ account { Id Name } }', 0), 'account');
    assert.equal(
        deriveTabName('query { uiapi { query { Account { edges { node { Id } } } } } }', 0),
        'uiapi'
    );
});

test('graphql/util: deriveTabName falls back on empty or junk input', () => {
    assert.equal(deriveTabName('', 0), 'Query 1');
    assert.equal(deriveTabName('   ', 3), 'Query 4');
    assert.equal(deriveTabName(null as any, 5), 'Query 6');
    assert.equal(deriveTabName('no braces here', 0), 'Query 1');
});

test('graphql/util: deriveTabName strips comments before parsing', () => {
    assert.equal(deriveTabName('# comment line\nquery GoodName { a }', 0), 'GoodName');
});

test('graphql/util: deriveTabName truncates very long names', () => {
    const long = 'query ThisIsAReallyReallyReallyLongOperationName { a }';
    const out = deriveTabName(long, 0);
    assert.ok(out.length <= 24);
    assert.ok(out.endsWith('…'));
});

test('graphql/util: countQueryFields counts only field tokens', () => {
    // Simple anonymous: { account { Id Name } }
    assert.equal(countQueryFields('{ account { Id Name } }'), 3);
    // Named operation keyword isn't a field.
    assert.equal(countQueryFields('query Foo { account { Id Name } }'), 3);
    // Arguments/directives/variables are excluded.
    assert.equal(
        countQueryFields(
            'query Foo($first: Int!) { account(first: $first) @include(if: true) { Id } }'
        ),
        2
    );
    // Empty.
    assert.equal(countQueryFields(''), 0);
    assert.equal(countQueryFields(null as any), 0);
});

test('graphql/util: formatBytes renders human-readable sizes', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
});

test('graphql/util: extractErrorMarkers pulls line/column from Salesforce errors', () => {
    const errors = [
        { message: 'Bad field', locations: [{ line: 3, column: 5 }] },
        { message: 'No locs' },
        {
            message: 'Two locs',
            locations: [
                { line: 7, column: 1 },
                { line: 9, column: 8 },
            ],
        },
    ];
    const out = extractErrorMarkers(errors as any);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0], { line: 3, column: 5, message: 'Bad field' });
    assert.deepEqual(out[2], { line: 9, column: 8, message: 'Two locs' });
});

test('graphql/util: extractErrorMarkers returns empty on non-array / invalid', () => {
    assert.deepEqual(extractErrorMarkers(null), []);
    assert.deepEqual(extractErrorMarkers(undefined), []);
    assert.deepEqual(
        extractErrorMarkers([{ message: 'x', locations: [{ line: 0, column: 1 }] }] as any),
        []
    );
});

test('graphql/util: runShortcutLabel renders platform-appropriate text', () => {
    assert.equal(runShortcutLabel(true), '⌘↵');
    assert.equal(runShortcutLabel(false), 'Ctrl+Enter');
});
