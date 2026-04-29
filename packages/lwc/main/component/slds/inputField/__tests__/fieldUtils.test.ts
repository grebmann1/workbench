import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isCompoundField, isPersonAccount, getCompoundFields, FieldTypes } from '../fieldUtils.ts';

test('FieldTypes: stable string tokens', () => {
    assert.equal(FieldTypes.BOOLEAN, 'boolean');
    assert.equal(FieldTypes.REFERENCE, 'reference');
    assert.equal(FieldTypes.MULTI_PICKLIST, 'multipicklist');
    assert.equal(FieldTypes.PICKLIST, 'picklist');
    assert.equal(FieldTypes.DATETIME, 'datetime');
});

test('isCompoundField: unknown field → false', () => {
    const obj = { name: 'Account', fields: [{ name: 'Id' }] };
    assert.equal(isCompoundField('Ghost', obj), false);
});

test('isCompoundField: explicit compound=false → false', () => {
    const obj = {
        name: 'Account',
        fields: [{ name: 'Id', compound: false }],
    };
    assert.equal(isCompoundField('Id', obj), false);
});

test('isPersonAccount: reads IsPersonAccount flag', () => {
    assert.equal(isPersonAccount({ IsPersonAccount: true }), true);
    assert.equal(isPersonAccount({ IsPersonAccount: false }), false);
});

test('getCompoundFields: returns keys whose compoundFieldName matches', () => {
    const record = { fields: { FirstName: 'A', LastName: 'B', Other: 'X' } };
    const objectInfo = {
        fields: {
            FirstName: { compoundFieldName: 'Name' },
            LastName: { compoundFieldName: 'Name' },
            Other: { compoundFieldName: null },
        },
    };
    const out = getCompoundFields('Name', record, objectInfo);
    assert.deepEqual(out.sort(), ['FirstName', 'LastName']);
});
