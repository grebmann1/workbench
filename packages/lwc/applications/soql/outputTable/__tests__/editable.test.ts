import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findFieldDescribe, resolveFieldEditability, normalizeEditorValue } from '../editable.ts';

const sobjectState = {
    entities: {
        account: {
            data: {
                fields: [
                    {
                        name: 'Name',
                        type: 'string',
                        updateable: true,
                        length: 80,
                        label: 'Account Name',
                    },
                    {
                        name: 'Amount',
                        type: 'double',
                        updateable: true,
                    },
                    {
                        name: 'IsActive',
                        type: 'boolean',
                        updateable: true,
                    },
                    {
                        name: 'Status',
                        type: 'picklist',
                        updateable: true,
                        picklistValues: [
                            { label: 'Open', value: 'open', active: true },
                            { label: 'Closed', value: 'closed', active: false },
                            { value: 'onlyValue', active: true },
                        ],
                    },
                    {
                        name: 'ReadOnly',
                        type: 'string',
                        updateable: false,
                    },
                    {
                        name: 'WeirdType',
                        type: 'xyz',
                        updateable: true,
                    },
                ],
            },
        },
    },
};

test('findFieldDescribe: case-insensitive sObjectType lookup', () => {
    const f = findFieldDescribe(sobjectState, 'Account', 'Name');
    assert.equal(f?.type, 'string');
});

test('findFieldDescribe: returns null for missing state or field', () => {
    assert.equal(findFieldDescribe(null, 'Account', 'Name'), null);
    assert.equal(findFieldDescribe(sobjectState, 'Account', 'Nope'), null);
    assert.equal(findFieldDescribe(sobjectState, '', 'Name'), null);
});

test('resolveFieldEditability: dotted field → read-only (dotted)', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: 'Account',
        field: 'Account.Name',
        value: 'x',
    });
    assert.equal(out.editable, false);
    assert.equal(out.reason, 'dotted');
});

test('resolveFieldEditability: child-subquery object value → read-only', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: 'Account',
        field: 'Contacts',
        value: { records: [] },
    });
    assert.equal(out.editable, false);
    assert.equal(out.reason, 'child-subquery');
});

test('resolveFieldEditability: no sobjectType → no-describe', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: null,
        field: 'Name',
        value: 'x',
    });
    assert.equal(out.reason, 'no-describe');
});

test('resolveFieldEditability: not in describe → not-found', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: 'Account',
        field: 'DoesNotExist',
        value: 'x',
    });
    assert.equal(out.reason, 'not-found');
});

test('resolveFieldEditability: updateable=false → not-updateable', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: 'Account',
        field: 'ReadOnly',
        value: 'x',
    });
    assert.equal(out.reason, 'not-updateable');
});

test('resolveFieldEditability: unsupported SOAP type → not-updateable', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: 'Account',
        field: 'WeirdType',
        value: 'x',
    });
    assert.equal(out.reason, 'not-updateable');
});

test('resolveFieldEditability: picklist filters inactive values + falls back to value label', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: 'Account',
        field: 'Status',
        value: 'open',
    });
    assert.equal(out.editable, true);
    assert.equal(out.editorType, 'picklist');
    assert.deepEqual(out.picklistValues, [
        { label: 'Open', value: 'open' },
        { label: 'onlyValue', value: 'onlyValue' },
    ]);
});

test('resolveFieldEditability: editable string maps to text editor', () => {
    const out = resolveFieldEditability({
        sobjectState,
        sobjectType: 'Account',
        field: 'Name',
        value: 'Acme',
    });
    assert.equal(out.editable, true);
    assert.equal(out.editorType, 'text');
    assert.equal(out.length, 80);
});

test('normalizeEditorValue: empty string / undefined → null', () => {
    assert.equal(normalizeEditorValue('text', ''), null);
    assert.equal(normalizeEditorValue('text', undefined), null);
    assert.equal(normalizeEditorValue('text', null), null);
});

test('normalizeEditorValue: number coerces finite strings, else null', () => {
    assert.equal(normalizeEditorValue('number', '42'), 42);
    assert.equal(normalizeEditorValue('number', 42), 42);
    assert.equal(normalizeEditorValue('number', 'xyz'), null);
});

test('normalizeEditorValue: boolean coerces "true" literal', () => {
    assert.equal(normalizeEditorValue('boolean', true), true);
    assert.equal(normalizeEditorValue('boolean', 'true'), true);
    assert.equal(normalizeEditorValue('boolean', 'false'), false);
    assert.equal(normalizeEditorValue('boolean', 0), false);
});

test('normalizeEditorValue: multipicklist joins arrays with ";"', () => {
    assert.equal(normalizeEditorValue('multipicklist', ['a', 'b', 'c']), 'a;b;c');
    assert.equal(normalizeEditorValue('multipicklist', 'a'), 'a');
});
