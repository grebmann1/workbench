import type { ConnectionLike } from 'host-api/connector';
import { asSalesforceId, escapeSoqlLiteral } from 'shared/soqlQuery/soqlQuery';
import { getSetupEntityPagePath } from 'shared/utils';
import { API_NAME_PATTERN, COVERAGE, SOURCE_LIMIT, USER_SEARCH_LIMIT } from './constants';

type Row = Record<string, unknown>;
export interface AccessInput {
    objectName: string;
    recordId: string;
    fieldName: string;
    userId: string;
}
export interface AccessCheck {
    key: string;
    label: string;
    status: 'Retrieved' | 'Unavailable' | 'Not checked';
    read: boolean | null;
    edit: boolean | null;
    detail: string;
    query: string;
    mode: 'data' | 'tooling';
}
export interface PermissionSource {
    id: string;
    label: string;
    kind: string;
    detail: string;
    setupUrl: string;
}
export interface AccessEvidence {
    input: AccessInput;
    checkedAt: string;
    targetName: string;
    targetUsername: string;
    targetActive: boolean | null;
    checks: AccessCheck[];
    sources: PermissionSource[];
    sourceNote: string;
}
const boolean = (value: unknown) => (typeof value === 'boolean' ? value : null);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const row = (value: unknown): Row => (value && typeof value === 'object' ? (value as Row) : {});
const sameId = (value: unknown, expected: string) =>
    typeof value === 'string' && value.slice(0, 15) === expected.slice(0, 15);

export function validateAccessInput(input: AccessInput): AccessInput {
    const value = Object.fromEntries(
        Object.entries(input).map(([key, val]) => [key, typeof val === 'string' ? val.trim() : ''])
    );
    if (
        !API_NAME_PATTERN.test(value.objectName || '') ||
        (value.fieldName && !API_NAME_PATTERN.test(value.fieldName))
    )
        throw new Error('Enter an object API name and an optional field API name.');
    const userId = asSalesforceId(value.userId);
    if (!userId.startsWith('005')) throw new Error('Select a Salesforce user (005 ID).');
    return {
        objectName: value.objectName,
        fieldName: value.fieldName || '',
        recordId: asSalesforceId(value.recordId),
        userId,
    };
}

async function queryRows(
    conn: ConnectionLike,
    query: string,
    mode: 'data' | 'tooling' = 'data',
    cap = 2
): Promise<Row[]> {
    const api = mode === 'tooling' ? conn.tooling : conn;
    if (!api?.query) throw new Error('API unavailable');
    const records = await api
        .query<Row>(query)
        .run({ responseTarget: 'Records', autoFetch: false, maxFetch: cap });
    if (!Array.isArray(records)) throw new Error('No query result');
    return records;
}

export async function searchAccessUsers(conn: ConnectionLike, value: string) {
    const search = value.trim();
    if (search.length < 2 || search.length > 100)
        throw new Error('Enter 2–100 characters of a name, username or user ID.');
    const literal = escapeSoqlLiteral(search).replace(/[%_]/g, '\\$&');
    const filter = /^005[a-zA-Z0-9]{12}([a-zA-Z0-9]{3})?$/.test(search)
        ? `Id = '${search}'`
        : `(Name LIKE '%${literal}%' OR Username LIKE '%${literal}%')`;
    const rows = await queryRows(
        conn,
        `SELECT Id, Name, Username, IsActive FROM User WHERE ${filter} ORDER BY Name LIMIT ${USER_SEARCH_LIMIT + 1}`,
        'data',
        USER_SEARCH_LIMIT + 1
    );
    return {
        truncated: rows.length > USER_SEARCH_LIMIT,
        users: rows.slice(0, USER_SEARCH_LIMIT).map(user => ({
            id: asSalesforceId(text(user.Id)),
            name: text(user.Name),
            username: text(user.Username),
            active: boolean(user.IsActive),
        })),
    };
}

function unknownCheck(
    key: string,
    label: string,
    detail: string,
    status: AccessCheck['status'] = 'Unavailable'
): AccessCheck {
    return { key, label, status, read: null, edit: null, detail, query: '', mode: 'data' };
}

async function accessCheck(
    conn: ConnectionLike,
    key: string,
    label: string,
    query: string,
    mode: 'data' | 'tooling',
    readField: string,
    editField: string,
    identity: string,
    expected: string
): Promise<AccessCheck> {
    try {
        const records = await queryRows(conn, query, mode);
        if (records.length !== 1 || !sameId(records[0][identity], expected))
            return {
                ...unknownCheck(
                    key,
                    label,
                    'Salesforce returned no unique matching result. This is not a denial.'
                ),
                query,
                mode,
            };
        const read = boolean(records[0][readField]),
            edit = boolean(records[0][editField]);
        return {
            key,
            label,
            query,
            mode,
            read,
            edit,
            status: read === null || edit === null ? 'Unavailable' : 'Retrieved',
            detail:
                read === null || edit === null
                    ? 'Salesforce omitted a permission result. Missing values remain unknown.'
                    : `Source: ${mode === 'tooling' ? 'Tooling API' : 'REST API'}; queried for the selected user.`,
        };
    } catch {
        return {
            ...unknownCheck(
                key,
                label,
                'Salesforce could not provide this check. Verify API support and your access, then rerun.'
            ),
            query,
            mode,
        };
    }
}

async function permissionSources(conn: ConnectionLike, input: AccessInput, profileId: unknown) {
    const sources: PermissionSource[] = [];
    try {
        const profile = asSalesforceId(text(profileId));
        const [profiles, assignments] = await Promise.all([
            queryRows(
                conn,
                `SELECT Id, Label, ProfileId FROM PermissionSet WHERE IsOwnedByProfile = true AND ProfileId = '${profile}' LIMIT 2`
            ),
            queryRows(
                conn,
                `SELECT PermissionSetId, PermissionSet.Label, PermissionSet.HasActivationRequired, PermissionSetGroupId, PermissionSetGroup.MasterLabel FROM PermissionSetAssignment WHERE AssigneeId = '${input.userId}' AND IsActive = true LIMIT ${SOURCE_LIMIT + 1}`,
                'data',
                SOURCE_LIMIT + 1
            ),
        ]);
        const direct = assignments
            .slice(0, SOURCE_LIMIT)
            .filter(item => !item.PermissionSetGroupId);
        const configs = [
            ...profiles.map(item => ({
                id: asSalesforceId(text(item.Id)),
                label: text(item.Label),
                kind: 'Profile',
                setupUrl: getSetupEntityPagePath({ setupEntity: 'Profiles', id: profile }),
                activation: false,
            })),
            ...direct.map(item => ({
                id: asSalesforceId(text(item.PermissionSetId)),
                label: text(row(item.PermissionSet).Label),
                kind: 'Direct permission set',
                setupUrl: getSetupEntityPagePath({
                    setupEntity: 'PermSets',
                    id: text(item.PermissionSetId),
                }),
                activation: row(item.PermissionSet).HasActivationRequired === true,
            })),
        ];
        const ids = [...new Set(configs.map(item => item.id))];
        const filter = ids.map(id => `'${id}'`).join(', ');
        const [objects, fields] = ids.length
            ? await Promise.all([
                  queryRows(
                      conn,
                      `SELECT ParentId, PermissionsRead, PermissionsEdit FROM ObjectPermissions WHERE SobjectType = '${input.objectName}' AND ParentId IN (${filter}) LIMIT 500`,
                      'data',
                      500
                  ),
                  input.fieldName
                      ? queryRows(
                            conn,
                            `SELECT ParentId, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE SobjectType = '${input.objectName}' AND Field = '${input.objectName}.${input.fieldName}' AND ParentId IN (${filter}) LIMIT 500`,
                            'data',
                            500
                        )
                      : Promise.resolve([]),
              ])
            : [[], []];
        for (const config of configs) {
            const object = objects.find(item => sameId(item.ParentId, config.id));
            const field = fields.find(item => sameId(item.ParentId, config.id));
            const grants = [
                object?.PermissionsRead === true ? 'object read' : '',
                object?.PermissionsEdit === true ? 'object edit' : '',
                field?.PermissionsRead === true ? 'field read' : '',
                field?.PermissionsEdit === true ? 'field edit' : '',
            ].filter(Boolean);
            if (grants.length)
                sources.push({
                    ...config,
                    detail: `${grants.join(', ')}${config.activation ? '; requires session activation (not verified)' : ''}`,
                });
        }
        for (const assignment of assignments
            .slice(0, SOURCE_LIMIT)
            .filter(item => item.PermissionSetGroupId)) {
            const id = asSalesforceId(text(assignment.PermissionSetGroupId));
            sources.push({
                id,
                label: text(row(assignment.PermissionSetGroup).MasterLabel) || id,
                kind: 'Permission-set group',
                detail: 'Assigned group; component grants and muting have not been resolved.',
                setupUrl: getSetupEntityPagePath({ setupEntity: 'PermSetGroups', id }),
            });
        }
        const limited =
            assignments.length > SOURCE_LIMIT || objects.length >= 500 || fields.length >= 500;
        return {
            sources,
            sourceNote: `Configured sources retrieved${limited ? ' with a result limit reached' : ''}. ${profiles.length !== 1 ? 'The profile permission set was not uniquely resolved. ' : ''}These rows do not establish all effective granting sources. ${COVERAGE[2]}`,
        };
    } catch {
        return { sources: [], sourceNote: `Configured sources unavailable. ${COVERAGE[2]}` };
    }
}

export async function investigateAccess(
    conn: ConnectionLike,
    raw: AccessInput
): Promise<AccessEvidence> {
    const input = validateAccessInput(raw);
    const users = await queryRows(
        conn,
        `SELECT Id, Name, Username, IsActive, ProfileId FROM User WHERE Id = '${input.userId}' LIMIT 2`
    );
    if (users.length !== 1 || !sameId(users[0].Id, input.userId))
        throw new Error('The selected user could not be retrieved in this org.');
    const user = users[0];
    let schemaAvailable = false,
        fieldAvailable = false;
    try {
        const schema = await conn.sobject?.(input.objectName).describe();
        if (
            schema &&
            typeof schema.keyPrefix === 'string' &&
            schema.keyPrefix !== input.recordId.slice(0, 3)
        )
            throw new Error('RECORD_OBJECT_MISMATCH');
        schemaAvailable = !!schema && schema.name === input.objectName;
        fieldAvailable = !!schema?.fields.some(field => field.name === input.fieldName);
    } catch (error) {
        if (error instanceof Error && error.message === 'RECORD_OBJECT_MISMATCH')
            throw new Error('The record ID does not belong to this object.');
    }
    const [objectCheck, fieldCheck, recordCheck, sourceResult] = await Promise.all([
        accessCheck(
            conn,
            'object',
            `Object: ${input.objectName}`,
            `SELECT UserId, IsReadable, IsEditable FROM UserEntityAccess WHERE UserId = '${input.userId}' AND EntityDefinition.QualifiedApiName = '${input.objectName}'`,
            'tooling',
            'IsReadable',
            'IsEditable',
            'UserId',
            input.userId
        ),
        !input.fieldName
            ? Promise.resolve(unknownCheck('field', 'Field', 'No field selected.', 'Not checked'))
            : !fieldAvailable
              ? Promise.resolve(
                    unknownCheck(
                        'field',
                        `Field: ${input.fieldName}`,
                        'Field schema is unavailable to the connected user. The target user’s access is unknown.'
                    )
                )
              : accessCheck(
                    conn,
                    'field',
                    `Field: ${input.fieldName}`,
                    `SELECT UserId, IsAccessible, IsUpdatable FROM UserFieldAccess WHERE UserId = '${input.userId}' AND FieldDefinition.EntityDefinition.QualifiedApiName = '${input.objectName}' AND FieldDefinition.QualifiedApiName = '${input.fieldName}'`,
                    'tooling',
                    'IsAccessible',
                    'IsUpdatable',
                    'UserId',
                    input.userId
                ),
        schemaAvailable
            ? accessCheck(
                  conn,
                  'record',
                  `Record: ${input.recordId}`,
                  `SELECT RecordId, HasReadAccess, HasEditAccess FROM UserRecordAccess WHERE UserId = '${input.userId}' AND RecordId = '${input.recordId}'`,
                  'data',
                  'HasReadAccess',
                  'HasEditAccess',
                  'RecordId',
                  input.recordId
              )
            : Promise.resolve(
                  unknownCheck(
                      'record',
                      `Record: ${input.recordId}`,
                      'Object schema could not be verified. Check your connection and object API name.'
                  )
              ),
        permissionSources(conn, input, user.ProfileId),
    ]);
    return {
        input,
        checkedAt: new Date().toISOString(),
        targetName: text(user.Name),
        targetUsername: text(user.Username),
        targetActive: boolean(user.IsActive),
        checks: [objectCheck, fieldCheck, recordCheck],
        ...sourceResult,
    };
}

export function accessEvidenceNote(
    evidence: AccessEvidence,
    org: string,
    connectedUser: string
): string {
    const lines = [
        '# User access investigation',
        '',
        `Org: ${org}`,
        `Connected user: ${connectedUser}`,
        `Target user: ${evidence.targetName} (${evidence.targetUsername}; ${evidence.input.userId})`,
        `Target user active: ${evidence.targetActive ?? 'Unknown'}`,
        `Object: ${evidence.input.objectName}`,
        `Record: ${evidence.input.recordId}`,
        `Field: ${evidence.input.fieldName || 'None'}`,
        `Checked at: ${evidence.checkedAt}`,
        '',
    ];
    for (const check of evidence.checks) {
        lines.push(
            `## ${check.label} — ${check.status}`,
            `Read: ${check.read ?? 'Unknown'}; Edit: ${check.edit ?? 'Unknown'}`,
            check.detail
        );
        if (check.query) lines.push(`API: ${check.mode}`, '```sql', check.query, '```');
        lines.push('');
    }
    lines.push('## Configured sources', evidence.sourceNote);
    for (const source of evidence.sources)
        lines.push(
            `- ${source.label} (${source.kind}): ${source.detail}`,
            `  Setup: ${source.setupUrl}`
        );
    lines.push('', '## Remaining checks', ...COVERAGE.map(item => `- ${item}`));
    return lines.join('\n');
}
