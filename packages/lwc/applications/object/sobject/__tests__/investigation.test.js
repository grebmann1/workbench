import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as investigation from '../../../../shared/modules/recordInvestigation/recordInvestigation.ts';

const decorate = () => undefined;
const orgId = '00D000000000001AAA';
const instanceUrl = 'https://example.my.salesforce.com';

function fixture() {
    let connector = { configuration: { orgId }, conn: { instanceUrl } };
    let describe = async () => ({ payload: { data: { name: 'Account', fields: [] } } });
    const { default: Sobject } = loadTypeScriptModule(
        new URL('../sobject.ts', import.meta.url),
        {
            'host-api/element': {
                __esModule: true,
                default: class {
                    get connector() {
                        return connector;
                    }
                },
            },
            'host-api/store': {
                store: { dispatch: action => describe(action) },
                SOBJECT: { describeSObject: payload => payload },
                connectStore: {},
            },
            'lightning/toast': {},
            lwc: { api: decorate, track: decorate, wire: () => decorate },
            'lwr/navigation': {},
            'shared/loader': {},
            'shared/logger': { __esModule: true, default: { debug() {} } },
            'shared/store': {},
            'shared/utils': { isEmpty: value => !value },
            'shared/recordInvestigation': investigation,
            '../sessionCallOptions': { ensureSessionClientCallOption: async () => {} },
            './constants': {},
        },
        { setTimeout: () => 0 }
    );
    const component = new Sobject();
    component._recordName = 'Account';
    component.investigation = JSON.stringify({
        version: 1,
        id: 'test',
        instanceUrl,
        orgId,
        objectName: 'Account',
        recordId: '001000000000001AAA',
        fields: ['Name'],
        useToolingApi: false,
        category: 'validationRules',
    });
    return {
        component,
        setDescribe(fn) {
            describe = fn;
        },
        changeOrg() {
            connector = { ...connector, configuration: { orgId: '00D000000000002AAA' } };
        },
    };
}

test('a record investigation describes the object without counting all its records', async () => {
    const { component } = fixture();
    let counts = 0;
    component.checkTotalRecords = () => {
        counts++;
    };
    component.extraSelectedDetails = { totalRecords: 200 };
    await component.loadSpecificRecord();
    assert.equal(component.selectedDetails.name, 'Account');
    assert.equal(component.extraSelectedDetails.totalRecords, null);
    assert.equal(counts, 0);
    component.investigation = '';
    await component.loadSpecificRecord();
    assert.equal(counts, 1);
});

test('org changes clear loaded object evidence and discard pending describes', async () => {
    const f = fixture();
    f.component.connectionChanged();
    await f.component.loadSpecificRecord();
    let finish;
    f.setDescribe(
        () =>
            new Promise(resolve => {
                finish = resolve;
            })
    );
    const pending = f.component.loadSpecificRecord();
    await new Promise(resolve => setTimeout(resolve, 0));
    f.changeOrg();
    let reloaded = false;
    f.component.loadSpecificRecord = () => {
        reloaded = true;
    };
    f.component.connectionChanged();
    assert.equal(f.component.selectedDetails, null);
    assert.equal(f.component.investigationContext, null);
    assert.equal(reloaded, true);
    finish({ payload: { data: { name: 'Stale', fields: [] } } });
    await pending;
    assert.equal(f.component.selectedDetails, null);
});
