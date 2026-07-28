/**
 * Category definitions, group mappings, and URL builders for Object Blueprint.
 */
import {
    getAppBuilderPagePath,
    getFlowBuilderPath,
    getObjectListViewPath,
    getObjectManagerRecordPath,
    getObjectManagerSectionPath,
    getSetupEntityPagePath,
    getSetupNodeHomePath,
} from 'shared/utils';

export interface BlueprintItem {
    key: string;
    name: string;
    apiName: string;
    status: string;
    description: string;
    additionalInfo: string;
    setupUrl: string;
    lastModifiedDate: string;
    lastModifiedBy: string;
    category: string;
}

export interface BlueprintCategory {
    key: string;
    label: string;
    icon: string;
    group: string;
    items: BlueprintItem[];
    error: string;
    isLoading: boolean;
}

export interface BlueprintGroup {
    key: string;
    label: string;
    categories: BlueprintCategory[];
    totalCount: number;
}

export const GROUPS = [
    { key: 'automation', label: 'Automation' },
    { key: 'process', label: 'Business Processes' },
    { key: 'quality', label: 'Data Quality' },
    { key: 'access', label: 'Access & Sharing' },
    { key: 'ui', label: 'UI & Layout' },
    { key: 'schema', label: 'Schema & Fields' },
    { key: 'code', label: 'Code & Jobs' },
] as const;

export const CATEGORIES: Array<{ key: string; label: string; icon: string; group: string }> = [
    // Automation
    {
        key: 'validationRules',
        label: 'Validation Rules',
        icon: 'utility:check',
        group: 'automation',
    },
    { key: 'apexTriggers', label: 'Apex Triggers', icon: 'utility:apex', group: 'automation' },
    {
        key: 'recordTriggeredFlows',
        label: 'Record-Triggered Flows',
        icon: 'utility:flow',
        group: 'automation',
    },
    // Business Processes
    {
        key: 'approvalProcesses',
        label: 'Approval Processes',
        icon: 'utility:approval',
        group: 'process',
    },
    { key: 'assignmentRules', label: 'Assignment Rules', icon: 'utility:assign', group: 'process' },
    { key: 'salesPath', label: 'Sales / Success Path', icon: 'utility:steps', group: 'process' },
    // Data Quality
    { key: 'duplicateRules', label: 'Duplicate Rules', icon: 'utility:ban', group: 'quality' },
    { key: 'matchingRules', label: 'Matching Rules', icon: 'utility:merge', group: 'quality' },
    // Access & Sharing
    { key: 'owdSharing', label: 'OWD Sharing Model', icon: 'utility:lock', group: 'access' },
    {
        key: 'ownerSharingRules',
        label: 'Owner-Based Sharing Rules',
        icon: 'utility:share',
        group: 'access',
    },
    {
        key: 'criteriaSharingRules',
        label: 'Criteria-Based Sharing Rules',
        icon: 'utility:filter',
        group: 'access',
    },
    { key: 'queues', label: 'Queues', icon: 'utility:queue', group: 'access' },
    {
        key: 'profilePermissions',
        label: 'Profile Object Permissions',
        icon: 'utility:shield',
        group: 'access',
    },
    {
        key: 'permSetAccess',
        label: 'Permission Set Object Access',
        icon: 'utility:key',
        group: 'access',
    },
    // UI & Layout
    { key: 'recordTypes', label: 'Record Types', icon: 'utility:record', group: 'ui' },
    { key: 'pageLayouts', label: 'Page Layouts', icon: 'utility:layout', group: 'ui' },
    { key: 'compactLayouts', label: 'Compact Layouts', icon: 'utility:compact', group: 'ui' },
    { key: 'lightningPages', label: 'Lightning Record Pages', icon: 'utility:page', group: 'ui' },
    {
        key: 'layoutAssignments',
        label: 'Page Layout Assignments',
        icon: 'utility:assignment',
        group: 'ui',
    },
    {
        key: 'flexiPageAssignments',
        label: 'FlexiPage Assignments',
        icon: 'utility:connected_apps',
        group: 'ui',
    },
    { key: 'quickActions', label: 'Quick Actions', icon: 'utility:new', group: 'ui' },
    { key: 'listViews', label: 'List Views', icon: 'utility:list', group: 'ui' },
    { key: 'customButtons', label: 'Custom Buttons & Links', icon: 'utility:link', group: 'ui' },
    // Schema & Fields
    { key: 'formulaFields', label: 'Formula Fields', icon: 'utility:formula', group: 'schema' },
    {
        key: 'rollupSummaries',
        label: 'Rollup Summary Fields',
        icon: 'utility:summary',
        group: 'schema',
    },
    { key: 'fieldSets', label: 'Field Sets', icon: 'utility:table', group: 'schema' },
    // Code & Jobs
    { key: 'apexClasses', label: 'Apex Classes', icon: 'utility:apex', group: 'code' },
    { key: 'scheduledJobs', label: 'Scheduled Jobs', icon: 'utility:clock', group: 'code' },
];

export const STATUS_BADGE_CLASS: Record<string, string> = {
    Active: 'badge-green',
    Inactive: 'badge-amber',
    Deactivated: 'badge-amber',
    'No Access': 'badge-grey',
    Obsolete: 'badge-grey',
    Draft: 'badge-grey',
    Unknown: 'badge-grey',
    Tracked: 'badge-green',
};

export function buildBlueprintSetupUrl(
    categoryKey: string,
    recordId: string,
    objectApiName: string
): string {
    switch (categoryKey) {
        case 'validationRules':
            return getObjectManagerRecordPath({
                objectApiName,
                section: 'ValidationRules',
                recordId,
            });
        case 'apexTriggers':
            return getSetupEntityPagePath({ setupEntity: 'ApexTriggers', id: recordId });
        case 'approvalProcesses':
            return getSetupEntityPagePath({ setupEntity: 'ApprovalProcesses', id: recordId });
        case 'duplicateRules':
            return getSetupEntityPagePath({ setupEntity: 'DuplicateRules', id: recordId });
        case 'matchingRules':
            return getSetupEntityPagePath({ setupEntity: 'MatchingRules', id: recordId });
        case 'salesPath':
            return '/lightning/setup/PathAssistantSetupHome/page';
        case 'assignmentRules':
            return objectApiName === 'Case'
                ? getSetupNodeHomePath({ setupNode: 'CaseRules' })
                : getSetupNodeHomePath({ setupNode: 'LeadRules' });
        case 'owdSharing':
        case 'ownerSharingRules':
        case 'criteriaSharingRules':
            return getSetupNodeHomePath({ setupNode: 'SecuritySharing' });
        case 'queues':
            return `/lightning/setup/Queues/page?address=%2Fp%2Fown%2FQueue%2Fd%3Fid%3D${recordId}`;
        case 'profilePermissions':
            return getSetupEntityPagePath({ setupEntity: 'EnhancedProfiles', id: recordId });
        case 'permSetAccess':
            return getSetupEntityPagePath({ setupEntity: 'PermSets', id: recordId });
        case 'recordTypes':
            return getObjectManagerRecordPath({
                objectApiName,
                section: 'RecordTypes',
                recordId,
            });
        case 'pageLayouts':
            return getObjectManagerRecordPath({
                objectApiName,
                section: 'PageLayouts',
                recordId,
            });
        case 'compactLayouts':
            return getObjectManagerRecordPath({
                objectApiName,
                section: 'CompactLayouts',
                recordId,
            });
        case 'lightningPages':
            return getAppBuilderPagePath({ pageId: recordId });
        case 'layoutAssignments':
            return getObjectManagerSectionPath({ objectApiName, section: 'PageLayouts' });
        case 'flexiPageAssignments':
            return recordId
                ? getAppBuilderPagePath({ pageId: recordId })
                : getObjectManagerSectionPath({ objectApiName, section: 'LightningPages' });
        case 'quickActions':
            return getObjectManagerRecordPath({
                objectApiName,
                section: 'ButtonsLinksActions',
                recordId,
            });
        case 'customButtons':
            return getObjectManagerRecordPath({
                objectApiName,
                section: 'ButtonsLinksActions',
                recordId,
            });
        case 'listViews':
            return getObjectListViewPath({ objectApiName, filterName: recordId });
        case 'formulaFields':
        case 'rollupSummaries':
            return recordId
                ? getObjectManagerRecordPath({
                      objectApiName,
                      section: 'FieldsAndRelationships',
                      recordId,
                  })
                : getObjectManagerSectionPath({ objectApiName, section: 'FieldsAndRelationships' });
        case 'fieldSets':
            return recordId
                ? getObjectManagerRecordPath({ objectApiName, section: 'FieldSets', recordId })
                : getObjectManagerSectionPath({ objectApiName, section: 'FieldSets' });
        case 'apexClasses':
            return getSetupEntityPagePath({ setupEntity: 'ApexClasses', id: recordId });
        case 'scheduledJobs':
            return getSetupNodeHomePath({ setupNode: 'ScheduledJobs' });
        default:
            return '';
    }
}

export function buildBlueprintFlowUrl(
    activeVersionId: string | null,
    latestVersionId: string | null
): string {
    return getFlowBuilderPath({ activeVersionId, latestVersionId });
}

export function formatDateString(raw: string | null | undefined): string {
    if (!raw) return '';
    try {
        const d = new Date(raw);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return raw;
    }
}

export function safeString(val: unknown): string {
    return typeof val === 'string' ? val : '';
}

export function safeBool(val: unknown): boolean {
    return val === true;
}
