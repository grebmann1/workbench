import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    getObjectSetupLink,
    getCustomMetadataLink,
    getObjectFieldsSetupLink,
    getObjectFieldDetailSetupLink,
    getObjectListLink,
    getRecordTypesLink,
    getObjectDocLink,
    getSetupEntityPagePath,
    getSetupNodeHomePath,
    getObjectManagerSectionPath,
    getObjectManagerRecordPath,
    getObjectListViewPath,
    getAppBuilderPagePath,
    getFlowBuilderPath,
} from '../salesforceLinks.ts';

const HOST = 'https://example.my.salesforce.com';

test('getObjectSetupLink: standard objects use the sobject name', () => {
    const url = getObjectSetupLink({ host: HOST, sobjectName: 'Account' });
    assert.ok(url.includes('/ObjectManager/Account/Details/view'));
});

test('getObjectSetupLink: custom objects prefer durableId', () => {
    const url = getObjectSetupLink({ host: HOST, sobjectName: 'Widget__c', durableId: '01I0' });
    assert.ok(url.includes('/ObjectManager/01I0/Details/view'));
});

test('getObjectSetupLink: __mdt routes to custom-metadata page', () => {
    const url = getObjectSetupLink({ host: HOST, sobjectName: 'Thing__mdt', durableId: 'abc' });
    assert.ok(url.includes('/CustomMetadata/page'));
});

test('getObjectSetupLink: custom setting routes to custom-settings page', () => {
    const url = getObjectSetupLink({
        host: HOST,
        sobjectName: 'Flag__c',
        durableId: 'xyz',
        isCustomSetting: true,
    });
    assert.ok(url.includes('/CustomSettings/page'));
    assert.ok(url.includes('xyz'));
});

test('getCustomMetadataLink: missing host returns "#"', () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(getCustomMetadataLink({ host: '', durableId: 'abc' }), '#');
    } finally {
        console.warn = originalWarn;
    }
});

test('getObjectFieldsSetupLink: standard vs custom routing', () => {
    assert.ok(
        getObjectFieldsSetupLink({ host: HOST, sobjectName: 'Account' }).includes(
            '/ObjectManager/Account/FieldsAndRelationships/view'
        )
    );
    assert.ok(
        getObjectFieldsSetupLink({
            host: HOST,
            sobjectName: 'W__c',
            durableId: '01I',
        }).includes('/ObjectManager/01I/FieldsAndRelationships/view')
    );
});

test('getObjectFieldDetailSetupLink: custom object uses durable IDs', () => {
    const url = getObjectFieldDetailSetupLink({
        host: HOST,
        sobjectName: 'W__c',
        durableId: '01I',
        fieldName: 'Foo__c',
        fieldNameDurableId: '00N',
    });
    assert.ok(url.includes('/ObjectManager/01I/FieldsAndRelationships/00N/view'));
});

test('getObjectFieldDetailSetupLink: standard object uses names', () => {
    const url = getObjectFieldDetailSetupLink({
        host: HOST,
        sobjectName: 'Account',
        durableId: null,
        fieldName: 'Name',
        fieldNameDurableId: 'does-not-matter',
    });
    assert.ok(url.includes('/ObjectManager/Account/FieldsAndRelationships/Name/view'));
});

test('getObjectListLink: __mdt routes to custom-metadata list', () => {
    assert.ok(
        getObjectListLink({
            host: HOST,
            sobjectName: 'Thing__mdt',
            keyPrefix: 'abc',
        }).includes('/CustomMetadata/page')
    );
});

test('getObjectListLink: standard objects go through /lightning/o/', () => {
    assert.ok(
        getObjectListLink({ host: HOST, sobjectName: 'Account', keyPrefix: '001' }).includes(
            '/lightning/o/Account/list'
        )
    );
});

test('getRecordTypesLink: custom object uses durableId', () => {
    assert.ok(
        getRecordTypesLink({ host: HOST, sobjectName: 'W__c', durableId: '01I' }).includes(
            '/ObjectManager/01I/RecordTypes/view'
        )
    );
});

test('getObjectDocLink: tooling vs standard doc URL', () => {
    assert.match(getObjectDocLink('Account', false), /sforce_api_objects_account\.htm$/);
    assert.match(getObjectDocLink('ApexClass', true), /tooling_api_objects_apexclass\.htm$/);
});

test('getSetupEntityPagePath: supports relative and absolute paths', () => {
    assert.equal(
        getSetupEntityPagePath({ setupEntity: 'ApexClasses', id: '01p123' }),
        '/lightning/setup/ApexClasses/page?address=%2F01p123'
    );
    assert.equal(
        getSetupEntityPagePath({ host: HOST, setupEntity: 'ApexClasses', id: 'My Class' }),
        'https://example.my.salesforce.com/lightning/setup/ApexClasses/page?address=%2FMy%20Class'
    );
});

test('getSetupNodeHomePath: builds setup home links', () => {
    assert.equal(
        getSetupNodeHomePath({ setupNode: 'ScheduledJobs' }),
        '/lightning/setup/ScheduledJobs/home'
    );
});

test('object manager helpers build section and record links', () => {
    assert.equal(
        getObjectManagerSectionPath({ objectApiName: 'Account', section: 'PageLayouts' }),
        '/lightning/setup/ObjectManager/Account/PageLayouts/view'
    );
    assert.equal(
        getObjectManagerRecordPath({
            objectApiName: 'Account',
            section: 'PageLayouts',
            recordId: '00h123',
        }),
        '/lightning/setup/ObjectManager/Account/PageLayouts/00h123/view'
    );
});

test('getObjectListViewPath encodes filter name', () => {
    assert.equal(
        getObjectListViewPath({ objectApiName: 'Account', filterName: 'My List' }),
        '/lightning/o/Account/list?filterName=My%20List'
    );
});

test('app and flow builders preserve existing route formats', () => {
    assert.equal(
        getAppBuilderPagePath({ pageId: '0Pg123' }),
        '/visualEditor/appBuilder.app?pageId=0Pg123'
    );
    assert.equal(
        getFlowBuilderPath({ activeVersionId: '301ABC' }),
        '/builder_platform_interaction/flowBuilder.app?flowId=301ABC'
    );
    assert.equal(
        getFlowBuilderPath({ flowDefId: '300AAA', latestVersionId: '301BBB' }),
        '/builder_platform_interaction/flowBuilder.app?isFromAloha=true&flowDefId=300AAA&flowId=301BBB'
    );
    assert.equal(getFlowBuilderPath({ flowDefId: '300AAA' }), '');
});
