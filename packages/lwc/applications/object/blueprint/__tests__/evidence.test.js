import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as investigation from '../../../../shared/modules/recordInvestigation/recordInvestigation.ts';

const decorate = () => undefined;
const constants = loadTypeScriptModule(new URL('../constants.ts', import.meta.url), {
    'shared/utils': new Proxy({}, { get: () => () => '/lightning/setup/example' }),
});

function fixture() {
    let connector = {
        configuration: { orgId: '00D000000000001AAA' },
        conn: {
            instanceUrl: 'https://example.my.salesforce.com',
            accessToken: 'do-not-export',
            query: async () => ({ records: [], done: true }),
            tooling: { query: async () => ({ records: [], done: true }) },
            metadata: { read: async () => ({ fullName: 'Account' }) },
        },
    };
    const { default: Blueprint } = loadTypeScriptModule(
        new URL('../blueprint.ts', import.meta.url),
        {
            'host-api/element': {
                __esModule: true,
                default: class {
                    get connector() {
                        return connector;
                    }
                },
            },
            'host-api/store': { connectStore: {}, store: {} },
            'lightning/toast': {},
            lwc: { api: decorate, track: decorate, wire: () => decorate },
            'shared/store': {},
            'shared/utils': { isEmpty: value => !value },
            'shared/recordInvestigation': investigation,
            '../sessionCallOptions': { ensureSessionClientCallOption: async () => {} },
            './constants': constants,
        }
    );
    const component = new Blueprint();
    component.objectName = 'Account';
    component.initializeBlueprint();
    return {
        component,
        conn: connector.conn,
        changeOrg() {
            connector = { ...connector, configuration: { orgId: '00D000000000002AAA' } };
        },
    };
}

test('failed sharing reads are unavailable and retry can establish a successful empty result', async () => {
    const { component, conn } = fixture();
    conn.metadata.read = async () => {
        throw new Error('INSUFFICIENT_ACCESS');
    };
    await component.loadCategory('ownerSharingRules');
    let category = component._categories.get('ownerSharingRules');
    assert.match(category.error, /Unavailable/);
    assert.equal(category.checked, false);
    assert.equal(component.noData, false);
    conn.metadata.read = async () => ({ fullName: 'Account' });
    await component.loadCategory('ownerSharingRules');
    category = component._categories.get('ownerSharingRules');
    assert.equal(category.error, '');
    assert.equal(category.checked, true);
    assert.equal(category.items.length, 0);
});

test('failed rule enrichment retains inventory and reports partial coverage', async () => {
    const { component, conn } = fixture();
    conn.tooling.query = async query => {
        if (query.includes('SELECT Id, Metadata')) throw new Error('Details denied');
        return {
            records: [{ Id: '03d000000000001AAA', ValidationName: 'Require_Name', Active: true }],
            done: true,
        };
    };
    await component.loadCategory('validationRules');
    const category = component._categories.get('validationRules');
    assert.equal(category.items.length, 1);
    assert.match(category.warning, /1 item\(s\) have unavailable details/);
    assert.match(component.buildEvidenceNote(), /Partial coverage/);
});

test('heuristic coverage and unexamined categories survive evidence export without secrets', async () => {
    const { component } = fixture();
    await component.loadCategory('apexClasses');
    const note = component.buildEvidenceNote();
    assert.match(note, /class name only/);
    assert.match(note, /limited to 50/);
    assert.match(note, /Validation Rules — Not checked/);
    assert.doesNotMatch(note, /do-not-export|accessToken|frontDoor/);
});

test('Blueprint discards results from an org changed during the request', async () => {
    const f = fixture();
    let finish;
    f.conn.metadata.read = () =>
        new Promise(resolve => {
            finish = resolve;
        });
    const request = f.component.loadCategory('ownerSharingRules');
    await new Promise(resolve => setTimeout(resolve, 0));
    f.changeOrg();
    finish({ sharingOwnerRules: [{ fullName: 'Stale' }] });
    await request;
    assert.equal(f.component._loadedCategories.has('ownerSharingRules'), false);
    assert.equal(f.component._categories.get('ownerSharingRules').items.length, 0);
});

test('investigation activation retrieves the relevant group and keeps other categories unexamined', async () => {
    const { component } = fixture();
    component._hasLoaded = false;
    component.investigation = JSON.stringify({
        version: 1,
        id: 'test',
        instanceUrl: 'https://example.my.salesforce.com',
        orgId: '00D000000000001AAA',
        objectName: 'Account',
        recordId: '001000000000001AAA',
        fields: ['Name'],
        useToolingApi: false,
        category: 'validationRules',
    });
    const requested = [];
    component.loadCategory = async key => requested.push(key);
    component.activate();
    assert.deepEqual(requested, ['validationRules', 'apexTriggers', 'recordTriggeredFlows']);
    assert.equal(component.openGroups.automation, true);
    assert.equal(component.openGroups.access, false);
    assert.equal(component.openCategories.validationRules, true);
});
