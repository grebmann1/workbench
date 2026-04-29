import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fullApiName, getSobject, getRecordId } from '../salesforce.ts';

test('fullApiName: no namespace returns name unchanged', () => {
    assert.equal(fullApiName('Account'), 'Account');
    assert.equal(fullApiName('Account.Name'), 'Account.Name');
});

test('fullApiName: null/undefined → empty string', () => {
    assert.equal(fullApiName(null), '');
    assert.equal(fullApiName(undefined), '');
});

test('fullApiName: adds "<ns>__" prefix when namespace provided', () => {
    assert.equal(fullApiName('Widget', 'acme'), 'acme__Widget');
    assert.equal(fullApiName('Widget', '  acme  '), 'acme__Widget');
});

test('fullApiName: empty/whitespace namespace is ignored', () => {
    assert.equal(fullApiName('Widget', '   '), 'Widget');
    assert.equal(fullApiName('Widget', null), 'Widget');
});

test('getSobject: Lightning /o/ path extracts object name', () => {
    assert.equal(getSobject('https://ex.my.salesforce.com/lightning/o/Account/list'), 'Account');
    assert.equal(
        getSobject('https://ex.my.salesforce.com/lightning/r/Opportunity/0060Dummy/view'),
        'Opportunity'
    );
});

test('getSobject: non-Lightning URL returns null', () => {
    assert.equal(getSobject('https://ex.my.salesforce.com/home'), null);
});

test('getRecordId: extracts 18-char id from Lightning record URL', () => {
    assert.equal(
        getRecordId('https://ex.my.salesforce.com/lightning/r/Account/0010Dx00000AbCdEFG/view'),
        '0010Dx00000AbCdEFG'
    );
});

test('getRecordId: extracts 15-char id', () => {
    assert.equal(
        getRecordId('https://ex.my.salesforce.com/lightning/r/Account/0010Dx00000AbCd/view'),
        '0010Dx00000AbCd'
    );
});

test('getRecordId: Visualforce ?id= parameter', () => {
    assert.equal(
        getRecordId('https://ex.my.salesforce.com/apex/MyPage?id=0010Dx00000AbCdEFG'),
        '0010Dx00000AbCdEFG'
    );
});

test('getRecordId: URL with no record id returns null', () => {
    assert.equal(getRecordId('https://ex.my.salesforce.com/lightning/o/Account/list'), null);
});
