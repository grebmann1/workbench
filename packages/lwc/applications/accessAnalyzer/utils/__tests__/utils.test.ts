/**
 * Tests for the PDF-report table builder used by the Access Analyzer's
 * "download as PDF" flow.
 *
 * Contract note: `fileFormatter` currently has no `return` statement and its
 * `setFileContents(...)` call is commented out — it only mutates local
 * `headers` / `rows` / `tableWidth` variables that are never exposed to the
 * caller. There is therefore nothing externally observable about its
 * result; these tests instead verify it does not throw across the row-type
 * branches (`header`, `group`, `calc`, `row`) and defensive filtering paths
 * (`x != null`) that `app.ts` relies on when exporting real report tables.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fileFormatter } from '../utils.ts';

function makeHeaderColumn(overrides = {}) {
    return {
        value: 'Name',
        width: 1,
        height: 1,
        depth: 1,
        component: { _column: { width: 100 } },
        ...overrides,
    };
}

function makeRowColumn(overrides = {}) {
    return {
        value: 'foo',
        width: 1,
        height: 1,
        component: { _column: { width: 100 } },
        ...overrides,
    };
}

test('empty list does not throw', () => {
    assert.doesNotThrow(() => fileFormatter([], {}));
});

test('called with no options argument uses defaults and does not throw', () => {
    assert.doesNotThrow(() => fileFormatter([]));
});

test('list with only a header row does not throw', () => {
    const list = [
        {
            type: 'header',
            columns: [
                makeHeaderColumn(),
                makeHeaderColumn({ value: 'Group', width: 2, height: 1 }),
            ],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('header row with column width derived from nested component columns does not throw', () => {
    const list = [
        {
            type: 'header',
            columns: [
                makeHeaderColumn({
                    // no direct width — forces the `.columns.reduce(...)` fallback
                    component: { _column: { columns: [{ width: 50 }, { width: 60 }] } },
                }),
            ],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('header row with height > 1 (multi-row header) does not throw', () => {
    const list = [
        {
            type: 'header',
            columns: [makeHeaderColumn({ height: 2 })],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('header row filters out null/undefined column entries', () => {
    const list = [
        {
            type: 'header',
            columns: [makeHeaderColumn(), null, undefined],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('header row filters non-depth-1 columns out of the width calculation but still renders them', () => {
    const list = [
        {
            type: 'header',
            columns: [makeHeaderColumn({ depth: 2 }), makeHeaderColumn({ depth: 1 })],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('group row type is a no-op branch and does not throw', () => {
    const list = [{ type: 'group', columns: [] }];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('calc row type is a no-op branch and does not throw', () => {
    const list = [{ type: 'calc', columns: [] }];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('unknown row type falls through the switch without throwing', () => {
    const list = [{ type: 'unknown-type', columns: [] }];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('data row with indent on the first column does not throw', () => {
    const list = [
        {
            type: 'row',
            indent: 1,
            columns: [makeRowColumn(), makeRowColumn({ value: 'bar' })],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('data row with cell width derived from nested component columns does not throw', () => {
    const list = [
        {
            type: 'row',
            indent: 0,
            columns: [
                makeRowColumn({
                    component: { _column: { columns: [{ width: 30 }, { width: 20 }] } },
                }),
            ],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('data row filters out null/undefined column entries', () => {
    const list = [
        {
            type: 'row',
            indent: 0,
            columns: [makeRowColumn(), null, undefined],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('data row with undefined/null cell value falls back to empty string without throwing', () => {
    const list = [
        {
            type: 'row',
            indent: 0,
            columns: [makeRowColumn({ value: undefined }), makeRowColumn({ value: null })],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('list ending in a row hits the last-row border-width mutation branch without throwing', () => {
    const list = [
        {
            type: 'header',
            columns: [makeHeaderColumn()],
        },
        {
            type: 'row',
            indent: 0,
            columns: [makeRowColumn()],
        },
        {
            type: 'row',
            indent: 0,
            columns: [makeRowColumn({ value: 'last' })],
        },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('list with header, group, calc and row types mixed together does not throw', () => {
    const list = [
        { type: 'header', columns: [makeHeaderColumn()] },
        { type: 'group', columns: [] },
        { type: 'calc', columns: [] },
        { type: 'row', indent: 0, columns: [makeRowColumn()] },
    ];
    assert.doesNotThrow(() => fileFormatter(list, {}));
});

test('respects custom leftCellAlignement option without throwing', () => {
    const list = [
        {
            type: 'row',
            indent: 0,
            columns: [
                makeRowColumn(),
                makeRowColumn({ value: 'bar' }),
                makeRowColumn({ value: 'baz' }),
            ],
        },
    ];
    assert.doesNotThrow(() =>
        fileFormatter(list, {
            leftCellAlignement: 1,
            useImage: true,
            title: 'Custom Title',
            filename: 'custom.pdf',
            report: 'someReport',
            greenTreshold: 5,
            orangeTreshold: 15,
        })
    );
});

test('setFileContents callback is accepted but never invoked (call is commented out in source)', () => {
    let called = false;
    const setFileContents = () => {
        called = true;
    };
    const list = [{ type: 'row', indent: 0, columns: [makeRowColumn()] }];
    fileFormatter(list, {}, setFileContents);
    assert.equal(called, false);
});
