/**
 * Category definitions, group mappings, and URL builders for Object Blueprint.
 */

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

export function buildSetupUrl(
    categoryKey: string,
    recordId: string,
    objectApiName: string
): string {
    switch (categoryKey) {
        case 'validationRules':
            return `/lightning/setup/ObjectManager/${objectApiName}/ValidationRules/${recordId}/view`;
        case 'apexTriggers':
            return `/lightning/setup/ApexTriggers/page?address=%2F${recordId}`;
        case 'approvalProcesses':
            return `/lightning/setup/ApprovalProcesses/page?address=%2F${recordId}`;
        case 'duplicateRules':
            return `/lightning/setup/DuplicateRules/page?address=%2F${recordId}`;
        case 'matchingRules':
            return `/lightning/setup/MatchingRules/page?address=%2F${recordId}`;
        case 'salesPath':
            return '/lightning/setup/PathAssistantSetupHome/page';
        case 'assignmentRules':
            return objectApiName === 'Case'
                ? '/lightning/setup/CaseRules/home'
                : '/lightning/setup/LeadRules/home';
        case 'owdSharing':
        case 'ownerSharingRules':
        case 'criteriaSharingRules':
            return '/lightning/setup/SecuritySharing/home';
        case 'queues':
            return `/lightning/setup/Queues/page?address=%2Fp%2Fown%2FQueue%2Fd%3Fid%3D${recordId}`;
        case 'profilePermissions':
            return `/lightning/setup/EnhancedProfiles/page?address=%2F${recordId}`;
        case 'permSetAccess':
            return `/lightning/setup/PermSets/page?address=%2F${recordId}`;
        case 'recordTypes':
            return `/lightning/setup/ObjectManager/${objectApiName}/RecordTypes/${recordId}/view`;
        case 'pageLayouts':
            return `/lightning/setup/ObjectManager/${objectApiName}/PageLayouts/${recordId}/view`;
        case 'compactLayouts':
            return `/lightning/setup/ObjectManager/${objectApiName}/CompactLayouts/${recordId}/view`;
        case 'lightningPages':
            return `/visualEditor/appBuilder.app?pageId=${recordId}`;
        case 'layoutAssignments':
            return `/lightning/setup/ObjectManager/${objectApiName}/PageLayouts/view`;
        case 'flexiPageAssignments':
            return recordId
                ? `/visualEditor/appBuilder.app?pageId=${recordId}`
                : `/lightning/setup/ObjectManager/${objectApiName}/LightningPages/view`;
        case 'quickActions':
            return `/lightning/setup/ObjectManager/${objectApiName}/ButtonsLinksActions/${recordId}/view`;
        case 'customButtons':
            return `/lightning/setup/ObjectManager/${objectApiName}/ButtonsLinksActions/${recordId}/view`;
        case 'listViews':
            return `/lightning/o/${objectApiName}/list?filterName=${recordId}`;
        case 'formulaFields':
        case 'rollupSummaries':
            return recordId
                ? `/lightning/setup/ObjectManager/${objectApiName}/FieldsAndRelationships/${recordId}/view`
                : `/lightning/setup/ObjectManager/${objectApiName}/FieldsAndRelationships/view`;
        case 'fieldSets':
            return recordId
                ? `/lightning/setup/ObjectManager/${objectApiName}/FieldSets/${recordId}/view`
                : `/lightning/setup/ObjectManager/${objectApiName}/FieldSets/view`;
        case 'apexClasses':
            return `/lightning/setup/ApexClasses/page?address=%2F${recordId}`;
        case 'scheduledJobs':
            return '/lightning/setup/ScheduledJobs/home';
        default:
            return '';
    }
}

export function buildFlowUrl(
    activeVersionId: string | null,
    latestVersionId: string | null
): string {
    const versionId = activeVersionId || latestVersionId;
    return versionId ? `/builder_platform_interaction/flowBuilder.app?flowId=${versionId}` : '';
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
