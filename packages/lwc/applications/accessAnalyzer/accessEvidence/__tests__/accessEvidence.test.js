import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import * as soql from '../../../../shared/modules/soqlQuery/soqlQuery.ts';
import * as links from '../../../../shared/modules/utils/salesforceLinks.ts';
import * as constants from '../constants.ts';
const { investigateAccess, searchAccessUsers, accessEvidenceNote } = loadTypeScriptModule(
    new URL('../accessEvidence.ts', import.meta.url),
    {
        'shared/soqlQuery/soqlQuery': soql,
        'shared/utils': links,
        './constants': constants,
    }
);
const input = {
    userId: '005000000000001AAA',
    objectName: 'Account',
    recordId: '001000000000001AAA',
    fieldName: 'Name',
};
const profileId = '00e000000000001AAA';
const permissionId = '0PS000000000001AAA';
function fixture(override = () => undefined) {
    const calls = [];
    const query = mode => sql => ({
        run: async () => {
            calls.push({ mode, sql });
            const custom = override(sql, mode);
            if (custom !== undefined) return custom;
            if (sql.includes('FROM User WHERE'))
                return [
                    {
                        Id: input.userId,
                        Name: 'Target',
                        Username: 'target@example.test',
                        IsActive: true,
                        ProfileId: profileId,
                    },
                ];
            if (sql.includes('FROM UserEntityAccess'))
                return [{ UserId: input.userId, IsReadable: true, IsEditable: true }];
            if (sql.includes('FROM UserFieldAccess'))
                return [{ UserId: input.userId, IsAccessible: true, IsUpdatable: false }];
            if (sql.includes('FROM UserRecordAccess'))
                return [{ RecordId: input.recordId, HasReadAccess: true, HasEditAccess: true }];
            if (sql.includes('FROM PermissionSet WHERE'))
                return [{ Id: permissionId, Label: 'Target profile', ProfileId: profileId }];
            if (sql.includes('FROM ObjectPermissions'))
                return [{ ParentId: permissionId, PermissionsRead: true, PermissionsEdit: true }];
            if (sql.includes('FROM FieldPermissions'))
                return [{ ParentId: permissionId, PermissionsRead: true, PermissionsEdit: false }];
            return [];
        },
    });
    return {
        calls,
        conn: {
            query: query('data'),
            tooling: { query: query('tooling') },
            sobject: () => ({
                describe: async () => ({
                    name: 'Account',
                    keyPrefix: '001',
                    fields: [{ name: 'Name' }],
                }),
            }),
        },
    };
}

test('record edit does not override a field edit denial; sources and queries retain scope', async () => {
    const f = fixture();
    const result = await investigateAccess(f.conn, input);
    assert.equal(result.checks[0].edit, true);
    assert.equal(result.checks[1].edit, false);
    assert.equal(result.checks[2].edit, true);
    assert.match(result.sources[0].detail, /object edit/);
    assert.doesNotMatch(result.sources[0].detail, /field edit/);
    for (const call of f.calls.filter(call =>
        /FROM User(Entity|Field|Record)Access/.test(call.sql)
    )) {
        assert.match(call.sql, new RegExp(input.userId));
        assert.equal(call.mode, call.sql.includes('UserRecordAccess') ? 'data' : 'tooling');
    }
});

test('record sharing denial remains distinct from object and field permissions', async () => {
    const f = fixture(sql =>
        sql.includes('FROM UserFieldAccess')
            ? [{ UserId: input.userId, IsAccessible: true, IsUpdatable: true }]
            : sql.includes('FROM UserRecordAccess')
              ? [{ RecordId: input.recordId, HasReadAccess: true, HasEditAccess: false }]
              : undefined
    );
    const result = await investigateAccess(f.conn, input);
    assert.equal(result.checks[0].edit, true);
    assert.equal(result.checks[1].edit, true);
    assert.equal(result.checks[2].edit, false);
});

test('denied, empty and mismatched access results remain unknown while other checks complete', async () => {
    for (const response of [
        [],
        [{ UserId: '005000000000002AAA', IsReadable: true, IsEditable: true }],
        [{ UserId: input.userId }],
    ]) {
        const result = await investigateAccess(
            fixture(sql => (sql.includes('FROM UserEntityAccess') ? response : undefined)).conn,
            input
        );
        assert.equal(result.checks[0].status, 'Unavailable');
        assert.equal(result.checks[0].edit, null);
        assert.equal(result.checks[2].read, true);
    }
    const result = await investigateAccess(
        fixture(sql => {
            if (sql.includes('FROM UserFieldAccess'))
                throw new Error('INSUFFICIENT_ACCESS fixture-secret');
        }).conn,
        input
    );
    assert.equal(result.checks[1].edit, null);
    assert.equal(result.checks[1].status, 'Unavailable');
    const note = accessEvidenceNote(
        result,
        'https://fixture.my.salesforce.com',
        'admin@example.test'
    );
    assert.match(note, /Unknown/);
    assert.doesNotMatch(note, /fixture-secret/);
});

test('missing field schema is not a target-user denial; optional fields remain not checked', async () => {
    const f = fixture();
    const missing = await investigateAccess(f.conn, { ...input, fieldName: 'Private__c' });
    assert.equal(missing.checks[1].status, 'Unavailable');
    assert.equal(missing.checks[1].read, null);
    const optional = await investigateAccess(f.conn, { ...input, fieldName: '' });
    assert.equal(optional.checks[1].status, 'Not checked');
});

test('invalid scope cannot enter a SOQL query and mismatched record prefixes are rejected', async () => {
    for (const patch of [
        { objectName: 'Account WHERE Id != null' },
        { userId: input.recordId },
        { recordId: "001' OR Name != null" },
        { fieldName: 'Name, Secret__c' },
    ]) {
        const f = fixture();
        await assert.rejects(investigateAccess(f.conn, { ...input, ...patch }));
        assert.equal(f.calls.length, 0);
    }
    await assert.rejects(
        investigateAccess(fixture().conn, { ...input, recordId: '003000000000001AAA' }),
        /does not belong/
    );
});

test('assigned groups and session activation are disclosed without inventing granting sources', async () => {
    const f = fixture(sql =>
        sql.includes('FROM PermissionSetAssignment')
            ? [
                  {
                      PermissionSetGroupId: '0PG000000000001AAA',
                      PermissionSetGroup: { MasterLabel: 'Sales group' },
                  },
                  {
                      PermissionSetId: permissionId,
                      PermissionSet: { Label: 'Temporary grant', HasActivationRequired: true },
                  },
              ]
            : sql.includes('FROM PermissionSet WHERE')
              ? []
              : undefined
    );
    const result = await investigateAccess(f.conn, input);
    assert.match(result.sources[0].detail, /requires session activation \(not verified\)/);
    assert.match(result.sources[1].detail, /muting have not been resolved/);
    assert.match(result.sourceNote, /profile permission set was not uniquely resolved/);
    const note = accessEvidenceNote(result, 'org', 'connected-user');
    assert.match(note, /Target user: Target/);
    assert.match(note, /UserFieldAccess/);
    assert.match(note, /Restriction rules/);
    assert.match(note, /Setup: \/lightning\/setup/);
});

test('user search escapes literals and reports bounded results', async () => {
    const f = fixture(sql =>
        sql.includes('FROM User WHERE')
            ? Array.from({ length: 21 }, (_, index) => ({
                  Id: `005${String(index).padStart(12, '0')}`,
                  Name: 'User',
                  Username: 'user@example.test',
              }))
            : undefined
    );
    const result = await searchAccessUsers(f.conn, "O'Neil");
    assert.equal(result.users.length, 20);
    assert.equal(result.truncated, true);
    assert.ok(f.calls[0].sql.includes("O\\'Neil"));
    assert.match(f.calls[0].sql, /LIMIT 21/);
});
