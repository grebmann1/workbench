import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as context from '../../../../shared/modules/recordInvestigation/recordInvestigation.ts';
const decorate = () => undefined;
function fixture() {
    let connector = {
        configuration: { orgId: '00D000000000001AAA' },
        conn: { instanceUrl: 'https://example.my.salesforce.com' },
    };
    let finish;
    let calls = 0;
    const { default: Investigation } = loadTypeScriptModule(
        new URL('../investigation.ts', import.meta.url),
        {
            'host-api/element': {
                __esModule: true,
                default: class {
                    get connector() {
                        return connector;
                    }
                },
            },
            'host-api/store': {},
            lwc: { api: decorate, wire: () => decorate },
            'lwr/navigation': {},
            'shared/recordInvestigation': context,
            'shared/utils': {},
            '../accessEvidence/constants': { COVERAGE: [] },
            '../accessEvidence/accessEvidence': {
                investigateAccess: () => {
                    calls++;
                    return new Promise(resolve => {
                        finish = resolve;
                    });
                },
            },
        }
    );
    const component = new Investigation();
    component.connectionChanged();
    component.selectedUser = {
        id: '005000000000001AAA',
        name: 'Target',
        username: 'target@example.test',
    };
    component.objectName = 'Account';
    component.recordId = '001000000000001AAA';
    return {
        component,
        calls: () => calls,
        finish: value => finish(value),
        changeOrg: () => {
            connector = { ...connector, configuration: { orgId: '00D000000000002AAA' } };
        },
        reconnect: () => {
            connector = { ...connector };
        },
    };
}

test('selecting a target clears prior findings and does not run a query', () => {
    const f = fixture();
    f.component.evidence = { checkedAt: 'old' };
    f.component.users = [
        { id: '005000000000002AAA', name: 'Second', username: 'second@example.test' },
    ];
    f.component.handleSelectUser({ currentTarget: { dataset: { id: f.component.users[0].id } } });
    assert.equal(f.component.evidence, null);
    assert.equal(f.component.selectedUser.name, 'Second');
    assert.equal(f.calls(), 0);
});

test('org changes clear results and discard the previous org’s pending evidence', async () => {
    const f = fixture();
    const request = f.component.handleRun();
    f.changeOrg();
    f.component.connectionChanged();
    f.finish({ targetName: 'Old org', checks: [] });
    await request;
    assert.equal(f.component.evidence, null);
    assert.equal(f.component.selectedUser, null);
    assert.equal(f.component.recordId, '');
    assert.equal(f.component.exportDisabled, true);
});

test('changing scope discards old results even when the old request finishes later', async () => {
    const f = fixture();
    const request = f.component.handleRun();
    f.component.handleInput({ target: { name: 'fieldName', value: 'Industry' } });
    f.finish({ targetName: 'Old field', checks: [] });
    await request;
    assert.equal(f.component.evidence, null);
    assert.equal(f.component.fieldName, 'Industry');
});

test('reconnecting to the same org clears old-session evidence and loading state', async () => {
    const f = fixture();
    const request = f.component.handleRun();
    f.reconnect();
    f.component.connectionChanged();
    f.finish({ targetName: 'Old session', checks: [] });
    await request;
    assert.equal(f.component.evidence, null);
    assert.equal(f.component.selectedUser, null);
    assert.equal(f.component.isLoading, false);
    assert.equal(f.component.exportDisabled, true);
});
