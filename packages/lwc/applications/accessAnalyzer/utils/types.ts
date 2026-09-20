export type MetadataEntry = {
    id?: string;
    name: string;
    label?: string;
    namespacePrefix?: string;
    type?: string;
    isNillable?: boolean;
    fields?: Record<string, MetadataEntry>;
    recordTypes?: Record<string, MetadataEntry>;
    members?: string[];
};
export type AccessMetadata = {
    sobjects: Record<string, import('shared/sf/mapping').Sobject & { namespacePrefix?: string }>;
    profileFields: Record<string, MetadataEntry>;
    apexClasses: Record<string, MetadataEntry>;
    apexPages: Record<string, MetadataEntry>;
    appDefinitions: Record<string, MetadataEntry>;
    tabDefinitions: Record<string, MetadataEntry>;
    layouts: Record<string, MetadataEntry>;
    permissionGroups: Record<string, MetadataEntry>;
};
export type PermissionSummary = {
    id: string;
    name: string;
    activeUserCount?: number;
    inactiveUserCount?: number;
    userLicense?: string;
    isCustom?: boolean;
    description?: string;
};
export type AccessRow = {
    name?: string;
    label?: string;
    namespacePrefix?: string;
    category?: string;
    _children?: AccessRow[];
    [key: string]: unknown;
};
