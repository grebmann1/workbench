import { isEmpty } from './validation';

/**
 * Salesforce URL/link generation utilities
 */

type ObjectSetupLinkParams = {
    host: string;
    sobjectName: string;
    durableId?: string | null;
    isCustomSetting?: boolean;
};

type ObjectFieldDetailParams = {
    host: string;
    sobjectName: string;
    durableId?: string | null;
    fieldName: string;
    fieldNameDurableId: string;
};

type ObjectListParams = {
    host: string;
    sobjectName: string;
    keyPrefix: string;
    isCustomSetting?: boolean;
};

type RecordTypesParams = {
    host: string;
    sobjectName: string;
    durableId?: string | null;
};

type SetupEntityPathParams = {
    host?: string;
    setupEntity: string;
    id: string;
};

type SetupNodeHomePathParams = {
    host?: string;
    setupNode: string;
};

type ObjectManagerSectionPathParams = {
    host?: string;
    objectApiName: string;
    section: string;
};

type ObjectManagerRecordPathParams = {
    host?: string;
    objectApiName: string;
    section: string;
    recordId: string;
};

type ObjectListViewPathParams = {
    host?: string;
    objectApiName: string;
    filterName: string;
};

type AppBuilderPagePathParams = {
    host?: string;
    pageId: string;
};

type FlowBuilderPathParams = {
    host?: string;
    flowDefId?: string | null;
    activeVersionId?: string | null;
    latestVersionId?: string | null;
};

export function getObjectSetupLink({
    host,
    sobjectName,
    durableId,
    isCustomSetting,
}: ObjectSetupLinkParams): string {
    if (sobjectName.endsWith('__mdt')) {
        return getCustomMetadataLink({ host, durableId });
    } else if (isCustomSetting) {
        return `${host}/lightning/setup/CustomSettings/page?address=%2F${durableId}?setupid=CustomSettings`;
    } else if (!isEmpty(durableId) && sobjectName.endsWith('__c')) {
        return `${host}/lightning/setup/ObjectManager/${durableId}/Details/view`;
    } else {
        return `${host}/lightning/setup/ObjectManager/${sobjectName}/Details/view`;
    }
}

export function getCustomMetadataLink({
    host,
    durableId,
}: {
    host: string;
    durableId?: string | null;
}): string {
    if (!host) {
        console.warn('getCustomMetadataLink: host parameter is required');
        return '#';
    }
    return `${host}/lightning/setup/CustomMetadata/page?address=%2F${durableId}%3Fsetupid%3DCustomMetadata`;
}

export function getObjectFieldsSetupLink({
    host,
    sobjectName,
    durableId,
    isCustomSetting,
}: ObjectSetupLinkParams): string {
    if (sobjectName.endsWith('__mdt')) {
        return getCustomMetadataLink({ host, durableId });
    } else if (isCustomSetting) {
        return `${host}/lightning/setup/CustomSettings/page?address=%2F${durableId}?setupid=CustomSettings`;
    } else if (
        !isEmpty(durableId) &&
        (sobjectName.endsWith('__c') || sobjectName.endsWith('__kav'))
    ) {
        return `${host}/lightning/setup/ObjectManager/${durableId}/FieldsAndRelationships/view`;
    } else {
        return `${host}/lightning/setup/ObjectManager/${sobjectName}/FieldsAndRelationships/view`;
    }
}

export function getObjectFieldDetailSetupLink({
    host,
    sobjectName,
    durableId,
    fieldName,
    fieldNameDurableId,
}: ObjectFieldDetailParams): string {
    const _sobjectParam =
        sobjectName.endsWith('__c') || sobjectName.endsWith('__kav') ? durableId : sobjectName;
    const _fieldParam =
        sobjectName.endsWith('__c') || sobjectName.endsWith('__kav')
            ? fieldNameDurableId
            : fieldName;

    return `${host}/lightning/setup/ObjectManager/${_sobjectParam}/FieldsAndRelationships/${_fieldParam}/view`;
}

export function getObjectListLink({
    host,
    sobjectName,
    keyPrefix,
    isCustomSetting,
}: ObjectListParams): string {
    if (sobjectName.endsWith('__mdt')) {
        return `${host}/lightning/setup/CustomMetadata/page?address=%2F${keyPrefix}`;
    } else if (isCustomSetting) {
        return `${host}/lightning/setup/CustomSettings/page?address=%2Fsetup%2Fui%2FlistCustomSettingsData.apexp?id=${keyPrefix}`;
    } else {
        return `${host}/lightning/o/${sobjectName}/list`;
    }
}

export function getRecordTypesLink({ host, sobjectName, durableId }: RecordTypesParams): string {
    if (sobjectName.endsWith('__c') || sobjectName.endsWith('__kav')) {
        return `${host}/lightning/setup/ObjectManager/${durableId}/RecordTypes/view`;
    } else {
        return `${host}/lightning/setup/ObjectManager/${sobjectName}/RecordTypes/view`;
    }
}

export function getObjectDocLink(sobjectName: string, isUsingToolingApi: boolean): string {
    if (isUsingToolingApi) {
        return `https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_${sobjectName.toLowerCase()}.htm`;
    }
    return `https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_${sobjectName.toLowerCase()}.htm`;
}

function withHost(host: string | undefined, path: string): string {
    return `${host || ''}${path}`;
}

export function getSetupEntityPagePath({ host, setupEntity, id }: SetupEntityPathParams): string {
    return withHost(
        host,
        `/lightning/setup/${setupEntity}/page?address=%2F${encodeURIComponent(id)}`
    );
}

export function getSetupNodeHomePath({ host, setupNode }: SetupNodeHomePathParams): string {
    return withHost(host, `/lightning/setup/${setupNode}/home`);
}

export function getObjectManagerSectionPath({
    host,
    objectApiName,
    section,
}: ObjectManagerSectionPathParams): string {
    return withHost(host, `/lightning/setup/ObjectManager/${objectApiName}/${section}/view`);
}

export function getObjectManagerRecordPath({
    host,
    objectApiName,
    section,
    recordId,
}: ObjectManagerRecordPathParams): string {
    return withHost(
        host,
        `/lightning/setup/ObjectManager/${objectApiName}/${section}/${recordId}/view`
    );
}

export function getObjectListViewPath({
    host,
    objectApiName,
    filterName,
}: ObjectListViewPathParams): string {
    return withHost(
        host,
        `/lightning/o/${objectApiName}/list?filterName=${encodeURIComponent(filterName)}`
    );
}

export function getAppBuilderPagePath({ host, pageId }: AppBuilderPagePathParams): string {
    return withHost(host, `/visualEditor/appBuilder.app?pageId=${encodeURIComponent(pageId)}`);
}

export function getFlowBuilderPath({
    host,
    flowDefId,
    activeVersionId,
    latestVersionId,
}: FlowBuilderPathParams): string {
    const flowId = activeVersionId || latestVersionId;
    if (isEmpty(flowId)) {
        return '';
    }
    const encodedFlowId = encodeURIComponent(String(flowId));
    const query = flowDefId
        ? `?isFromAloha=true&flowDefId=${encodeURIComponent(flowDefId)}&flowId=${encodedFlowId}`
        : `?flowId=${encodedFlowId}`;
    return withHost(host, `/builder_platform_interaction/flowBuilder.app${query}`);
}
