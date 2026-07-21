import ToolkitElement from 'host-api/element';
import Toast from 'lightning/toast';
import { api, track } from 'lwc';
import { store as legacyStore, store_application } from 'shared/store';
import { isEmpty } from 'shared/utils';
import { ensureSessionClientCallOption } from '../sessionCallOptions';
import {
    GROUPS,
    CATEGORIES,
    STATUS_BADGE_CLASS,
    buildSetupUrl,
    buildFlowUrl,
    formatDateString,
    safeString,
    safeBool,
} from './constants';
import type { BlueprintItem, BlueprintCategory, BlueprintGroup } from './constants';

type AnyRecord = Record<string, any>;

export default class Blueprint extends ToolkitElement {
    _objectName: string | null = null;
    @track _categories: Map<string, BlueprintCategory> = new Map();
    @track searchTerm = '';
    @track activeOnly = false;
    @track openGroups: Record<string, boolean> = {};
    @track openCategories: Record<string, boolean> = {};
    @track isLoading = false;
    _hasLoaded = false;

    @api
    get objectName(): string | null {
        return this._objectName;
    }

    set objectName(value: string | null) {
        const changed = this._objectName !== value;
        this._objectName = value;
        if (changed && !isEmpty(value)) {
            this._hasLoaded = false;
            this.loadBlueprint();
        }
    }

    /** Trigger a load when the parent first activates this tab */
    @api
    activate(): void {
        if (!this._hasLoaded && !isEmpty(this._objectName)) {
            this.loadBlueprint();
        }
    }

    /** Events */

    handleSearchChange = (e: any): void => {
        this.searchTerm = (e.detail?.value || '').trim();
    };

    handleToggleActiveOnly = (): void => {
        this.activeOnly = !this.activeOnly;
    };

    handleRefresh = (): void => {
        this._hasLoaded = false;
        this.loadBlueprint();
    };

    handleToggleGroup = (e: any): void => {
        const groupKey = e.currentTarget?.dataset?.group;
        if (!groupKey) return;
        this.openGroups = {
            ...this.openGroups,
            [groupKey]: !this.isGroupOpen(groupKey),
        };
    };

    isGroupOpen(groupKey: string): boolean {
        return this.openGroups[groupKey] !== false;
    }

    handleToggleCategory = (e: any): void => {
        const catKey = e.currentTarget?.dataset?.category;
        if (!catKey) return;
        this.openCategories = {
            ...this.openCategories,
            [catKey]: !this.isCategoryOpen(catKey),
        };
    };

    isCategoryOpen(catKey: string): boolean {
        return this.openCategories[catKey] === true;
    }

    goToUrl = (e: any): void => {
        const url = e.currentTarget?.dataset?.url;
        if (url) legacyStore.dispatch(store_application.navigate(url));
    };

    handleCopyValue = async (e: any): Promise<void> => {
        const value = e.currentTarget?.dataset?.value;
        if (isEmpty(value)) return;
        try {
            await navigator.clipboard.writeText(value);
            Toast.show({ label: 'Copied to clipboard', variant: 'success' });
        } catch {
            Toast.show({ label: 'Copy failed', variant: 'error' });
        }
    };

    /** Data Loading */

    loadBlueprint = async (): Promise<void> => {
        if (isEmpty(this._objectName)) return;
        this.isLoading = true;
        this._hasLoaded = true;

        const freshCategories = new Map<string, BlueprintCategory>();
        for (const cat of CATEGORIES) {
            freshCategories.set(cat.key, {
                key: cat.key,
                label: cat.label,
                icon: cat.icon,
                group: cat.group,
                items: [],
                error: '',
                isLoading: true,
            });
        }
        this._categories = freshCategories;

        try {
            await ensureSessionClientCallOption(this.connector);
            const conn = this.connector.conn;
            const obj = this._objectName;

            const fetchers: Array<{ key: string; fn: () => Promise<BlueprintItem[]> }> = [
                { key: 'validationRules', fn: () => this.fetchValidationRules(conn, obj) },
                { key: 'apexTriggers', fn: () => this.fetchApexTriggers(conn, obj) },
                {
                    key: 'recordTriggeredFlows',
                    fn: () => this.fetchRecordTriggeredFlows(conn, obj),
                },
                { key: 'approvalProcesses', fn: () => this.fetchApprovalProcesses(conn, obj) },
                { key: 'assignmentRules', fn: () => this.fetchAssignmentRules(conn, obj) },
                { key: 'salesPath', fn: () => this.fetchSalesPath(conn, obj) },
                { key: 'duplicateRules', fn: () => this.fetchDuplicateRules(conn, obj) },
                { key: 'matchingRules', fn: () => this.fetchMatchingRules(conn, obj) },
                { key: 'owdSharing', fn: () => this.fetchOwdSharing(conn, obj) },
                {
                    key: 'ownerSharingRules',
                    fn: () => this.fetchOwnerSharingRules(conn, obj),
                },
                {
                    key: 'criteriaSharingRules',
                    fn: () => this.fetchCriteriaSharingRules(conn, obj),
                },
                { key: 'queues', fn: () => this.fetchQueues(conn, obj) },
                { key: 'profilePermissions', fn: () => this.fetchProfilePermissions(conn, obj) },
                { key: 'permSetAccess', fn: () => this.fetchPermSetAccess(conn, obj) },
                { key: 'recordTypes', fn: () => this.fetchRecordTypes(conn, obj) },
                { key: 'pageLayouts', fn: () => this.fetchPageLayouts(conn, obj) },
                { key: 'compactLayouts', fn: () => this.fetchCompactLayouts(conn, obj) },
                { key: 'lightningPages', fn: () => this.fetchLightningPages(conn, obj) },
                { key: 'layoutAssignments', fn: () => this.fetchLayoutAssignments(conn, obj) },
                {
                    key: 'flexiPageAssignments',
                    fn: () => this.fetchFlexiPageAssignments(conn, obj),
                },
                { key: 'quickActions', fn: () => this.fetchQuickActions(conn, obj) },
                { key: 'listViews', fn: () => this.fetchListViews(conn, obj) },
                { key: 'customButtons', fn: () => this.fetchCustomButtons(conn, obj) },
                { key: 'formulaFields', fn: () => this.fetchFormulaFields(conn, obj) },
                { key: 'rollupSummaries', fn: () => this.fetchRollupSummaries(conn, obj) },
                { key: 'fieldSets', fn: () => this.fetchFieldSets(conn, obj) },
                { key: 'apexClasses', fn: () => this.fetchApexClasses(conn, obj) },
                { key: 'scheduledJobs', fn: () => this.fetchScheduledJobs(conn, obj) },
            ];

            const results = await Promise.allSettled(fetchers.map(f => f.fn()));

            const updated = new Map(this._categories);
            results.forEach((result, idx) => {
                const catKey = fetchers[idx].key;
                const cat = updated.get(catKey);
                if (!cat) return;
                if (result.status === 'fulfilled') {
                    cat.items = result.value;
                    cat.error = '';
                } else {
                    cat.items = [];
                    cat.error = result.reason?.message || 'Failed to load';
                }
                cat.isLoading = false;
            });
            this._categories = updated;
        } catch (e: any) {
            console.error('Blueprint load error:', e);
        }
        this.isLoading = false;
    };

    /** Tooling API Fetchers */

    private async toolingQuery(conn: any, soql: string): Promise<AnyRecord[]> {
        let res = await conn.tooling.query(soql);
        const records: AnyRecord[] = [...(res?.records || [])];
        while (res && !res.done && res.nextRecordsUrl) {
            res = await conn.tooling.queryMore(res.nextRecordsUrl);
            if (res?.records) records.push(...res.records);
        }
        return records;
    }

    private async standardQuery(conn: any, soql: string): Promise<AnyRecord[]> {
        let res = await conn.query(soql);
        const records: AnyRecord[] = [...(res?.records || [])];
        while (res && !res.done && res.nextRecordsUrl) {
            res = await conn.queryMore(res.nextRecordsUrl);
            if (res?.records) records.push(...res.records);
        }
        return records;
    }

    private escObj(name: string): string {
        return (name || '').replace(/'/g, "\\'");
    }

    fetchValidationRules = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, ValidationName, Active, Description, LastModifiedDate, LastModifiedBy.Name ` +
                `FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${this.escObj(obj)}' ORDER BY ValidationName`
        );

        const metaResults = await Promise.allSettled(
            records.map(r =>
                this.toolingQuery(
                    conn,
                    `SELECT Id, Metadata FROM ValidationRule WHERE Id = '${safeString(r.Id)}'`
                )
            )
        );

        return records.map((r, idx) => {
            let errorMsg = '';
            const metaResult = metaResults[idx];
            if (metaResult.status === 'fulfilled' && metaResult.value.length) {
                const meta = metaResult.value[0].Metadata as AnyRecord | null;
                errorMsg = safeString(meta?.errorMessage);
            }
            const adminDesc = safeString(r.Description);
            const descParts = [errorMsg, adminDesc].filter(Boolean);
            return {
                key: safeString(r.Id),
                name: safeString(r.ValidationName),
                apiName: safeString(r.ValidationName),
                status: safeBool(r.Active) ? 'Active' : 'Inactive',
                description: descParts.join(' -- '),
                additionalInfo: errorMsg ? 'Error Msg:' : '',
                setupUrl: buildSetupUrl('validationRules', safeString(r.Id), obj),
                lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
                lastModifiedBy: safeString(r.LastModifiedBy?.Name),
                category: 'validationRules',
            };
        });
    };

    fetchApexTriggers = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, Name, Status, UsageBeforeInsert, UsageBeforeUpdate, UsageBeforeDelete, ` +
                `UsageAfterInsert, UsageAfterUpdate, UsageAfterDelete, UsageAfterUndelete, ` +
                `LastModifiedDate, LastModifiedBy.Name ` +
                `FROM ApexTrigger WHERE TableEnumOrId = '${this.escObj(obj)}' ORDER BY Name`
        );
        return records.map(r => {
            const events: string[] = [];
            if (r.UsageBeforeInsert) events.push('before insert');
            if (r.UsageBeforeUpdate) events.push('before update');
            if (r.UsageBeforeDelete) events.push('before delete');
            if (r.UsageAfterInsert) events.push('after insert');
            if (r.UsageAfterUpdate) events.push('after update');
            if (r.UsageAfterDelete) events.push('after delete');
            if (r.UsageAfterUndelete) events.push('after undelete');
            return {
                key: safeString(r.Id),
                name: safeString(r.Name),
                apiName: safeString(r.Name),
                status: safeString(r.Status) || 'Active',
                description: '',
                additionalInfo: events.join(', '),
                setupUrl: buildSetupUrl('apexTriggers', safeString(r.Id), obj),
                lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
                lastModifiedBy: safeString(r.LastModifiedBy?.Name),
                category: 'apexTriggers',
            };
        });
    };

    fetchRecordTriggeredFlows = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, ApiName, Label, Description, ProcessType, TriggerType, IsActive, ` +
                `ActiveVersionId, LatestVersionId, LastModifiedDate, LastModifiedBy, RecordTriggerType ` +
                `FROM FlowDefinitionView ` +
                `WHERE TriggerObjectOrEventId = '${this.escObj(obj)}' ` +
                `AND ProcessType IN ('AutoLaunchedFlow','RecordTriggeredFlow') ` +
                `AND RecordTriggerType != null ORDER BY Label`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.Label),
            apiName: safeString(r.ApiName),
            status: safeBool(r.IsActive) ? 'Active' : 'Inactive',
            description: safeString(r.Description),
            additionalInfo: safeString(r.RecordTriggerType),
            setupUrl: buildFlowUrl(r.ActiveVersionId, r.LatestVersionId),
            lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
            lastModifiedBy: safeString(r.LastModifiedBy),
            category: 'recordTriggeredFlows',
        }));
    };

    fetchApprovalProcesses = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, Name, TableEnumOrId, State, Description, ` +
                `LastModifiedDate, LastModifiedBy.Name ` +
                `FROM ProcessDefinition WHERE TableEnumOrId = '${this.escObj(obj)}' ORDER BY Name`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.Name),
            apiName: safeString(r.Name),
            status: safeString(r.State) || 'Active',
            description: safeString(r.Description),
            additionalInfo: '',
            setupUrl: buildSetupUrl('approvalProcesses', safeString(r.Id), obj),
            lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
            lastModifiedBy: safeString(r.LastModifiedBy?.Name),
            category: 'approvalProcesses',
        }));
    };

    fetchAssignmentRules = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, Name, SobjectType, Active ` +
                `FROM AssignmentRule WHERE SobjectType = '${this.escObj(obj)}' ORDER BY Name`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.Name),
            apiName: safeString(r.Name),
            status: safeBool(r.Active) ? 'Active' : 'Inactive',
            description: '',
            additionalInfo: '',
            setupUrl: buildSetupUrl('assignmentRules', safeString(r.Id), obj),
            lastModifiedDate: '',
            lastModifiedBy: '',
            category: 'assignmentRules',
        }));
    };

    fetchSalesPath = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, MasterLabel, DeveloperName, SobjectType, IsActive, ` +
                `LastModifiedDate, LastModifiedBy.Name ` +
                `FROM PathAssistant WHERE SobjectType = '${this.escObj(obj)}' ORDER BY MasterLabel`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.MasterLabel),
            apiName: safeString(r.DeveloperName),
            status: safeBool(r.IsActive) ? 'Active' : 'Inactive',
            description: '',
            additionalInfo: '',
            setupUrl: buildSetupUrl('salesPath', safeString(r.Id), obj),
            lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
            lastModifiedBy: safeString(r.LastModifiedBy?.Name),
            category: 'salesPath',
        }));
    };

    fetchDuplicateRules = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, DeveloperName, MasterLabel, IsActive, SobjectType, ` +
                `LastModifiedDate, LastModifiedBy.Name ` +
                `FROM DuplicateRule WHERE SobjectType = '${this.escObj(obj)}' ORDER BY MasterLabel`
        );

        const metaResults = await Promise.allSettled(
            records.map(r => conn.tooling.sobject('DuplicateRule').retrieve(safeString(r.Id)))
        );

        return records.map((r, idx) => {
            let actionInfo = '';
            let desc = '';
            const metaResult = metaResults[idx];
            if (metaResult.status === 'fulfilled' && metaResult.value) {
                const meta = metaResult.value.Metadata as AnyRecord | null;
                const onInsert = safeString(meta?.actionOnInsert);
                const onUpdate = safeString(meta?.actionOnUpdate);
                if (onInsert || onUpdate) {
                    const parts: string[] = [];
                    if (onInsert) parts.push(`Create: ${onInsert}`);
                    if (onUpdate) parts.push(`Edit: ${onUpdate}`);
                    actionInfo = parts.join(' | ');
                }
                const adminDesc = safeString(meta?.description);
                const alertText = safeString(meta?.alertText);
                const descParts = [adminDesc, alertText ? `Alert: ${alertText}` : ''].filter(
                    Boolean
                );
                desc = descParts.join(' -- ');
            }
            return {
                key: safeString(r.Id),
                name: safeString(r.MasterLabel),
                apiName: safeString(r.DeveloperName),
                status: safeBool(r.IsActive) ? 'Active' : 'Inactive',
                description: desc,
                additionalInfo: actionInfo,
                setupUrl: buildSetupUrl('duplicateRules', safeString(r.Id), obj),
                lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
                lastModifiedBy: safeString(r.LastModifiedBy?.Name),
                category: 'duplicateRules',
            };
        });
    };

    fetchMatchingRules = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, DeveloperName, MasterLabel, RuleStatus, Description, ` +
                `SobjectType, LastModifiedDate, LastModifiedBy.Name ` +
                `FROM MatchingRule WHERE SobjectType = '${this.escObj(obj)}' ORDER BY MasterLabel`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.MasterLabel),
            apiName: safeString(r.DeveloperName),
            status: safeString(r.RuleStatus) || 'Active',
            description: safeString(r.Description),
            additionalInfo: '',
            setupUrl: buildSetupUrl('matchingRules', safeString(r.Id), obj),
            lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
            lastModifiedBy: safeString(r.LastModifiedBy?.Name),
            category: 'matchingRules',
        }));
    };

    /** Access & Sharing Fetchers */

    fetchProfilePermissions = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const profiles = await this.standardQuery(
            conn,
            `SELECT Id, Name FROM Profile ORDER BY Name`
        );
        const permRecords = await this.standardQuery(
            conn,
            `SELECT Parent.ProfileId, ` +
                `PermissionsRead, PermissionsCreate, PermissionsEdit, ` +
                `PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords ` +
                `FROM ObjectPermissions WHERE SobjectType = '${this.escObj(obj)}' ` +
                `AND Parent.IsOwnedByProfile = true`
        );
        const permMap = new Map<string, AnyRecord>();
        for (const r of permRecords) {
            const pid = safeString(r.Parent?.ProfileId);
            if (pid) permMap.set(pid, r);
        }

        return profiles.map(p => {
            const profileId = safeString(p.Id);
            const profileName = safeString(p.Name);
            const perm = permMap.get(profileId);
            const hasAccess = perm && safeBool(perm.PermissionsRead);
            return {
                key: `prof-perm-${profileId}`,
                name: profileName,
                apiName: profileName,
                status: hasAccess ? 'Active' : 'No Access',
                description: '',
                additionalInfo: hasAccess ? this.formatCrudString(perm) : '',
                setupUrl: buildSetupUrl('profilePermissions', profileId, obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'profilePermissions',
            };
        });
    };

    fetchPermSetAccess = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT ParentId, Parent.Label, PermissionsRead, PermissionsCreate, PermissionsEdit, ` +
                `PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords ` +
                `FROM ObjectPermissions WHERE SobjectType = '${this.escObj(obj)}' ` +
                `AND Parent.IsOwnedByProfile = false ORDER BY Parent.Label`
        );
        return records.map(r => {
            const label = safeString(r.Parent?.Label);
            const parentId = safeString(r.ParentId);
            return {
                key: `ps-perm-${parentId}`,
                name: label,
                apiName: label,
                status: 'Active',
                description: '',
                additionalInfo: this.formatCrudString(r),
                setupUrl: buildSetupUrl('permSetAccess', parentId, obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'permSetAccess',
            };
        });
    };

    private formatCrudString(r: AnyRecord): string {
        const parts: string[] = [];
        if (safeBool(r.PermissionsRead)) parts.push('R');
        if (safeBool(r.PermissionsCreate)) parts.push('C');
        if (safeBool(r.PermissionsEdit)) parts.push('E');
        if (safeBool(r.PermissionsDelete)) parts.push('D');
        if (safeBool(r.PermissionsViewAllRecords)) parts.push('ViewAll');
        if (safeBool(r.PermissionsModifyAllRecords)) parts.push('ModAll');
        return parts.join(' ');
    }

    fetchOwdSharing = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT InternalSharingModel, ExternalSharingModel ` +
                `FROM EntityDefinition WHERE QualifiedApiName = '${this.escObj(obj)}' LIMIT 1`
        );
        if (records.length === 0) return [];
        const r = records[0];
        return [
            {
                key: `owd-${obj}`,
                name: obj,
                apiName: obj,
                status: 'Active',
                description: `Internal: ${safeString(r.InternalSharingModel)} | External: ${safeString(r.ExternalSharingModel)}`,
                additionalInfo: '',
                setupUrl: buildSetupUrl('owdSharing', '', obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'owdSharing',
            },
        ];
    };

    private async readSharingRulesMetadata(conn: any, obj: string): Promise<AnyRecord | null> {
        try {
            const result = await conn.metadata.read('SharingRules', obj);
            return (result as AnyRecord) || null;
        } catch {
            return null;
        }
    }

    private sharedToValues(val: unknown): string[] {
        if (!val) return [];
        if (typeof val === 'string') return val ? [val] : [];
        if (Array.isArray(val)) return val.map(v => String(v)).filter(Boolean);
        return [String(val)].filter(Boolean);
    }

    private formatSharedTo(sharedTo: AnyRecord | null | undefined): string {
        if (!sharedTo) return '';
        const parts: string[] = [];
        const roles = this.sharedToValues(sharedTo.role);
        const roleSubs = this.sharedToValues(sharedTo.roleAndSubordinates);
        const roleSubsInt = this.sharedToValues(sharedTo.roleAndSubordinatesInternal);
        const groups = this.sharedToValues(sharedTo.group);
        if (roles.length) parts.push(`Role: ${roles.join(', ')}`);
        if (roleSubs.length) parts.push(`Role & Subs: ${roleSubs.join(', ')}`);
        if (roleSubsInt.length) parts.push(`Role & Subs (Int): ${roleSubsInt.join(', ')}`);
        if (groups.length) parts.push(`Group: ${groups.join(', ')}`);
        const territory = this.sharedToValues(sharedTo.territory);
        const terrSubs = this.sharedToValues(sharedTo.territoryAndSubordinates);
        if (territory.length) parts.push(`Territory: ${territory.join(', ')}`);
        if (terrSubs.length) parts.push(`Territory & Subs: ${terrSubs.join(', ')}`);
        if (sharedTo.allInternalUsers) parts.push('All Internal Users');
        if (sharedTo.allPartnerUsers) parts.push('All Partner Users');
        return parts.join('\n') || '';
    }

    fetchOwnerSharingRules = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const meta = await this.readSharingRulesMetadata(conn, obj);
        if (!meta) return [];
        const rules: any[] = Array.isArray(meta.sharingOwnerRules)
            ? meta.sharingOwnerRules
            : meta.sharingOwnerRules
              ? [meta.sharingOwnerRules]
              : [];
        return rules.map(r => {
            const accessLevel = safeString(r.accessLevel);
            const sharedTo = this.formatSharedTo(r.sharedTo as AnyRecord | null);
            return {
                key: `owner-share-${safeString(r.fullName)}`,
                name: safeString(r.label) || safeString(r.fullName),
                apiName: safeString(r.fullName),
                status: 'Active',
                description: sharedTo,
                additionalInfo: accessLevel ? `Access: ${accessLevel}` : '',
                setupUrl: buildSetupUrl('ownerSharingRules', '', obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'ownerSharingRules',
            };
        });
    };

    fetchCriteriaSharingRules = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const meta = await this.readSharingRulesMetadata(conn, obj);
        if (!meta) return [];
        const rules: any[] = Array.isArray(meta.sharingCriteriaRules)
            ? meta.sharingCriteriaRules
            : meta.sharingCriteriaRules
              ? [meta.sharingCriteriaRules]
              : [];
        return rules.map(r => {
            const accessLevel = safeString(r.accessLevel);
            const sharedTo = this.formatSharedTo(r.sharedTo as AnyRecord | null);
            return {
                key: `criteria-share-${safeString(r.fullName)}`,
                name: safeString(r.label) || safeString(r.fullName),
                apiName: safeString(r.fullName),
                status: 'Active',
                description: sharedTo,
                additionalInfo: accessLevel ? `Access: ${accessLevel}` : '',
                setupUrl: buildSetupUrl('criteriaSharingRules', '', obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'criteriaSharingRules',
            };
        });
    };

    fetchQueues = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const queueRecords = await this.standardQuery(
            conn,
            `SELECT QueueId, Queue.Name, Queue.DeveloperName ` +
                `FROM QueueSobject WHERE SobjectType = '${this.escObj(obj)}' ORDER BY Queue.Name`
        );
        if (queueRecords.length === 0) return [];

        const queueIds = queueRecords.map(r => safeString(r.QueueId));
        const queueIdList = queueIds.map(id => `'${id}'`).join(',');

        let members: AnyRecord[] = [];
        try {
            members = await this.standardQuery(
                conn,
                `SELECT GroupId, UserOrGroupId FROM GroupMember WHERE GroupId IN (${queueIdList})`
            );
        } catch {
            // GroupMember may not be queryable in all orgs
        }

        const membersByQueue = new Map<string, string[]>();
        for (const m of members) {
            const gid = safeString(m.GroupId);
            const uid = safeString(m.UserOrGroupId);
            if (!gid || !uid) continue;
            if (!membersByQueue.has(gid)) membersByQueue.set(gid, []);
            membersByQueue.get(gid)!.push(uid);
        }

        const allMemberIds = Array.from(
            new Set(members.map(m => safeString(m.UserOrGroupId)).filter(Boolean))
        );
        const userIds = allMemberIds.filter(id => id.startsWith('005'));
        const groupIds = allMemberIds.filter(id => !id.startsWith('005'));

        const userMap = new Map<string, string>();
        const groupMap = new Map<string, { name: string; type: string }>();

        if (userIds.length > 0) {
            try {
                const userIdList = userIds.map(id => `'${id}'`).join(',');
                const users = await this.standardQuery(
                    conn,
                    `SELECT Id, Name FROM User WHERE Id IN (${userIdList})`
                );
                for (const u of users) userMap.set(safeString(u.Id), safeString(u.Name));
            } catch {
                // fallback: leave names unresolved
            }
        }

        const roleTypes = new Set(['Role', 'RoleAndSubordinates', 'RoleAndSubordinatesInternal']);

        if (groupIds.length > 0) {
            try {
                const groupIdList = groupIds.map(id => `'${id}'`).join(',');
                const groups = await this.standardQuery(
                    conn,
                    `SELECT Id, Name, Type, RelatedId FROM Group WHERE Id IN (${groupIdList})`
                );

                const roleRelatedIds = new Map<string, string[]>();
                for (const g of groups) {
                    const gType = safeString(g.Type);
                    const relId = safeString(g.RelatedId);
                    if (roleTypes.has(gType) && relId) {
                        if (!roleRelatedIds.has(relId)) roleRelatedIds.set(relId, []);
                        roleRelatedIds.get(relId)!.push(safeString(g.Id));
                    }
                    groupMap.set(safeString(g.Id), {
                        name: safeString(g.Name),
                        type: gType,
                    });
                }

                const relIds = Array.from(roleRelatedIds.keys());
                if (relIds.length > 0) {
                    try {
                        const relIdList = relIds.map(id => `'${id}'`).join(',');
                        const roles = await this.standardQuery(
                            conn,
                            `SELECT Id, Name FROM UserRole WHERE Id IN (${relIdList})`
                        );
                        for (const role of roles) {
                            const roleName = safeString(role.Name);
                            const gids = roleRelatedIds.get(safeString(role.Id)) || [];
                            for (const gid of gids) {
                                const entry = groupMap.get(gid);
                                if (entry) entry.name = roleName;
                            }
                        }
                    } catch {
                        // fallback: role names stay unresolved
                    }
                }
            } catch {
                // fallback: leave names unresolved
            }
        }

        const typeLabels: Record<string, string> = {
            Role: 'Roles',
            RoleAndSubordinates: 'Roles & Subs',
            RoleAndSubordinatesInternal: 'Roles & Subs',
            Regular: 'Public Groups',
        };

        return queueRecords.map(r => {
            const queueId = safeString(r.QueueId);
            const memberIds = membersByQueue.get(queueId) || [];

            const buckets: Record<string, string[]> = {};
            for (const mid of memberIds) {
                if (userMap.has(mid)) {
                    if (!buckets['Users']) buckets['Users'] = [];
                    buckets['Users'].push(userMap.get(mid)!);
                } else if (groupMap.has(mid)) {
                    const info = groupMap.get(mid)!;
                    const label = typeLabels[info.type] || info.type || 'Groups';
                    if (!buckets[label]) buckets[label] = [];
                    buckets[label].push(info.name);
                } else {
                    if (!buckets['Members']) buckets['Members'] = [];
                    buckets['Members'].push(mid);
                }
            }

            const descParts: string[] = [];
            const countParts: string[] = [];
            for (const [label, names] of Object.entries(buckets)) {
                descParts.push(`${label}: ${names.join(', ')}`);
                countParts.push(`${names.length} ${label.toLowerCase()}`);
            }

            return {
                key: queueId,
                name: safeString(r.Queue?.Name),
                apiName: safeString(r.Queue?.DeveloperName),
                status: 'Active',
                description: descParts.join('\n'),
                additionalInfo: countParts.join(', ') || 'No members',
                setupUrl: buildSetupUrl('queues', queueId, obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'queues',
            };
        });
    };

    /** UI & Layout Fetchers */

    fetchRecordTypes = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, Name, DeveloperName, IsActive, Description, ` +
                `LastModifiedDate, LastModifiedBy.Name ` +
                `FROM RecordType WHERE SobjectType = '${this.escObj(obj)}' ORDER BY Name`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.Name),
            apiName: safeString(r.DeveloperName),
            status: safeBool(r.IsActive) ? 'Active' : 'Inactive',
            description: safeString(r.Description),
            additionalInfo: '',
            setupUrl: buildSetupUrl('recordTypes', safeString(r.Id), obj),
            lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
            lastModifiedBy: safeString(r.LastModifiedBy?.Name),
            category: 'recordTypes',
        }));
    };

    fetchPageLayouts = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, Name FROM Layout ` +
                `WHERE TableEnumOrId = '${this.escObj(obj)}' ORDER BY Name`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.Name),
            apiName: safeString(r.Name),
            status: 'Active',
            description: '',
            additionalInfo: '',
            setupUrl: buildSetupUrl('pageLayouts', safeString(r.Id), obj),
            lastModifiedDate: '',
            lastModifiedBy: '',
            category: 'pageLayouts',
        }));
    };

    fetchCompactLayouts = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, DeveloperName, MasterLabel ` +
                `FROM CompactLayout WHERE SobjectType = '${this.escObj(obj)}' ORDER BY MasterLabel`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.MasterLabel),
            apiName: safeString(r.DeveloperName),
            status: 'Active',
            description: '',
            additionalInfo: '',
            setupUrl: buildSetupUrl('compactLayouts', safeString(r.Id), obj),
            lastModifiedDate: '',
            lastModifiedBy: '',
            category: 'compactLayouts',
        }));
    };

    fetchLightningPages = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, DeveloperName, MasterLabel, Description ` +
                `FROM FlexiPage WHERE EntityDefinitionId = '${this.escObj(obj)}' ORDER BY MasterLabel`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.MasterLabel),
            apiName: safeString(r.DeveloperName),
            status: 'Active',
            description: safeString(r.Description),
            additionalInfo: '',
            setupUrl: buildSetupUrl('lightningPages', safeString(r.Id), obj),
            lastModifiedDate: '',
            lastModifiedBy: '',
            category: 'lightningPages',
        }));
    };

    fetchLayoutAssignments = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Layout.Name, Profile.Name, RecordType.Name ` +
                `FROM ProfileLayout WHERE TableEnumOrId = '${this.escObj(obj)}' ` +
                `ORDER BY Layout.Name, Profile.Name`
        );

        const grouped = new Map<string, Map<string, string[]>>();
        for (const r of records) {
            const layoutName = safeString(r.Layout?.Name) || '(Unknown)';
            const profileName = safeString(r.Profile?.Name) || '(Default)';
            const recordTypeName = safeString(r.RecordType?.Name) || 'Master';
            if (!grouped.has(layoutName)) grouped.set(layoutName, new Map());
            const rtMap = grouped.get(layoutName)!;
            if (!rtMap.has(recordTypeName)) rtMap.set(recordTypeName, []);
            rtMap.get(recordTypeName)!.push(profileName);
        }

        return Array.from(grouped.entries()).map(([layoutName, rtMap]) => {
            const lines: string[] = [];
            let totalProfiles = 0;
            rtMap.forEach((profiles, rt) => {
                totalProfiles += profiles.length;
                lines.push(`${rt}: ${profiles.join(', ')}`);
            });
            const rtCount = rtMap.size;
            return {
                key: `layout-assign-${layoutName}`,
                name: layoutName,
                apiName: layoutName,
                status: 'Active',
                description: lines.join('\n'),
                additionalInfo: `${totalProfiles} profiles, ${rtCount} record type${rtCount > 1 ? 's' : ''}`,
                setupUrl: buildSetupUrl('layoutAssignments', '', obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'layoutAssignments',
            };
        });
    };

    fetchFlexiPageAssignments = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const pages = await this.toolingQuery(
            conn,
            `SELECT Id, DeveloperName, MasterLabel FROM FlexiPage ` +
                `WHERE EntityDefinitionId = '${this.escObj(obj)}' ORDER BY MasterLabel`
        );
        const pageIdMap = new Map<string, string>();
        for (const p of pages) {
            pageIdMap.set(safeString(p.DeveloperName), safeString(p.Id));
        }

        const apps = await this.toolingQuery(
            conn,
            `SELECT Id, DeveloperName, Label FROM CustomApplication`
        );

        interface FlexiOverride {
            app: string;
            profile: string;
            device: string;
            rt: string;
        }
        const pageOverrides = new Map<string, FlexiOverride[]>();

        const appResults = await Promise.allSettled(
            apps.map(a =>
                this.toolingQuery(
                    conn,
                    `SELECT Id, DeveloperName, Label, Metadata ` +
                        `FROM CustomApplication WHERE Id = '${safeString(a.Id)}'`
                )
            )
        );
        for (let i = 0; i < apps.length; i++) {
            const result = appResults[i];
            if (result.status !== 'fulfilled' || !result.value.length) continue;
            const appRecord = result.value[0];
            const appLabel = safeString(appRecord.Label);
            const meta = appRecord.Metadata as AnyRecord | null;
            const overrides: any[] = meta?.profileActionOverrides || [];
            for (const ov of overrides) {
                if (safeString(ov.pageOrSobjectType) !== obj) continue;
                const pageName = safeString(ov.content);
                const formFactor = safeString(ov.formFactor);
                const recordType = safeString(ov.recordType);
                if (!pageOverrides.has(pageName)) pageOverrides.set(pageName, []);
                pageOverrides.get(pageName)!.push({
                    app: appLabel,
                    profile: safeString(ov.profile) || 'Org Default',
                    device: formFactor === 'Small' ? 'Mobile' : 'Desktop',
                    rt: recordType ? recordType.split('.').pop() || recordType : 'Master',
                });
            }
        }

        if (pageOverrides.size > 0) {
            return Array.from(pageOverrides.entries()).map(([pageName, ovs]) => {
                const appGroups = new Map<string, Map<string, string[]>>();
                const rtSet = new Set<string>();
                for (const ov of ovs) {
                    rtSet.add(ov.rt);
                    if (!appGroups.has(ov.app)) appGroups.set(ov.app, new Map());
                    const profileMap = appGroups.get(ov.app)!;
                    if (!profileMap.has(ov.profile)) profileMap.set(ov.profile, []);
                    profileMap.get(ov.profile)!.push(ov.device);
                }

                const appParts: string[] = [];
                appGroups.forEach((profileMap, appName) => {
                    const profileParts: string[] = [];
                    profileMap.forEach((devices, profile) => {
                        profileParts.push(`${profile} (${devices.join(', ')})`);
                    });
                    appParts.push(`${appName}: ${profileParts.join(', ')}`);
                });

                const rtValues = Array.from(rtSet);
                const rtSuffix =
                    rtValues.length === 1 && rtValues[0] === 'Master'
                        ? ''
                        : ` | RT: ${rtValues.join(', ')}`;

                const pageId = pageIdMap.get(pageName) || '';
                const appCount = appGroups.size;
                return {
                    key: `flexi-${pageName}`,
                    name: pageName,
                    apiName: pageName,
                    status: 'Active',
                    description: appParts.join('\n') + rtSuffix,
                    additionalInfo: `${ovs.length} assignments across ${appCount} app${appCount > 1 ? 's' : ''}`,
                    setupUrl: buildSetupUrl('flexiPageAssignments', pageId, obj),
                    lastModifiedDate: '',
                    lastModifiedBy: '',
                    category: 'flexiPageAssignments',
                };
            });
        }

        return pages.map(r => ({
            key: `flexi-assign-${safeString(r.DeveloperName)}`,
            name: safeString(r.MasterLabel),
            apiName: safeString(r.DeveloperName),
            status: 'Active',
            description: '',
            additionalInfo: 'Org Default',
            setupUrl: buildSetupUrl('flexiPageAssignments', safeString(r.Id), obj),
            lastModifiedDate: '',
            lastModifiedBy: '',
            category: 'flexiPageAssignments',
        }));
    };

    fetchQuickActions = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, DeveloperName, Label, Type ` +
                `FROM QuickActionDefinition WHERE SobjectType = '${this.escObj(obj)}' ORDER BY Label`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.Label),
            apiName: safeString(r.DeveloperName),
            status: 'Active',
            description: '',
            additionalInfo: safeString(r.Type),
            setupUrl: buildSetupUrl('quickActions', safeString(r.Id), obj),
            lastModifiedDate: '',
            lastModifiedBy: '',
            category: 'quickActions',
        }));
    };

    fetchListViews = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, Name, DeveloperName, LastModifiedDate, LastModifiedBy.Name ` +
                `FROM ListView WHERE SobjectType = '${this.escObj(obj)}' ORDER BY Name`
        );

        const describeResults = await Promise.allSettled(
            records.map(r => {
                const lvId = safeString(r.Id);
                return conn
                    .request(`/services/data/v59.0/sobjects/${obj}/listviews/${lvId}/describe`)
                    .catch(() => null);
            })
        );

        const rtIdSet = new Set<string>();
        for (const dr of describeResults) {
            if (dr.status !== 'fulfilled' || !dr.value) continue;
            const conditions: any[] = (dr.value as AnyRecord).whereCondition?.conditions || [];
            for (const c of conditions) {
                if (safeString(c.field) === 'RecordTypeId') {
                    for (const v of c.values || []) {
                        if (v && typeof v === 'string' && v.startsWith('012')) rtIdSet.add(v);
                    }
                }
            }
        }
        const rtNameMap = new Map<string, string>();
        if (rtIdSet.size > 0) {
            try {
                const rtIdList = Array.from(rtIdSet)
                    .map(id => `'${id}'`)
                    .join(',');
                const rtRecords = await this.standardQuery(
                    conn,
                    `SELECT Id, Name FROM RecordType WHERE Id IN (${rtIdList})`
                );
                for (const rt of rtRecords) {
                    rtNameMap.set(safeString(rt.Id), safeString(rt.Name));
                }
            } catch {
                // fallback: IDs stay unresolved
            }
        }

        return records.map((r, idx) => {
            let filterInfo = '';
            const descResult = describeResults[idx];
            if (descResult.status === 'fulfilled' && descResult.value) {
                const desc = descResult.value as AnyRecord;
                const conditions: any[] = desc.whereCondition?.conditions || [];
                if (conditions.length) {
                    filterInfo = conditions
                        .map((c: any) => {
                            const field = safeString(c.field);
                            const op = safeString(c.operator);
                            const vals: string[] = (c.values || []).map((v: string) => {
                                if (field === 'RecordTypeId' && rtNameMap.has(v)) {
                                    return rtNameMap.get(v)!;
                                }
                                return v;
                            });
                            return `${field} ${op} ${vals.join(', ')}`;
                        })
                        .filter(Boolean)
                        .join('\n');
                }
            }
            return {
                key: safeString(r.Id),
                name: safeString(r.Name),
                apiName: safeString(r.DeveloperName),
                status: 'Active',
                description: filterInfo,
                additionalInfo: filterInfo ? 'Filters' : '',
                setupUrl: buildSetupUrl('listViews', safeString(r.Id), obj),
                lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
                lastModifiedBy: safeString(r.LastModifiedBy?.Name),
                category: 'listViews',
            };
        });
    };

    fetchCustomButtons = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT Id, Name, MasterLabel, DisplayType, LinkType, ` +
                `LastModifiedDate, LastModifiedBy.Name ` +
                `FROM WebLink WHERE PageOrSobjectType = '${this.escObj(obj)}' ORDER BY Name`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.MasterLabel),
            apiName: safeString(r.Name),
            status: 'Active',
            description: '',
            additionalInfo: `${safeString(r.DisplayType)} / ${safeString(r.LinkType)}`,
            setupUrl: buildSetupUrl('customButtons', safeString(r.Id), obj),
            lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
            lastModifiedBy: safeString(r.LastModifiedBy?.Name),
            category: 'customButtons',
        }));
    };

    /** Schema & Fields Fetchers */

    fetchFormulaFields = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT DurableId, QualifiedApiName, Label, DataType ` +
                `FROM FieldDefinition ` +
                `WHERE EntityDefinition.QualifiedApiName = '${this.escObj(obj)}' ` +
                `AND IsCalculated = true ORDER BY Label`
        );
        return records.map(r => {
            const durableId = safeString(r.DurableId);
            const fieldId = durableId.includes('.') ? durableId.split('.').pop() || '' : durableId;
            return {
                key: `formula-${safeString(r.QualifiedApiName)}`,
                name: safeString(r.Label),
                apiName: safeString(r.QualifiedApiName),
                status: 'Active',
                description: '',
                additionalInfo: safeString(r.DataType),
                setupUrl: buildSetupUrl('formulaFields', fieldId, obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'formulaFields',
            };
        });
    };

    fetchRollupSummaries = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.standardQuery(
            conn,
            `SELECT DurableId, QualifiedApiName, Label, DataType ` +
                `FROM FieldDefinition ` +
                `WHERE EntityDefinition.QualifiedApiName = '${this.escObj(obj)}' ` +
                `AND DataType LIKE '%Summary%' ORDER BY Label`
        );
        return records.map(r => {
            const durableId = safeString(r.DurableId);
            const fieldId = durableId.includes('.') ? durableId.split('.').pop() || '' : durableId;
            return {
                key: `rollup-${safeString(r.QualifiedApiName)}`,
                name: safeString(r.Label),
                apiName: safeString(r.QualifiedApiName),
                status: 'Active',
                description: '',
                additionalInfo: safeString(r.DataType),
                setupUrl: buildSetupUrl('rollupSummaries', fieldId, obj),
                lastModifiedDate: '',
                lastModifiedBy: '',
                category: 'rollupSummaries',
            };
        });
    };

    fetchFieldSets = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, DeveloperName, MasterLabel, Description ` +
                `FROM FieldSet WHERE EntityDefinitionId = '${this.escObj(obj)}' ORDER BY MasterLabel`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.MasterLabel),
            apiName: safeString(r.DeveloperName),
            status: 'Active',
            description: safeString(r.Description),
            additionalInfo: '',
            setupUrl: buildSetupUrl('fieldSets', safeString(r.Id), obj),
            lastModifiedDate: '',
            lastModifiedBy: '',
            category: 'fieldSets',
        }));
    };

    /** Code & Jobs Fetchers */

    fetchApexClasses = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const records = await this.toolingQuery(
            conn,
            `SELECT Id, Name, Status, LastModifiedDate, LastModifiedBy.Name ` +
                `FROM ApexClass WHERE Name LIKE '%${this.escObj(obj)}%' ` +
                `AND NamespacePrefix = null ORDER BY Name LIMIT 50`
        );
        return records.map(r => ({
            key: safeString(r.Id),
            name: safeString(r.Name),
            apiName: safeString(r.Name),
            status: safeString(r.Status) || 'Active',
            description: '',
            additionalInfo: '',
            setupUrl: buildSetupUrl('apexClasses', safeString(r.Id), obj),
            lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
            lastModifiedBy: safeString(r.LastModifiedBy?.Name),
            category: 'apexClasses',
        }));
    };

    fetchScheduledJobs = async (conn: any, obj: string): Promise<BlueprintItem[]> => {
        const items: BlueprintItem[] = [];

        const scheduledFlows = await this.standardQuery(
            conn,
            `SELECT Id, ApiName, Label, IsActive, ActiveVersionId, LatestVersionId, ` +
                `LastModifiedDate, LastModifiedBy ` +
                `FROM FlowDefinitionView ` +
                `WHERE TriggerObjectOrEventId = '${this.escObj(obj)}' ` +
                `AND TriggerType = 'Scheduled' ORDER BY Label`
        );
        for (const r of scheduledFlows) {
            items.push({
                key: `sched-flow-${safeString(r.Id)}`,
                name: safeString(r.Label),
                apiName: safeString(r.ApiName),
                status: safeBool(r.IsActive) ? 'Active' : 'Inactive',
                description: '',
                additionalInfo: 'Scheduled Flow',
                setupUrl: buildFlowUrl(r.ActiveVersionId, r.LatestVersionId),
                lastModifiedDate: formatDateString(safeString(r.LastModifiedDate)),
                lastModifiedBy: safeString(r.LastModifiedBy),
                category: 'scheduledJobs',
            });
        }

        try {
            const relatedClasses = await this.toolingQuery(
                conn,
                `SELECT Id, Name FROM ApexClass ` +
                    `WHERE Body LIKE '%${this.escObj(obj)}%' ` +
                    `AND NamespacePrefix = null`
            );
            if (relatedClasses.length > 0) {
                const classNames = new Set(relatedClasses.map(c => safeString(c.Name)));
                const cronJobs = await this.standardQuery(
                    conn,
                    `SELECT Id, CronJobDetail.Name, CronJobDetail.JobType, State, ` +
                        `NextFireTime, CronExpression, CreatedDate ` +
                        `FROM CronTrigger ` +
                        `WHERE CronJobDetail.JobType IN ('5', '7') ` +
                        `AND State != 'DELETED' ` +
                        `ORDER BY NextFireTime ASC NULLS LAST`
                );
                const jobTypeLabels: Record<string, string> = {
                    '5': 'Scheduled Apex',
                    '7': 'Batch Apex',
                };
                for (const r of cronJobs) {
                    const jobName = safeString(r.CronJobDetail?.Name);
                    if (!classNames.has(jobName)) continue;
                    const jobType = safeString(r.CronJobDetail?.JobType);
                    const nextFire = r.NextFireTime
                        ? formatDateString(safeString(r.NextFireTime))
                        : '';
                    const infoParts = [jobTypeLabels[jobType] || 'Apex Job'];
                    if (nextFire) infoParts.push(`Next: ${nextFire}`);
                    items.push({
                        key: safeString(r.Id),
                        name: jobName,
                        apiName: jobName,
                        status: safeString(r.State) || 'Active',
                        description: safeString(r.CronExpression),
                        additionalInfo: infoParts.join('\n'),
                        setupUrl: buildSetupUrl('scheduledJobs', safeString(r.Id), obj),
                        lastModifiedDate: formatDateString(safeString(r.CreatedDate)),
                        lastModifiedBy: '',
                        category: 'scheduledJobs',
                    });
                }
            }
        } catch {
            // ApexClass body search may fail in some orgs
        }

        return items;
    };

    /** Getters */

    get groups(): any[] {
        const search = this.searchTerm.toLowerCase();
        return GROUPS.map(g => {
            const isOpen = this.isGroupOpen(g.key);
            const categories = CATEGORIES.filter(c => c.group === g.key).map(c => {
                const cat = this._categories.get(c.key);
                const base = cat || {
                    key: c.key,
                    label: c.label,
                    icon: c.icon,
                    group: c.group,
                    items: [],
                    error: '',
                    isLoading: false,
                };
                let items = base.items;
                if (this.activeOnly) {
                    items = items.filter(i => i.status === 'Active');
                }
                if (search) {
                    items = items.filter(
                        i =>
                            i.name.toLowerCase().includes(search) ||
                            i.apiName.toLowerCase().includes(search) ||
                            i.description.toLowerCase().includes(search) ||
                            i.additionalInfo.toLowerCase().includes(search)
                    );
                }
                items = items.map(i => ({
                    ...i,
                    _showApiName: i.apiName && i.apiName !== i.name,
                    _statusPillClass:
                        i.status === 'Active' || i.status === 'Tracked'
                            ? 'status-pill pill-active'
                            : i.status === 'Inactive' || i.status === 'Deactivated'
                              ? 'status-pill pill-inactive'
                              : 'status-pill pill-neutral',
                }));
                const isCatOpen = this.isCategoryOpen(c.key);
                const activeCount = items.filter(i => i.status === 'Active').length;
                const inactiveCount = items.filter(i => i.status !== 'Active').length;
                return {
                    ...base,
                    items,
                    _count: items.length,
                    _hasItems: items.length > 0,
                    _activeCount: activeCount,
                    _inactiveCount: inactiveCount,
                    _hasActive: activeCount > 0,
                    _hasInactive: inactiveCount > 0,
                    _activeLabel: `${activeCount} active`,
                    _inactiveLabel: `${inactiveCount} inactive`,
                    _isOpen: isCatOpen,
                    _sectionClass: `slds-section${isCatOpen ? ' slds-is-open' : ''} slds-m-bottom_xx-small`,
                    _chevronIcon: isCatOpen ? 'utility:chevrondown' : 'utility:chevronright',
                };
            });
            const totalCount = categories.reduce((sum: number, c: any) => sum + (c._count || 0), 0);
            const sectionClass = `slds-section${isOpen ? ' slds-is-open' : ''} slds-m-bottom_x-small`;
            const chevronIcon = isOpen ? 'utility:chevrondown' : 'utility:chevronright';
            return {
                key: g.key,
                label: g.label,
                categories,
                totalCount,
                isOpen,
                sectionClass,
                chevronIcon,
            };
        });
    }

    get totalItemCount(): number {
        let count = 0;
        for (const cat of this._categories.values()) {
            count += cat.items.length;
        }
        return count;
    }

    get activeItemCount(): number {
        let count = 0;
        for (const cat of this._categories.values()) {
            count += cat.items.filter(i => i.status === 'Active').length;
        }
        return count;
    }

    get summaryText(): string {
        return `${this.totalItemCount} items found, ${this.activeItemCount} active`;
    }

    get hasData(): boolean {
        return this.totalItemCount > 0;
    }

    get noData(): boolean {
        return this.totalItemCount === 0;
    }

    get activeOnlyVariant(): string {
        return this.activeOnly ? 'brand' : 'neutral';
    }

    get allVariant(): string {
        return this.activeOnly ? 'neutral' : 'brand';
    }

    getStatusBadgeClass(status: string): string {
        return `status-badge ${STATUS_BADGE_CLASS[status] || 'badge-grey'}`;
    }
}
