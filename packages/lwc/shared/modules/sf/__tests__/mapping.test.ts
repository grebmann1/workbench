import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    Sobject,
    RecordType,
    Field,
    UserPermission,
    PermissionGroups,
    PermissionSet,
    User,
    ObjectPermission,
    FieldPermission,
    LayoutAssignment,
    ApexPage,
    ApexClass,
    TabDefinition,
    AppDefinition,
    LoginIpRange,
    Layout,
} from '../mapping.ts';

test('Sobject: initializes empty maps', () => {
    const s = new Sobject('Account', 'Account');
    assert.equal(s.name, 'Account');
    assert.equal(s.label, 'Account');
    assert.deepEqual(s.fields, {});
    assert.deepEqual(s.recordTypes, {});
});

test('RecordType + Field: constructor stores all fields', () => {
    const rt = new RecordType('012', 'Partner', 'Partner Account');
    assert.equal(rt.id, '012');
    const f = new Field('Name', 'Name', 'string', false);
    assert.equal(f.type, 'string');
    assert.equal(f.isNillable, false);
});

test('UserPermission: stores name/label/enabled', () => {
    const up = new UserPermission('ViewAll', 'View All Data', true);
    assert.equal(up.name, 'ViewAll');
    assert.equal(up.enabled, true);
});

test('PermissionGroups: maps Salesforce record fields; members starts empty', () => {
    const pg = new PermissionGroups({
        Id: '0PS',
        DeveloperName: 'AdminGroup',
        MasterLabel: 'Admin Group',
        NamespacePrefix: 'x',
    });
    assert.equal(pg.id, '0PS');
    assert.equal(pg.name, 'AdminGroup');
    assert.equal(pg.label, 'Admin Group');
    assert.equal(pg.namespacePrefix, 'x');
    assert.deepEqual(pg.members, []);
});

test('PermissionSet: profile path overrides Name/Label when present', () => {
    const ps = new PermissionSet({
        Id: '0PS',
        License: { Name: 'Salesforce' },
        Type: 'Permission',
        Profile: { Name: 'SysAdmin', Label: 'System Admin' },
        Name: 'ignored-name',
        Label: 'ignored-label',
        ProfileId: '00e',
        Description: 'd',
        IsCustom: true,
        NamespacePrefix: 'ns',
    });
    assert.equal(ps.name, 'SysAdmin');
    assert.equal(ps.label, 'System Admin');
    assert.equal(ps.userLicense, 'Salesforce');
    assert.equal(ps.profileId, '00e');
    assert.equal(ps.isCustom, true);
    assert.deepEqual(ps.userPermissions, []);
    assert.deepEqual(ps.fieldPermissions, {});
    assert.equal(ps.activeUserCount, 0);
});

test('PermissionSet: without Profile falls back to Name/Label', () => {
    const ps = new PermissionSet({
        Id: '0PS',
        Type: 'Session',
        Name: 'BaseSet',
        Label: 'Base',
    });
    assert.equal(ps.name, 'BaseSet');
    assert.equal(ps.label, 'Base');
});

test('User: stores identity fields', () => {
    const u = new User('005', 'Bob', 'bob@ex.com', true);
    assert.equal(u.id, '005');
    assert.equal(u.isActive, true);
});

test('ObjectPermission: captures CRUD + *All flags', () => {
    const op = new ObjectPermission('Account', true, true, false, false, true, false);
    assert.equal(op.sobjectType, 'Account');
    assert.equal(op.viewAllRecords, true);
    assert.equal(op.modifyAllRecords, false);
});

test('FieldPermission: stores read/edit flags per sobject+field', () => {
    const fp = new FieldPermission('Account', 'Name', true, false);
    assert.equal(fp.sObjectName, 'Account');
    assert.equal(fp.fieldName, 'Name');
    assert.equal(fp.allowRead, true);
    assert.equal(fp.allowEdit, false);
});

test('LayoutAssignment: key combines objectName and recordTypeId when present', () => {
    const la = new LayoutAssignment('00h', 'Account', '012XX');
    assert.equal(la.key, 'Account-012XX');
    const la2 = new LayoutAssignment('00h2', 'Lead');
    assert.equal(la2.key, 'Lead');
});

test('ApexPage + ApexClass + TabDefinition + AppDefinition: record-shaped constructors', () => {
    const page = new ApexPage({ Id: '06', Name: 'My', MasterLabel: 'My Page' });
    assert.equal(page.label, 'My Page');
    const klass = new ApexClass({ Id: '01p', Name: 'Svc' });
    assert.equal(klass.name, 'Svc');
    const tab = new TabDefinition({ Name: 'Tab1', Label: 'Tab One' });
    assert.equal(tab.label, 'Tab One');
    const app = new AppDefinition({
        Id: '05a',
        Name: 'App',
        Label: 'Sales',
    });
    assert.equal(app.label, 'Sales');
});

test('LoginIpRange + Layout: constructors store provided fields', () => {
    const lir = new LoginIpRange('10.0.0.1', '10.0.0.255', 'corp');
    assert.equal(lir.startIp, '10.0.0.1');
    assert.equal(lir.description, 'corp');
    const layout = new Layout('00h', 'Account-Layout', 'Account', 'Account');
    assert.equal(layout.objectName, 'Account');
});
