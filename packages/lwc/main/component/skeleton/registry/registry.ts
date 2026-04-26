import { APPLICATION_APP_MAPPING } from 'application/applicationRegistry';

const APPLICATION_MENU_GROUPS = [
    {
        key: 'data',
        label: 'Data',
        iconName: 'utility:database',
        order: 20,
    },
    {
        key: 'code',
        label: 'Code',
        iconName: 'standard:apex',
        order: 30,
    },
    {
        key: 'explorers',
        label: 'Explorers',
        iconName: 'standard:knowledge',
        order: 40,
    },
    {
        key: 'deploy',
        label: 'Deploy',
        iconName: 'standard:maintenance_asset',
        order: 50,
    },
];

export { APPLICATION_APP_MAPPING, APPLICATION_MENU_GROUPS };
