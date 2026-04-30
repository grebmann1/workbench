import type { JsforceQueryExecution, JsforceDescribeSObjectResult } from '../types';

import {
    PermissionSet,
    Sobject,
    ObjectPermission,
    FieldPermission,
    PermissionGroups,
    LayoutAssignment,
    Field,
    ApexClass,
    ApexPage,
    AppDefinition,
    Layout,
    RecordType,
    TabDefinition,
    UserPermission,
    User,
} from './mapping';

type QueryRunOptions = {
    responseTarget: 'Records';
    autoFetch: boolean;
    maxFetch: number;
};

// Local alias so we can continue to write `QueryLike<Foo>` throughout the file.
type QueryLike<T = Record<string, unknown>> = JsforceQueryExecution<T>;

type SalesforceConnection = {
    query: <T = Record<string, unknown>>(soql: string) => QueryLike<T>;
    tooling: {
        query: <T = Record<string, unknown>>(soql: string) => QueryLike<T>;
    };
    sobject: (name: string) => {
        describe: () => Promise<JsforceDescribeSObjectResult>;
    };
};

type PermissionSetMap = Record<string, PermissionSet>;
type SobjectMap = Record<string, Sobject>;
type ApexClassMap = Record<string, ApexClass>;
type ApexPageMap = Record<string, ApexPage>;
type AppDefinitionMap = Record<string, AppDefinition>;
type LayoutMap = Record<string, Layout>;
type TabDefinitionMap = Record<string, TabDefinition>;
type PermissionGroupsMap = Record<string, PermissionGroups>;
type ProfileFieldsMap = Record<string, { name: string; label: string }>;
type EntityAccessMap = Record<
    string,
    {
        classAccesses: ApexClass[];
        pageAccesses: ApexPage[];
        appAccesses: AppDefinition[];
    }
>;

export const loadMetadata_async = async (
    conn: SalesforceConnection,
    callback: (payload: { entityAccess: EntityAccessMap }) => void,
    updateLoadingMessage: (message: string) => void
): Promise<{
    permissionSets: PermissionSetMap;
    sobjects: SobjectMap;
    apexClasses: ApexClassMap;
    apexPages: ApexPageMap;
    appDefinitions: AppDefinitionMap;
    profileFields: ProfileFieldsMap;
    layouts: LayoutMap;
    tabDefinitions: TabDefinitionMap;
    entityAccess: EntityAccessMap;
    permissionGroups: PermissionGroupsMap;
}> => {
    // console.log('executing -> loadMetadata_async');
    const results_1 = await Promise.all([
        getPermissionSet(conn),
        getEntityDefinition(conn),
        getApexClass(conn),
        getApexPage(conn),
        getAppDefinition(conn),
        getLayouts(conn),
        getTabDefinitions(conn),
        getPermissionGroups(conn),
    ]);
    //console.log('--> Result_1');

    updateLoadingMessage('Mapping General permissions and layouts. (2/3)');

    const { permissionSets, permissionSetProfileMapping } = results_1[0];
    const sobjects = results_1[1];
    const apexClasses = results_1[2];
    const apexPages = results_1[3];
    const appDefinitions = results_1[4];
    const layouts = results_1[5];
    const tabDefinitions = results_1[6];
    const permissionGroups = results_1[7];

    const results_2 = await Promise.all([
        setUserPermissions(conn, permissionSets),
        setRecordTypes(conn, sobjects),
        setLayoutAssignments(conn, permissionSets, { permissionSetProfileMapping, layouts }),
    ]);
    //console.log('--> Result_2');
    updateLoadingMessage('Mapping Entities to Profiles & PermissionSets. (3/3)');

    const profileFields = results_2[0];

    const results_3 = await Promise.all([
        getSetupEntityAccess(conn, null, false, { apexClasses, apexPages, appDefinitions }),
        setObjectPermissions(conn, permissionSets),
        setPermissionSetTabSetting(conn, permissionSets, { tabDefinitions }),
    ]);
    //console.log('--> results_3');
    const entityAccess = results_3[0];

    /** Map entity to Profile */
    // We do it here to reuse the method in async mode
    Object.keys(permissionSets).forEach(key => {
        permissionSets[key] = {
            ...permissionSets[key],
            ...entityAccess[key],
        };
    });

    const asyncLoading = async () => {
        /* This can be really slow */
        //console.log('namespaceLoading');
        // Set Permissions
        const results_4 = await Promise.all([
            getSetupEntityAccess(conn, null, true, { apexClasses, apexPages, appDefinitions }),
        ]);

        const entityAccess_namespace = results_4[0];
        //console.log('asyncLoading -> callback');
        callback({ entityAccess: entityAccess_namespace });
    };

    /** Execute Async call for background processing */
    asyncLoading();
    return {
        permissionSets,
        sobjects,
        apexClasses,
        apexPages,
        appDefinitions,
        profileFields,
        layouts,
        tabDefinitions,
        entityAccess,
        permissionGroups,
    };
};

export const getPermissionSet = async (
    conn: SalesforceConnection
): Promise<{
    permissionSets: PermissionSetMap;
    permissionSetProfileMapping: Record<string, string>;
}> => {
    //console.log('getPermissionSet');
    const permissionSets: PermissionSetMap = {};
    const permissionSetProfileMapping: Record<string, string> = {};

    const records_profiles =
        (
            await conn.query<{
                Id: string;
                ProfileId?: string;
                Profile?: { Name?: string };
                Label: string;
                Name: string;
                License?: { Name?: string };
                Type: string;
                Description?: string;
                IsCustom?: boolean;
                NamespacePrefix?: string;
            }>(
                'SELECT Id,ProfileId,Profile.Name,Label,Name,License.Name,Type,Description,IsCustom,NamespacePrefix FROM permissionset'
            )
        ).records || [];
    records_profiles.forEach(record => {
        permissionSets[record.Id] = new PermissionSet(record);
        if (isNotUndefinedOrNull(record.ProfileId)) {
            permissionSetProfileMapping[record.ProfileId] = record.Id;
        }
    });

    const keys = Object.values(permissionSets)
        .filter(x => x.type == 'Profile')
        .map(x => x.profileId)
        .join("','");
    const records_counter =
        (
            await conn.query<{
                total: number;
                ProfileId: string;
                IsActive: boolean;
            }>(
                "SELECT count(Id) total,ProfileId,IsActive FROM User WHERE profileId in ('" +
                    keys +
                    "') group by ProfileId ,IsActive"
            )
        ).records || [];
    records_counter.forEach(record => {
        if (record.IsActive) {
            permissionSets[permissionSetProfileMapping[record.ProfileId]].activeUserCount =
                record.total;
        } else {
            permissionSets[permissionSetProfileMapping[record.ProfileId]].inactiveUserCount =
                record.total;
        }
    });

    const records_counter2 =
        (
            await conn.query<{
                total: number;
                PermissionSetId: string;
                IsActive: boolean;
            }>(
                'SELECT count(Id) total,PermissionSetId,IsActive FROM PermissionSetAssignment group by PermissionSetId ,IsActive'
            )
        ).records || [];
    records_counter2.forEach(record => {
        if (permissionSets.hasOwnProperty(record.PermissionSetId)) {
            if (record.IsActive) {
                permissionSets[record.PermissionSetId].activeUserCount = record.total;
            } else {
                permissionSets[record.PermissionSetId].inactiveUserCount = record.total;
            }
        } else {
            console.warn('Missing permission set : ', record.PermissionSetId);
        }
    });
    return { permissionSets, permissionSetProfileMapping };
};

async function getApexClass(conn: SalesforceConnection): Promise<ApexClassMap> {
    //console.log('getApexClass');
    const apexClasses: ApexClassMap = {};
    const query = conn.query<{ Id: string; Name: string; NamespacePrefix?: string }>(
        'SELECT Id,Name,NamespacePrefix FROM ApexClass'
    );
    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 100000 })) || [];
    records.forEach(record => {
        apexClasses[record.Id] = new ApexClass(record);
    });
    //console.log('ApexClass records - ',records.length);
    return apexClasses;
}

async function getPermissionGroups(conn: SalesforceConnection): Promise<PermissionGroupsMap> {
    //console.log('getPermissionGroups');
    const permissionGroups: PermissionGroupsMap = {};
    const query = conn.query<{
        Id: string;
        DeveloperName: string;
        MasterLabel: string;
        Description?: string;
        NamespacePrefix?: string;
        Status?: string;
    }>(
        'SELECT Description, DeveloperName,  Id, MasterLabel, NamespacePrefix, Status FROM PermissionSetGroup'
    );
    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 100000 })) || [];
    records.forEach(record => {
        permissionGroups[record.Id] = new PermissionGroups(record);
    });

    const query_2 = conn.query<{
        Id: string;
        PermissionSetGroupId: string;
        PermissionSetId: string;
    }>('SELECT Id, PermissionSetGroupId, PermissionSetId FROM PermissionSetGroupComponent');
    const records2 =
        (await query_2.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 100000 })) || [];
    records2.forEach(record => {
        permissionGroups[record.PermissionSetGroupId].members.push(record.PermissionSetId);
    });
    return permissionGroups;
}

async function getApexPage(conn: SalesforceConnection): Promise<ApexPageMap> {
    //console.log('getApexPage');
    const apexPages: ApexPageMap = {};
    const query = conn.query<{
        Id: string;
        Name: string;
        MasterLabel: string;
        NamespacePrefix?: string;
    }>('SELECT Id,Name,MasterLabel FROM ApexPage');
    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 100000 })) || [];
    records.forEach(record => {
        apexPages[record.Id] = new ApexPage(record);
    });

    return apexPages;
}

async function getAppDefinition(conn: SalesforceConnection): Promise<AppDefinitionMap> {
    //console.log('getAppDefinition');
    const appDefinitions: AppDefinitionMap = {};

    type AppDefRecord = {
        Id: string;
        DeveloperName: string;
        Label: string;
        NamespacePrefix?: string;
        Name?: string;
    };

    const records =
        (await conn.tooling.query<AppDefRecord>(
            'select Id, DeveloperName,Label,NamespacePrefix FROM CustomApplication'
        ).records) || [];
    records.forEach(record => {
        record.Name = record.NamespacePrefix + '__' + record.DeveloperName;
        appDefinitions[record.Id] = new AppDefinition(record as Required<AppDefRecord>);
    });

    return appDefinitions;
}

async function getLayouts(conn: SalesforceConnection): Promise<LayoutMap> {
    //console.log('getLayouts');
    const layouts: LayoutMap = {};
    type LayoutRecord = {
        Id: string;
        Name: string;
        EntityDefinition: {
            QualifiedApiName: string;
            Label: string;
            IsCustomizable?: boolean;
            IsCompactLayoutable?: boolean;
        };
    };
    const query = conn.tooling.query<LayoutRecord>(
        'SELECT Id, Name, EntityDefinition.QualifiedApiName, EntityDefinition.Label,EntityDefinition.IsCustomizable,EntityDefinition.IsCompactLayoutable from Layout'
    );
    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 200000 })) || [];
    records
        .filter(x => x.EntityDefinition?.IsCompactLayoutable && x.EntityDefinition?.IsCustomizable)
        .forEach(record => {
            layouts[record.Id] = new Layout(
                record.Id,
                record.Name,
                record.EntityDefinition.QualifiedApiName,
                record.EntityDefinition.Label
            );
        });

    return layouts;
}

const getEntityDefinition = async (conn: SalesforceConnection): Promise<SobjectMap> => {
    //console.log('getEntityDefinition');
    const sobjects: SobjectMap = {};
    const query = conn.query<{ QualifiedApiName: string; Label: string }>(
        'select QualifiedApiName,Label from EntityDefinition where IsCustomizable=true and IsCompactLayoutable=true'
    );
    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 200000 })) || [];
    records.forEach(record => {
        sobjects[record.QualifiedApiName] = new Sobject(record.QualifiedApiName, record.Label);
    });
    return sobjects;
};

const getTabDefinitions = async (conn: SalesforceConnection): Promise<TabDefinitionMap> => {
    //console.log('getTabDefinitions');
    const tabDefinitions: TabDefinitionMap = {};
    const records =
        (await conn.tooling.query<{ Name: string; Label: string }>(
            'select Name, Label from TabDefinition'
        ).records) || [];
    records.forEach(record => {
        tabDefinitions[record.Name] = new TabDefinition(record);
    });
    return tabDefinitions;
};

const setRecordTypes = async (conn: SalesforceConnection, sobjects: SobjectMap): Promise<void> => {
    //console.log('setRecordTypes');
    const records =
        (
            await conn.query<{
                Id: string;
                DeveloperName: string;
                Name: string;
                SobjectType: string;
            }>('select Id, DeveloperName, Name, SobjectType from RecordType')
        ).records || [];
    records
        .filter(record => sobjects[record.SobjectType])
        .forEach(
            record =>
                (sobjects[record.SobjectType].recordTypes[record.Id] = new RecordType(
                    record.Id,
                    record.DeveloperName,
                    record.Name
                ))
        );
};

const setLayoutAssignments = async (
    conn: SalesforceConnection,
    permissionSets: PermissionSetMap,
    {
        permissionSetProfileMapping,
        layouts,
    }: { permissionSetProfileMapping: Record<string, string>; layouts: LayoutMap }
): Promise<void> => {
    //console.log('setLayoutAssignments');
    const query = conn.tooling.query<{
        Profile: { Id: string };
        LayoutId: string;
        RecordTypeId?: string;
    }>('select Profile.Id, LayoutId, RecordTypeId from ProfileLayout where Profile.Id != null');
    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 200000 })) || [];
    records.forEach(record => {
        if (layouts[record.LayoutId]) {
            //let layoutAssignmentKey = layouts[record.LayoutId].objectName+(record.RecordTypeId?`-${record.RecordTypeId}`:'');
            permissionSets[permissionSetProfileMapping[record.Profile.Id]].layoutAssigns.push(
                new LayoutAssignment(
                    record.LayoutId,
                    layouts[record.LayoutId].objectName,
                    record.RecordTypeId
                )
            );
        }
    });
};

const setUserPermissions = async (
    conn: SalesforceConnection,
    permissionSets: PermissionSetMap
): Promise<ProfileFieldsMap> => {
    //console.log('setUserPermissions');
    const profileFields: ProfileFieldsMap = {};

    const permissionDescribe = await conn.sobject('PermissionSet').describe();
    permissionDescribe.fields.forEach(x => {
        if (x.name.startsWith('Permissions')) {
            const { name, label } = x;
            profileFields[x.name] = { name, label };
        }
    });
    //console.log('permissionDescribe',permissionDescribe);
    const profileFieldsToArray = Object.values(profileFields);
    /* Might need to split this to improve the performances (Profiles & PermissionSets) **/
    const query = conn.query<{ Id: string } & Record<string, unknown>>(
        `SELECT FIELDS(STANDARD) FROM PermissionSet`
    );
    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 200000 })) || [];
    records.forEach(record => {
        if (permissionSets[record.Id]) {
            const userPermissions = profileFieldsToArray.map(
                item => new UserPermission(item.name, item.label, Boolean(record[item.name]))
            );
            permissionSets[record.Id].userPermissions = userPermissions;
        }
    });
    return profileFields;
};

const setObjectPermissions = async (
    conn: SalesforceConnection,
    permissionSets: PermissionSetMap
): Promise<void> => {
    //console.log('setObjectPermissions');

    const query = conn.query<{
        ParentId: string;
        SobjectType: string;
        PermissionsCreate: boolean;
        PermissionsRead: boolean;
        PermissionsEdit: boolean;
        PermissionsDelete: boolean;
        PermissionsViewAllRecords: boolean;
        PermissionsModifyAllRecords: boolean;
    }>(
        `select ParentId,SobjectType,PermissionsCreate,PermissionsRead,PermissionsEdit,PermissionsDelete,PermissionsViewAllRecords,PermissionsModifyAllRecords from ObjectPermissions`
    );

    const records =
        (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 200000 })) || [];
    records.forEach(record => {
        if (permissionSets.hasOwnProperty(record.ParentId)) {
            permissionSets[record.ParentId].objectPermissions.push(
                new ObjectPermission(
                    record.SobjectType,
                    record.PermissionsCreate,
                    record.PermissionsRead,
                    record.PermissionsEdit,
                    record.PermissionsDelete,
                    record.PermissionsViewAllRecords,
                    record.PermissionsModifyAllRecords
                )
            );
        }
    });
};

const setPermissionSetTabSetting = async (
    conn: SalesforceConnection,
    permissionSets: PermissionSetMap,
    { tabDefinitions }: { tabDefinitions: TabDefinitionMap }
): Promise<void> => {
    //console.log('setPermissionSetTabSetting');
    type TabSettingRecord = { ParentId: string; Name: string; Visibility: string };
    const fetchPermissionSetTabSetting = async (ids: string[]) => {
        const query = conn.query<TabSettingRecord>(
            `select ParentId, Name, Visibility from PermissionSetTabSetting where ParentId in ('${ids.join(
                "','"
            )}')`
        );
        return (
            (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 200000 })) ||
            []
        );
    };

    const chunk_parentIds = chunkArray(
        Object.values(permissionSets).map(x => x.id),
        5
    );

    const result = await chunkPromises(chunk_parentIds, 4, fetchPermissionSetTabSetting);
    const records = result.flat();
    records.forEach(record => {
        permissionSets[record.ParentId].tabAccesses.push({
            visibility: record.Visibility,
            ...tabDefinitions[record.Name],
        });
    });
};

const getSetupEntityAccess = async (
    conn: SalesforceConnection,
    permissionSets: PermissionSetMap | null,
    includeNamespacePrefix: boolean = false,
    {
        apexClasses,
        apexPages,
        appDefinitions,
    }: { apexClasses: ApexClassMap; apexPages: ApexPageMap; appDefinitions: AppDefinitionMap }
): Promise<EntityAccessMap> => {
    //console.log('getSetupEntityAccess');
    const CHUNK_SIZE = 50;
    type SetupEntityRecord = {
        ParentId: string;
        SetupEntityType: string;
        SetupEntityId: string;
    };
    const fetchEntityAccess = async (ids: string[]) => {
        const query = conn.query<SetupEntityRecord>(
            `SELECT ParentId, SetupEntityType, SetupEntityId FROM SetupEntityAccess WHERE SetupEntityId in ('${ids.join(
                "','"
            )}')`
        );
        return (
            (await query.run({ responseTarget: 'Records', autoFetch: true, maxFetch: 200000 })) ||
            []
        );
    };

    const filter_method = (x: { namespacePrefix?: string }) =>
        (isUndefinedOrNull(x.namespacePrefix) && !includeNamespacePrefix) || includeNamespacePrefix;

    const entityAccess: EntityAccessMap = {};

    const chunk_apexClasses = chunkArray(
        Object.values(apexClasses)
            .filter(filter_method)
            .map(x => x.id),
        CHUNK_SIZE
    );
    const chunk_apexPages = chunkArray(
        Object.values(apexPages)
            .filter(filter_method)
            .map(x => x.id),
        CHUNK_SIZE
    );
    const chunk_appDefinitions = chunkArray(
        Object.values(appDefinitions)
            .filter(filter_method)
            .map(x => x.id),
        CHUNK_SIZE
    );

    const results = await Promise.all([
        chunkPromises(chunk_apexClasses, 4, fetchEntityAccess),
        chunkPromises(chunk_apexPages, 4, fetchEntityAccess),
        chunkPromises(chunk_appDefinitions, 4, fetchEntityAccess),
    ]);
    const records = results.flat().flat();
    records.forEach(record => {
        if (!entityAccess.hasOwnProperty(record.ParentId)) {
            entityAccess[record.ParentId] = {
                classAccesses: [],
                pageAccesses: [],
                appAccesses: [],
            };
        }
        switch (record.SetupEntityType) {
            case 'ApexClass':
                entityAccess[record.ParentId].classAccesses.push(apexClasses[record.SetupEntityId]);
                break;

            case 'ApexPage':
                entityAccess[record.ParentId].pageAccesses.push(apexPages[record.SetupEntityId]);
                break;

            case 'TabSet': // name is TabSet for App Access
                entityAccess[record.ParentId].appAccesses.push(
                    appDefinitions[record.SetupEntityId]
                );
                break;
        }
    });

    return entityAccess;
};

export const setFieldDefinition = async (
    conn: SalesforceConnection,
    targetObject: Sobject
): Promise<void> => {
    //console.log('setFieldDefinition')
    type FieldDefinitionRecord = {
        EntityDefinitionId: string;
        MasterLabel: string;
        IsNillable: boolean;
        QualifiedApiName: string;
        DataType: string;
    };
    const records_fieldDefinition =
        (
            await conn.tooling.query<FieldDefinitionRecord>(
                `select EntityDefinitionId,MasterLabel,IsNillable, QualifiedApiName, DataType from FieldDefinition where EntityDefinition.QualifiedApiName ='${targetObject.name}'`
            )
        ).records || [];

    targetObject.fields = {};

    records_fieldDefinition.forEach(record => {
        targetObject.fields[record.QualifiedApiName] = new Field(
            record.QualifiedApiName,
            record.MasterLabel,
            record.DataType,
            record.IsNillable
        );
    });
};

export const setFieldPermission = async (
    conn: SalesforceConnection,
    permissionSets: PermissionSetMap,
    { targetObject }: { targetObject: Sobject }
): Promise<void> => {
    // Set field Definition
    await setFieldDefinition(conn, targetObject);

    type FieldPermissionRecord = {
        ParentId: string;
        Field: string;
        SobjectType: string;
        PermissionsEdit: boolean;
        PermissionsRead: boolean;
    };
    const records_fieldPermissions =
        (
            await conn.query<FieldPermissionRecord>(
                `select ParentId, Field, SobjectType, PermissionsEdit, PermissionsRead from FieldPermissions where SobjectType ='${targetObject.name}'`
            )
        ).records || [];
    records_fieldPermissions.forEach(record => {
        const fieldName = record.Field.replace(targetObject.name + '.', '');
        // profiles[profilesForPermissionSet[record.ParentId]].fieldPermissions[targetObject.name].push(new FieldPermission(record.SobjectType, fieldName, record.PermissionsRead, record.PermissionsEdit));
        permissionSets[record.ParentId].fieldPermissions[fieldName] = new FieldPermission(
            record.SobjectType,
            fieldName,
            record.PermissionsRead,
            record.PermissionsEdit
        );
    });
};

/**
 * Worker bundles of this file historically inlined local copies of these
 * helpers; the worker bundler can't resolve `shared/*` aliases. Keep tiny
 * local wrappers so the shape stays the same.
 */

function isUndefinedOrNull(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

function isNotUndefinedOrNull<T>(value: T): value is NonNullable<T> {
    return value !== null && value !== undefined;
}

function chunkPromises<T, R>(
    arr: T[],
    size: number,
    method: (item: T) => Promise<R>
): Promise<R[]> {
    if (!Array.isArray(arr) || !arr.length) {
        return Promise.resolve([]);
    }
    const resolvedSize = size || 10;

    const chunks: T[][] = [];
    for (let i = 0, j = arr.length; i < j; i += resolvedSize) {
        chunks.push(arr.slice(i, i + resolvedSize));
    }

    let collector: Promise<R[]> = Promise.resolve([]);
    for (const chunk of chunks) {
        collector = collector.then(results =>
            Promise.all(chunk.map(params => method(params))).then(subResults =>
                results.concat(subResults)
            )
        );
    }
    return collector;
}

export function chunkArray<T>(arr: T[], chunkSize = 5): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        chunks.push(chunk);
    }
    return chunks;
}
