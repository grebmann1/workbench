import applicationManifest from '../../../../packages/lwc/main/application/applicationRegistry/application.manifest.json';
import packageInfo from '../../../../package.json';

export const PREVIEW_VERSION = packageInfo.version;

export const PREVIEW_ORG = {
    name: 'Acme',
    user: 'Alex Rivera',
    username: 'alex.rivera@acme.example',
    host: 'acme-dev.my.salesforce.com',
    api: '66.0',
};

export const PREVIEW_MENU_GROUPS = [
    { id: 'data', label: 'Data', icon: 'database' },
    { id: 'code', label: 'Code', icon: 'new_window' },
    { id: 'agentforce', label: 'Agentforce', icon: 'einstein' },
    { id: 'admin', label: 'Admin', icon: 'setup' },
    { id: 'utilities', label: 'Utilities', icon: 'settings' },
]
    .map(group => ({
        ...group,
        apps: applicationManifest.apps
            .filter(
                app =>
                    app.menuGroup === group.id &&
                    app.flags.isMenuVisible &&
                    !app.flags.isElectronOnly
            )
            .sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0)),
    }))
    .filter(group => group.apps.length > 0);

export const PREVIEW_OBJECTS = [
    'Account',
    'AccountChangeEvent',
    'AccountContactRelation',
    'AccountContactRole',
    'AccountFeed',
    'AccountHistory',
    'AccountPartner',
    'AccountShare',
    'ActionCadence',
    'ActivityHistory',
    'ApexClass',
    'Asset',
    'Campaign',
    'Case',
    'Contact',
    'ContentDocument',
    'Contract',
    'Lead',
    'Opportunity',
    'Order',
    'Product2',
    'Task',
    'User',
];
export const PREVIEW_METADATA_TYPES = [
    'ActionLinkGroupTemplate',
    'AIApplication',
    'AIApplicationConfig',
    'AIReplyToSfdcEmail',
    'AnalyticsSnapshot',
    'AnimationRule',
    'ApexClass',
    'ApexComponent',
    'ApexEmailNotifications',
    'ApexPage',
    'ApexTestSuite',
    'ApexTrigger',
    'AppMenu',
    'ApprovalProcess',
    'AssignmentRules',
    'AuraDefinitionBundle',
    'CustomObject',
    'CustomPermission',
    'Flow',
    'Layout',
    'LightningComponentBundle',
    'PermissionSet',
    'Profile',
];
export const PREVIEW_ACCOUNTS = [
    ['001xx000003DHP0', 'Acme Corp', 'Technology'],
    ['001xx000003DHP1', 'Globex', 'Manufacturing'],
    ['001xx000003DHP2', 'Initech', 'Finance'],
];
