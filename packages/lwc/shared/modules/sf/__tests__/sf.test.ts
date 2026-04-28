import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkArray } from '../sf.ts';
import {
    Sobject,
    RecordType,
    Field,
    FieldPermission,
    ObjectPermission,
    LayoutAssignment,
    PermissionSet,
    PermissionGroups,
    ApexClass,
    ApexPage,
    AppDefinition,
    TabDefinition,
    User,
    UserPermission,
    LoginIpRange,
} from '../mapping.ts';

test('chunkArray: default chunk size 5', () => {
    const out = chunkArray([1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(out, [
        [1, 2, 3, 4, 5],
        [6, 7],
    ]);
});

test('chunkArray: custom chunk size', () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('chunkArray: empty array returns empty array', () => {
    assert.deepEqual(chunkArray([], 3), []);
});

test('chunkArray: array shorter than chunk size returns single chunk', () => {
    assert.deepEqual(chunkArray([1, 2], 10), [[1, 2]]);
});

test('Sobject: initializes empty fields/recordTypes maps', () => {
    const obj = new Sobject('Account', 'Account');
    assert.equal(obj.name, 'Account');
    assert.equal(obj.label, 'Account');
    assert.deepEqual(obj.fields, {});
    assert.deepEqual(obj.recordTypes, {});
});

test('RecordType / Field: hold their constructor args', () => {
    const rt = new RecordType('012xx0000004C9p', 'Standard', 'Standard');
    assert.equal(rt.id, '012xx0000004C9p');
    const field = new Field('Name', 'Account Name', 'string', false);
    assert.equal(field.name, 'Name');
    assert.equal(field.isNillable, false);
});

test('FieldPermission: structures read/edit flags', () => {
    const fp = new FieldPermission('Account', 'Name', true, false);
    assert.equal(fp.sObjectName, 'Account');
    assert.equal(fp.fieldName, 'Name');
    assert.equal(fp.allowRead, true);
    assert.equal(fp.allowEdit, false);
});

test('ObjectPermission: preserves CRUD + view/modify-all', () => {
    const op = new ObjectPermission('Account', true, true, false, false, true, false);
    assert.equal(op.sobjectType, 'Account');
    assert.equal(op.allowCreate, true);
    assert.equal(op.allowRead, true);
    assert.equal(op.allowEdit, false);
    assert.equal(op.allowDelete, false);
    assert.equal(op.viewAllRecords, true);
    assert.equal(op.modifyAllRecords, false);
});

test('LayoutAssignment: builds composite key including recordTypeId', () => {
    const la = new LayoutAssignment('00hxx', 'Account', '012xx');
    assert.equal(la.key, 'Account-012xx');
    const no = new LayoutAssignment('00hxx', 'Account');
    assert.equal(no.key, 'Account');
});

test('PermissionSet: unwraps Profile fields when present', () => {
    const ps = new PermissionSet({
        Id: '0PS',
        License: { Name: 'Salesforce' },
        Type: 'Profile',
        Profile: { Name: 'Admin', Label: 'System Administrator' },
        Name: 'AdminPS',
        Label: 'AdminPS',
        ProfileId: '00e',
        Description: '',
        IsCustom: false,
        NamespacePrefix: undefined,
    });
    assert.equal(ps.id, '0PS');
    assert.equal(ps.userLicense, 'Salesforce');
    assert.equal(ps.name, 'Admin');
    assert.equal(ps.label, 'System Administrator');
    assert.equal(ps.profileId, '00e');
    assert.deepEqual(ps.userPermissions, []);
    assert.deepEqual(ps.objectPermissions, []);
    assert.deepEqual(ps.fieldPermissions, {});
    assert.equal(ps.activeUserCount, 0);
});

test('PermissionSet: falls back to Name/Label when no Profile', () => {
    const ps = new PermissionSet({
        Id: '0PS',
        Type: 'Regular',
        Name: 'StandardUser',
        Label: 'Standard User',
    });
    assert.equal(ps.name, 'StandardUser');
    assert.equal(ps.label, 'Standard User');
    assert.equal(ps.userLicense, undefined);
});

test('PermissionGroups: starts with empty members, reads record shape', () => {
    const pg = new PermissionGroups({
        Id: 'PG',
        DeveloperName: 'Dev',
        MasterLabel: 'Master',
        NamespacePrefix: 'ns',
    });
    assert.equal(pg.id, 'PG');
    assert.equal(pg.name, 'Dev');
    assert.equal(pg.label, 'Master');
    assert.equal(pg.namespacePrefix, 'ns');
    assert.deepEqual(pg.members, []);
});

test('ApexClass / ApexPage / AppDefinition / TabDefinition record mappers', () => {
    const ac = new ApexClass({ Id: '01p', Name: 'Foo', NamespacePrefix: undefined });
    assert.equal(ac.id, '01p');
    assert.equal(ac.name, 'Foo');

    const ap = new ApexPage({ Id: 'pg', Name: 'Home', MasterLabel: 'Home Label' });
    assert.equal(ap.label, 'Home Label');

    const app = new AppDefinition({ Id: '06m', Name: 'App', Label: 'AppLabel' });
    assert.equal(app.label, 'AppLabel');

    const tab = new TabDefinition({ Name: 'Tab1', Label: 'Tab One' });
    assert.equal(tab.name, 'Tab1');
    assert.equal(tab.label, 'Tab One');
});

test('User / UserPermission / LoginIpRange: simple positional constructors', () => {
    const u = new User('005', 'Alice', 'alice@example.com', true);
    assert.equal(u.username, 'alice@example.com');
    assert.equal(u.isActive, true);

    const perm = new UserPermission('ApiEnabled', 'API Enabled', true);
    assert.equal(perm.enabled, true);

    const ip = new LoginIpRange('10.0.0.1', '10.0.0.255', 'office');
    assert.equal(ip.startIp, '10.0.0.1');
    assert.equal(ip.description, 'office');
});
