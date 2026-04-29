import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatName, METADATA_EXCLUDE_LIST, METADATA_EXCEPTION_LIST } from '../modules/metadata.ts';

test('formatName: prefers DeveloperName then MasterLabel then Name then Id', () => {
    assert.equal(
        formatName({ DeveloperName: 'dev', MasterLabel: 'ml', Name: 'n', Id: 'i' }),
        'dev'
    );
    assert.equal(formatName({ MasterLabel: 'ml', Name: 'n', Id: 'i' }), 'ml');
    assert.equal(formatName({ Name: 'n', Id: 'i' }), 'n');
    assert.equal(formatName({ Id: 'i' }), 'i');
    assert.equal(formatName({}), '');
});

test('formatName: prepends NamespacePrefix when present', () => {
    assert.equal(formatName({ DeveloperName: 'Widget', NamespacePrefix: 'acme' }), 'acme__Widget');
});

test('METADATA_EXCLUDE_LIST: contains Flow (covered by exception entries instead)', () => {
    assert.ok(METADATA_EXCLUDE_LIST.includes('Flow'));
});

test('METADATA_EXCEPTION_LIST: Flow entry filters out Workflow process-type', () => {
    const flow = METADATA_EXCEPTION_LIST.find(e => e.name === 'Flow');
    assert.ok(flow);
    assert.equal(flow!.manualFilter!({ ActiveVersion: { ProcessType: 'Workflow' } }), false);
    assert.equal(flow!.manualFilter!({ ActiveVersion: { ProcessType: 'AutoLaunched' } }), true);
});

test('METADATA_EXCEPTION_LIST: WorkFlow entry keeps only Workflow process-type', () => {
    const wf = METADATA_EXCEPTION_LIST.find(e => e.name === 'WorkFlow');
    assert.ok(wf);
    assert.equal(wf!.manualFilter!({ ActiveVersion: { ProcessType: 'Workflow' } }), true);
    assert.equal(wf!.manualFilter!({ ActiveVersion: { ProcessType: 'AutoLaunched' } }), false);
});

test('METADATA_EXCEPTION_LIST: badgeFunc reports Active vs Inactive for Flow', () => {
    const flow = METADATA_EXCEPTION_LIST.find(e => e.name === 'Flow')!;
    assert.equal(flow.badgeFunc!({ ActiveVersion: { Status: 'Active' } }).label, 'Active');
    assert.equal(flow.badgeFunc!({}).label, 'Inactive');
});

test('METADATA_EXCEPTION_LIST: FlowVersion badge + compare', () => {
    const fv = METADATA_EXCEPTION_LIST.find(e => e.name === 'FlowVersion')!;
    assert.equal(fv.badgeFunc!({ Status: 'Active' }).class, 'slds-theme_success');
    assert.equal(fv.badgeFunc!({ Status: 'Draft' }).label, 'Draft');
    assert.equal(fv.labelFunc({ VersionNumber: '3' }), 'Version 3');
    assert.ok(fv.compareFunc!({ Status: 'a' }, { Status: 'b' }) < 0);
});

test('METADATA_EXCEPTION_LIST: selectDefaultFunc falls back to empty string when missing', () => {
    const flow = METADATA_EXCEPTION_LIST.find(e => e.name === 'Flow')!;
    assert.equal(flow.selectDefaultFunc!({}), '');
    assert.equal(flow.selectDefaultFunc!({ ActiveVersionId: 'abc' }), 'abc');
});
