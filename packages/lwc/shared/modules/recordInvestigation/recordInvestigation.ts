export { MAX_INVESTIGATION_FIELDS } from './constants';

import { asSalesforceId } from '../soqlQuery/soqlQuery';
import { API_NAME_PATTERN, INVESTIGATION_CATEGORIES, MAX_INVESTIGATION_FIELDS } from './constants';

export interface InvestigationConnection {
    configuration?: { orgId?: string; alias?: string };
    conn?: { instanceUrl?: string };
}

export interface RecordInvestigation {
    version: 1;
    id: string;
    instanceUrl: string;
    orgId: string;
    objectName: string;
    recordId: string;
    recordFetchedAt?: string;
    fields: string[];
    useToolingApi: boolean;
    category: (typeof INVESTIGATION_CATEGORIES)[number];
}

function origin(value: unknown): string {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' && !url.username && !url.password ? url.origin : '';
    } catch {
        return '';
    }
}

export function investigationOrgKey(connection: InvestigationConnection | null): string {
    const instance = origin(connection?.conn?.instanceUrl);
    return instance ? `${instance}|${connection?.configuration?.orgId?.slice(0, 15) || ''}` : '';
}

/** Only explicitly selected, non-secret context crosses application boundaries. */
export function parseInvestigation(value: unknown): RecordInvestigation | null {
    try {
        if (typeof value !== 'string' || value.length > 12000) return null;
        const data = JSON.parse(value);
        if (
            data?.version !== 1 ||
            typeof data.id !== 'string' ||
            !/^[\w-]{1,100}$/.test(data.id) ||
            typeof data.objectName !== 'string' ||
            !API_NAME_PATTERN.test(data.objectName) ||
            !Array.isArray(data.fields) ||
            data.fields.length > MAX_INVESTIGATION_FIELDS ||
            !data.fields.every(
                (field: unknown) => typeof field === 'string' && API_NAME_PATTERN.test(field)
            ) ||
            typeof data.useToolingApi !== 'boolean' ||
            !INVESTIGATION_CATEGORIES.includes(data.category) ||
            typeof data.orgId !== 'string' ||
            !origin(data.instanceUrl)
        )
            return null;
        return {
            version: 1,
            id: data.id,
            instanceUrl: origin(data.instanceUrl),
            orgId: data.orgId ? asSalesforceId(data.orgId) : '',
            objectName: data.objectName,
            recordId: asSalesforceId(data.recordId),
            recordFetchedAt:
                typeof data.recordFetchedAt === 'string' &&
                Number.isFinite(Date.parse(data.recordFetchedAt))
                    ? new Date(data.recordFetchedAt).toISOString()
                    : '',
            fields: Array.from(new Set<string>(data.fields)),
            useToolingApi: data.useToolingApi,
            category: data.category,
        };
    } catch {
        return null;
    }
}

export function currentInvestigation(
    value: unknown,
    connection: InvestigationConnection | null
): RecordInvestigation | null {
    const context = parseInvestigation(value);
    if (!context) return null;
    const key = `${context.instanceUrl}|${context.orgId.slice(0, 15)}`;
    return key === investigationOrgKey(connection) ? context : null;
}

export function recordInvestigationQuery(context: RecordInvestigation): string {
    const checked = parseInvestigation(JSON.stringify(context));
    if (!checked) throw new Error('Invalid record investigation');
    const fields = Array.from(new Set(['Id', ...checked.fields]));
    return `SELECT ${fields.join(', ')} FROM ${checked.objectName} WHERE Id = '${checked.recordId}'`;
}

export function investigationRoute(
    context: RecordInvestigation,
    destination: 'recordviewer' | 'soql' | 'sobject' | 'access'
): Record<string, string> {
    const state: Record<string, string> = {
        applicationName: destination,
        investigation: JSON.stringify(context),
    };
    if (destination === 'recordviewer') state.recordId = context.recordId;
    if (destination === 'soql') state.query = recordInvestigationQuery(context);
    if (destination === 'sobject') {
        state.attribute1 = context.objectName;
        state.attribute2 = context.useToolingApi ? 'tooling' : 'standard';
    }
    return state;
}

export function investigationHeading(context: RecordInvestigation): string {
    return `${context.objectName} · ${context.recordId} · ${context.fields.join(', ') || 'Id'}`;
}

export function recordEvidenceNote(context: RecordInvestigation, fetchedAt: string): string {
    return [
        '# Record investigation',
        '',
        `Org: ${context.instanceUrl} (${context.orgId || 'org ID unavailable'})`,
        `Record: ${context.objectName} / ${context.recordId}`,
        `Selected fields: ${context.fields.join(', ') || 'Id'}`,
        `API: ${context.useToolingApi ? 'Tooling' : 'Standard'}`,
        `Record retrieved at: ${fetchedAt || 'not retrieved'}`,
        '',
        '## Reproduce',
        '```sql',
        recordInvestigationQuery(context),
        '```',
        '',
        'Coverage: record and schema retrieved as the connected user. Field values are omitted from this note.',
        'Automation execution, field dependencies, history and other users’ access have not been checked.',
    ].join('\n');
}
