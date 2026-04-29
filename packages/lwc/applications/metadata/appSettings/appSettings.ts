import AppSettingsElement from 'host-api/settingsElement';
import { METADATA as METADATA_UTILS } from 'shared/utils';

const DEFAULT_STORAGE_TYPES = [
    'ApexClass',
    'ApexTrigger',
    'ApexPage',
    'ApexComponent',
    'LightningComponentBundle',
    'AuraDefinitionBundle',
    'CustomObject',
    'CustomField',
    'PermissionSet',
    'Profile',
    'Flow',
    'StaticResource',
];

export default class MetadataAppSettings extends AppSettingsElement {
    get isStorageEnabled() {
        return !!this.getConfigValue('metadata_storage_enabled', false);
    }

    get isBackgroundSyncEnabled() {
        return !!this.getConfigValue('metadata_storage_background_sync_enabled', false);
    }

    get storageTypesValue() {
        const value = this.getConfigValue('metadata_storage_types', DEFAULT_STORAGE_TYPES);
        return Array.isArray(value) ? value : DEFAULT_STORAGE_TYPES;
    }

    get storageTypeOptions() {
        const runtimeTypes = (METADATA_UTILS as any).METADATA_EXCEPTION_LIST.filter(
            (item: any) => item.isSearchable
        ).map((item: any) => item.name);
        const values = Array.from(new Set([...DEFAULT_STORAGE_TYPES, ...runtimeTypes])).sort(
            (a: string, b: string) => a.localeCompare(b)
        );
        return values.map((type: string) => ({ label: type, value: type }));
    }
}
