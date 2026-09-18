import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as investigation from '../../../../shared/modules/recordInvestigation/recordInvestigation.ts';

const context = {
    version: 1,
    id: 'request-1',
    instanceUrl: 'https://example.my.salesforce.com',
    orgId: '00D000000000001AAA',
    objectName: 'Account',
    recordId: '001000000000001AAA',
    fields: ['Name'],
    useToolingApi: true,
    category: 'validationRules',
};

function fixture() {
    const state = { ui: { tabs: [{ id: 'draft', body: 'SELECT Name FROM Contact' }] } };
    const dispatched = [],
        routes = [];
    const store = {
        getState: () => state,
        dispatch: action => {
            dispatched.push(action);
            if (action.type === 'add') state.ui.tabs.push(action.payload.tab);
        },
    };
    const decorate = () => undefined;
    const { default: Soql } = loadTypeScriptModule(
        new URL('../app.ts', import.meta.url),
        {
            'host-api/analytics': {},
            'host-api/builder': {},
            'host-api/commands': { registerCommand() {} },
            'host-api/element': {
                __esModule: true,
                default: class {
                    connector = {
                        configuration: { orgId: context.orgId },
                        conn: { instanceUrl: context.instanceUrl },
                    };
                },
            },
            'host-api/logger': {},
            'host-api/store': { store, injectReducer() {} },
            'shared/store': {},
            'shared/recordInvestigation': investigation,
            'host-api/utils': {
                guidFromHash: value => value,
                isNotUndefinedOrNull: value => value != null,
            },
            'lightning/confirm': {},
            'lightning/toast': { __esModule: true, default: { show() {} } },
            lwc: { api: decorate, track: decorate, wire: () => decorate },
            'lwr/navigation': { navigate: (_context, route) => routes.push(route) },
            moment: {},
            'soql/performanceModal': {},
            '../describeResolver': {},
            'soql/slices': {
                UI: {
                    reduxSlice: {
                        reducer() {},
                        actions: {
                            addTab: payload => ({ type: 'add', payload }),
                            selectionTab: payload => ({ type: 'select', payload }),
                        },
                    },
                },
                QUERY: { reduxSlice: { reducer() {} } },
            },
            'soql/slices/query': {},
            './util': {},
        },
        {
            URLSearchParams,
            window: {
                location: { search: '', origin: 'https://workbench.test', pathname: '/' },
                history: { replaceState() {} },
            },
        }
    );
    return { component: new Soql(), state, dispatched, routes };
}

test('SOQL handoff adds a draft with API mode and return context, leaving existing drafts intact', async () => {
    const f = fixture();
    const route = investigation.investigationRoute(context, 'soql');
    await f.component.loadFromNavigation({ state: route });
    assert.equal(f.state.ui.tabs[0].body, 'SELECT Name FROM Contact');
    assert.equal(f.state.ui.tabs.length, 2);
    assert.equal(f.state.ui.tabs[1].useToolingApi, true);
    assert.match(f.state.ui.tabs[1].body, /WHERE Id = '001000000000001AAA'/);
    f.state.ui.tabs[1].body = 'Edited investigation draft';
    await f.component.loadFromNavigation({ state: route });
    assert.equal(f.state.ui.tabs.length, 2);
    assert.equal(f.state.ui.tabs[1].body, 'Edited investigation draft');
    assert.equal(f.dispatched.map(action => action.type).join(','), 'add,select');
    f.component.activeInvestigation = f.state.ui.tabs[1].investigation;
    f.component.handleReturnToRecord();
    assert.equal(f.routes[0].state.recordId, context.recordId);
    assert.equal(JSON.parse(f.routes[0].state.investigation).fields[0], 'Name');
});

test('foreign-org context and other application routes cannot create a SOQL tab', async () => {
    const f = fixture();
    await f.component.loadFromNavigation({
        state: investigation.investigationRoute(
            { ...context, orgId: '00D000000000002AAA' },
            'soql'
        ),
    });
    await f.component.loadFromNavigation({
        state: investigation.investigationRoute(context, 'sobject'),
    });
    await f.component.loadFromNavigation(null);
    assert.equal(f.dispatched.length, 0);
});

test('check-query handoffs keep Standard and Tooling drafts separate without executing either', async () => {
    const f = fixture();
    const query = 'SELECT UserId FROM UserEntityAccess';
    await f.component.loadFromNavigation({
        state: { applicationName: 'soql', query, queryApi: 'tooling' },
    });
    await f.component.loadFromNavigation({
        state: { applicationName: 'soql', query, queryApi: 'data' },
    });
    assert.equal(f.state.ui.tabs[1].useToolingApi, true);
    assert.equal(f.state.ui.tabs[2].useToolingApi, false);
    assert.notEqual(f.state.ui.tabs[1].id, f.state.ui.tabs[2].id);
    assert.equal(f.dispatched.map(action => action.type).join(','), 'add,add');
});
