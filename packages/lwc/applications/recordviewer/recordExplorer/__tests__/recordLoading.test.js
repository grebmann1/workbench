import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as investigation from '../../../../shared/modules/recordInvestigation/recordInvestigation.ts';
import * as constants from '../../../../shared/modules/recordInvestigation/constants.ts';

const id = '001000000000001AAA';
const metadata = {
    name: 'Account',
    fields: [
        { name: 'Id', label: 'ID', type: 'id' },
        { name: 'Name', label: 'Name', type: 'string' },
    ],
};
const decorate = () => undefined;
const lwc = { api: decorate, track: decorate, wire: () => decorate };

function fixture({ tooling = false } = {}) {
    let connector = {
        configuration: { orgId: '00D000000000001AAA' },
        conn: { instanceUrl: 'https://example.my.salesforce.com', accessToken: 'do-not-export' },
    };
    const events = [],
        routes = [],
        redirects = [];
    let reads = 0;
    const read = {
        describe$: async () => metadata,
        retrieve: async recordId => {
            reads++;
            return { Id: recordId, Name: recordId };
        },
    };
    connector.conn.sobject = () => read;
    connector.conn.describeGlobal = async () => ({
        sobjects: tooling ? [] : [{ name: 'Account', keyPrefix: '001' }],
    });
    connector.conn.tooling = {
        sobject: () => read,
        describeGlobal: async () => ({ sobjects: [{ name: 'Account', keyPrefix: '001' }] }),
    };
    const { default: RecordExplorer } = loadTypeScriptModule(
        new URL('../recordExplorer.ts', import.meta.url),
        {
            'host-api/element': {
                __esModule: true,
                default: class {
                    get connector() {
                        return connector;
                    }
                    dispatchEvent(event) {
                        events.push(event);
                    }
                },
            },
            'host-api/store': { store: {}, connectStore: {} },
            'lightning/toast': { __esModule: true, default: { show() {} } },
            lwc,
            'lwr/navigation': { navigate: (_context, route) => routes.push(route) },
            'shared/store': {},
            'shared/utils': {
                isEmpty: value => !value,
                isNotUndefinedOrNull: value => value != null,
                getCurrentTab: async () => null,
                redirectToUrlViaChrome: settings => redirects.push(settings),
            },
            'shared/recordInvestigation': investigation,
            'shared/recordInvestigation/constants': constants,
        },
        {
            URL,
            URLSearchParams,
            chrome: { runtime: { getURL: path => `chrome-extension://fixture${path}` } },
            CustomEvent: class {
                constructor(type, options) {
                    this.type = type;
                    this.detail = options.detail;
                }
            },
        }
    );
    const component = new RecordExplorer();
    component._recordId = id;
    return {
        component,
        events,
        routes,
        redirects,
        read,
        get reads() {
            return reads;
        },
        changeOrg() {
            connector = { ...connector, configuration: { orgId: '00D000000000002AAA' } };
        },
    };
}

test('the compact SOQL action opens the original object query without executing it', async () => {
    const f = fixture();
    await f.component.initRecordExplorer();
    f.component.handleRedirectDataExplorer();
    assert.equal(f.routes[0].state.applicationName, 'soql');
    assert.equal(f.routes[0].state.query, 'SELECT Id FROM Account');
    assert.equal(f.routes[0].state.investigation, undefined);
    assert.equal(f.reads, 1);
});

test('Tooling mode survives schema discovery and refresh', async () => {
    const f = fixture({ tooling: true });
    await f.component.initRecordExplorer();
    assert.equal(f.component.isUsingToolingApi, true);
    await f.component.refreshData();
    assert.equal(f.component.isUsingToolingApi, true);
    assert.equal(f.reads, 2);
});

test('the extension panel opens the original SOQL and Record Viewer routes', async () => {
    const f = fixture();
    f.component.isPanel = true;
    await f.component.initRecordExplorer();
    f.component.handleRedirectDataExplorer();
    assert.equal(f.routes.length, 0);
    assert.equal(f.redirects.length, 1);
    const params = new URLSearchParams(decodeURIComponent(f.redirects[0].redirectUrl));
    assert.equal(params.get('applicationName'), 'soql');
    assert.equal(params.get('query'), 'SELECT Id FROM Account');
    assert.equal(params.has('investigation'), false);
    f.component.handleRedirectToApp();
    const recordParams = new URLSearchParams(decodeURIComponent(f.redirects[1].redirectUrl));
    assert.equal(recordParams.get('applicationName'), 'recordviewer');
    assert.equal(recordParams.get('recordId'), id);
    assert.equal(recordParams.has('investigation'), false);
    assert.equal(f.reads, 1);
});

test('a response for a previous record cannot replace the selected record', async () => {
    const f = fixture();
    let finish;
    f.read.retrieve = recordId =>
        recordId === id
            ? new Promise(resolve => {
                  finish = resolve;
              })
            : Promise.resolve({ Id: recordId });
    const first = f.component.initRecordExplorer();
    await new Promise(resolve => setTimeout(resolve, 0));
    f.component._recordId = '001000000000002AAA';
    await f.component.initRecordExplorer();
    finish({ Id: id, Name: 'Stale' });
    await first;
    assert.equal(f.component.record.Id, '001000000000002AAA');
    assert.equal(f.events.filter(event => event.type === 'dataload').length, 1);
});

test('changing org invalidates in-flight record evidence', async () => {
    const f = fixture();
    let finish;
    f.read.retrieve = () =>
        new Promise(resolve => {
            finish = resolve;
        });
    const request = f.component.initRecordExplorer();
    await new Promise(resolve => setTimeout(resolve, 0));
    f.changeOrg();
    finish({ Id: id });
    await request;
    assert.equal(f.component.record, null);
    assert.equal(f.events.filter(event => event.type === 'dataload').length, 0);
});
