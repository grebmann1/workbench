import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    buildRecordTypePicklistOptions,
    buildRecordTypePicklistValues,
    getRecordTypeEditorField,
    isRecordTypeField,
} from '../recordTypeOptions.ts';

test('buildRecordTypePicklistOptions: includes active and available record types using ids as values', () => {
    const options = buildRecordTypePicklistOptions(
        [
            {
                name: 'Business Account',
                recordTypeId: '012000000000001AAA',
                active: true,
                available: true,
            },
            {
                name: 'Consumer Account',
                recordTypeId: '012000000000002AAA',
                active: true,
                available: true,
            },
        ],
        '012000000000001AAA'
    );

    assert.deepEqual(options, [
        {
            label: 'Business Account',
            value: '012000000000001AAA',
        },
        {
            label: 'Consumer Account',
            value: '012000000000002AAA',
        },
    ]);
});

test('buildRecordTypePicklistOptions: filters inactive and unavailable record types', () => {
    const options = buildRecordTypePicklistOptions(
        [
            {
                name: 'Available',
                recordTypeId: '012000000000001AAA',
                active: true,
                available: true,
            },
            {
                name: 'Inactive',
                recordTypeId: '012000000000002AAA',
                active: false,
                available: true,
            },
            {
                name: 'Unavailable',
                recordTypeId: '012000000000003AAA',
                active: true,
                available: false,
            },
        ],
        '012000000000001AAA'
    );

    assert.deepEqual(options, [
        {
            label: 'Available',
            value: '012000000000001AAA',
        },
    ]);
});

test('buildRecordTypePicklistOptions: preserves the current record type even when unavailable', () => {
    const options = buildRecordTypePicklistOptions(
        [
            {
                name: 'Available',
                recordTypeId: '012000000000001AAA',
                active: true,
                available: true,
            },
            {
                name: 'Current but unavailable',
                recordTypeId: '012000000000002AAA',
                active: true,
                available: false,
            },
        ],
        '012000000000002AAA'
    );

    assert.deepEqual(options, [
        {
            label: 'Available',
            value: '012000000000001AAA',
        },
        {
            label: 'Current but unavailable',
            value: '012000000000002AAA',
        },
    ]);
});

test('buildRecordTypePicklistOptions: falls back to developer name then id for labels', () => {
    const options = buildRecordTypePicklistOptions(
        [
            {
                developerName: 'Support',
                recordTypeId: '012000000000001AAA',
                active: true,
                available: true,
            },
            {
                recordTypeId: '012000000000002AAA',
                active: true,
                available: true,
            },
        ],
        null
    );

    assert.deepEqual(options, [
        {
            label: 'Support',
            value: '012000000000001AAA',
        },
        {
            label: '012000000000002AAA',
            value: '012000000000002AAA',
        },
    ]);
});

test('getRecordTypeEditorField: clones RecordTypeId field metadata as a picklist', () => {
    const originalField = {
        name: 'RecordTypeId',
        type: 'reference',
        label: 'Record Type ID',
    };

    const editorField = getRecordTypeEditorField(originalField);

    assert.deepEqual(editorField, {
        name: 'RecordTypeId',
        type: 'picklist',
        label: 'Record Type ID',
    });
    assert.equal(originalField.type, 'reference');
});

test('getRecordTypeEditorField: leaves other field metadata unchanged', () => {
    const originalField = {
        name: 'OwnerId',
        type: 'reference',
        label: 'Owner ID',
    };

    const editorField = getRecordTypeEditorField(originalField);

    assert.equal(editorField, originalField);
});

test('buildRecordTypePicklistValues: returns wirePicklistValues payload for RecordTypeId', () => {
    const picklistValues = buildRecordTypePicklistValues(
        [
            {
                name: 'Business Account',
                recordTypeId: '012000000000001AAA',
                active: true,
                available: true,
            },
        ],
        '012000000000001AAA'
    );

    assert.deepEqual(picklistValues, {
        RecordTypeId: [
            {
                label: 'Business Account',
                value: '012000000000001AAA',
            },
        ],
    });
});

test('isRecordTypeField: matches only the standard RecordTypeId field', () => {
    assert.equal(isRecordTypeField('RecordTypeId'), true);
    assert.equal(isRecordTypeField('Record_Type__c'), false);
    assert.equal(isRecordTypeField('OwnerId'), false);
    assert.equal(isRecordTypeField(null), false);
});
