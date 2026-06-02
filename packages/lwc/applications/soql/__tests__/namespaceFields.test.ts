import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeQuery } from '@jetstreamapp/soql-parser-js';
import {
    INITIAL_QUERY,
    selectAllFields,
    selectSObject,
    toggleField,
    toggleRelationship,
} from '../slices/queryFieldSelection.ts';

const QUERY_CONFIG = {
    fieldMaxLineLength: 100,
    fieldSubqueryParensOnOwnLine: false,
};

function toSoql(query) {
    return composeQuery(query, { format: true, formatOptions: QUERY_CONFIG });
}

test('selectSObject preserves namespaced object API names in SOQL', () => {
    const query = selectSObject('acme__Invoice__c');

    assert.match(toSoql(query), /FROM acme__Invoice__c/);
});

test('toggleField preserves namespaced root field API names', () => {
    const query = toggleField(selectSObject('Account'), {
        payload: { fieldName: 'acme__External_Id__c' },
    });

    assert.match(toSoql(query), /acme__External_Id__c/);
    assert.doesNotMatch(toSoql(query), /SELECT[\s\S]*[^_]External_Id__c[\s,]/);
});

test('toggleField removes a namespaced field using namespace-insensitive matching', () => {
    const selected = toggleField(selectSObject('Account'), {
        payload: { fieldName: 'acme__External_Id__c' },
    });
    const deselected = toggleField(selected, {
        payload: { fieldName: 'External_Id__c' },
    });

    assert.doesNotMatch(toSoql(deselected), /acme__External_Id__c/);
});

test('toggleField removes namespaced relationship-path fields using segment-wise matching', () => {
    const selected = toggleField(selectSObject('Account'), {
        payload: {
            fieldName: 'acme__External_Id__c',
            relationships: 'acme__Parent__r',
        },
    });
    const deselected = toggleField(selected, {
        payload: {
            fieldName: 'External_Id__c',
            relationships: 'Parent__r',
        },
    });

    assert.doesNotMatch(toSoql(deselected), /acme__Parent__r\.acme__External_Id__c/);
});

test('selectAllFields preserves namespaced field API names', () => {
    const query = selectAllFields(selectSObject('Account'), {
        payload: {
            sObjectMeta: {
                fields: [{ name: 'Id' }, { name: 'acme__External_Id__c' }],
            },
        },
    });

    assert.match(toSoql(query), /acme__External_Id__c/);
});

test('toggleRelationship preserves namespaced child relationship names', () => {
    const query = toggleRelationship(selectSObject('Account'), {
        payload: { relationshipName: 'acme__Line_Items__r' },
    });

    assert.match(toSoql(query), /FROM acme__Line_Items__r/);
});

test('toggleRelationship removes namespaced child relationships using namespace-insensitive matching', () => {
    const selected = toggleRelationship(selectSObject('Account'), {
        payload: { relationshipName: 'acme__Line_Items__r' },
    });
    const deselected = toggleRelationship(selected, {
        payload: { relationshipName: 'Line_Items__r' },
    });

    assert.doesNotMatch(toSoql(deselected), /FROM acme__Line_Items__r/);
});

test('toggleField preserves namespaced fields inside child relationship subqueries', () => {
    const query = toggleField(INITIAL_QUERY, {
        payload: {
            fieldName: 'acme__Amount__c',
            childRelationship: 'acme__Line_Items__r',
        },
    });

    assert.match(toSoql(query), /acme__Amount__c/);
    assert.match(toSoql(query), /FROM acme__Line_Items__r/);
});

test('toggleField removes child subquery fields using namespace-insensitive relationship matching', () => {
    const selected = toggleField(INITIAL_QUERY, {
        payload: {
            fieldName: 'acme__Amount__c',
            childRelationship: 'acme__Line_Items__r',
        },
    });
    const deselected = toggleField(selected, {
        payload: {
            fieldName: 'Amount__c',
            childRelationship: 'Line_Items__r',
        },
    });

    assert.doesNotMatch(toSoql(deselected), /acme__Amount__c/);
});
