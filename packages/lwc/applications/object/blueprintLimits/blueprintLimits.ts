import ToolkitElement from 'host-api/element';
import { api, track } from 'lwc';
import { isEmpty } from 'shared/utils';
import { ensureSessionClientCallOption } from '../sessionCallOptions';

interface LimitItem {
    key: string;
    label: string;
    group: string;
    icon: string;
    current: number;
    maximum: number;
    percentage: number;
    percentageLabel: string;
    barClass: string;
    barStyle: string;
}

interface LimitGroup {
    key: string;
    label: string;
    items: LimitItem[];
    isOpen: boolean;
    isLoading: boolean;
    error: string;
    hasLoaded: boolean;
    sectionClass?: string;
    chevronIcon?: string;
    loadingMessage?: string;
}

const LIMIT_THRESHOLDS = { warning: 70, critical: 90 };

function makeLimit(
    key: string,
    label: string,
    group: string,
    icon: string,
    current: number,
    maximum: number
): LimitItem {
    const pct = maximum > 0 ? Math.round((current / maximum) * 100) : 0;
    let barClass = 'bar-normal';
    if (pct >= LIMIT_THRESHOLDS.critical) barClass = 'bar-critical';
    else if (pct >= LIMIT_THRESHOLDS.warning) barClass = 'bar-warning';
    return {
        key,
        label,
        group,
        icon,
        current,
        maximum,
        percentage: pct,
        percentageLabel: `${current} / ${maximum} (${pct}%)`,
        barClass: `limit-bar ${barClass}`,
        barStyle: `width: ${Math.min(pct, 100)}%`,
    };
}

export default class BlueprintLimits extends ToolkitElement {
    _objectName: string | null = null;
    @track groupState: LimitGroup[] = [];
    _hasLoaded = false;
    _requestToken = 0;

    @api
    get objectName(): string | null {
        return this._objectName;
    }

    set objectName(value: string | null) {
        const changed = this._objectName !== value;
        this._objectName = value;
        if (changed && !isEmpty(value)) {
            this._hasLoaded = false;
            this._requestToken += 1;
            this.groupState = [];
        }
    }

    @api
    activate(): void {
        if (!this._hasLoaded && !isEmpty(this._objectName)) {
            this.initializeGroups();
            this.loadOpenGroups();
        }
    }

    handleRefresh = (): void => {
        this._requestToken += 1;
        this.initializeGroups();
        this.loadOpenGroups();
    };

    handleToggleGroup = (e: any): void => {
        const groupKey = e.currentTarget?.dataset?.group;
        if (!groupKey) return;
        const group = this.groupState.find(item => item.key === groupKey);
        if (!group) return;
        const shouldOpen = !group.isOpen;
        this.groupState = this.groupState.map(item =>
            item.key === groupKey ? { ...item, isOpen: shouldOpen } : item
        );
        if (shouldOpen) {
            this.loadGroup(groupKey);
        }
    };

    initializeGroups(): void {
        if (isEmpty(this._objectName)) return;
        this._hasLoaded = true;
        this.groupState = [
            {
                key: 'schema',
                label: 'Schema',
                items: [],
                isOpen: true,
                isLoading: false,
                error: '',
                hasLoaded: false,
            },
            {
                key: 'automation',
                label: 'Automation',
                items: [],
                isOpen: true,
                isLoading: false,
                error: '',
                hasLoaded: false,
            },
            {
                key: 'ui',
                label: 'UI & Layout',
                items: [],
                isOpen: true,
                isLoading: false,
                error: '',
                hasLoaded: false,
            },
        ];
    }

    private loadOpenGroups(): void {
        const openKeys = this.groupState.filter(group => group.isOpen).map(group => group.key);
        openKeys.forEach(groupKey => this.loadGroup(groupKey));
    }

    private loadGroup = async (groupKey: string): Promise<void> => {
        if (isEmpty(this._objectName)) return;
        const group = this.groupState.find(item => item.key === groupKey);
        if (!group || group.isLoading || group.hasLoaded) return;
        const objectName = String(this._objectName);
        const requestToken = this._requestToken;
        this.updateGroup(groupKey, { isLoading: true, error: '' });

        try {
            await ensureSessionClientCallOption(this.connector);
            const conn = this.connector.conn;
            let items: LimitItem[] = [];
            if (groupKey === 'schema') {
                items = await this.countFields(conn, objectName);
            } else if (groupKey === 'automation') {
                const validationRuleCount = await this.countTooling(
                    conn,
                    'ValidationRule',
                    objectName
                );
                items = [
                    makeLimit(
                        'validationRules',
                        'Validation Rules',
                        'automation',
                        'utility:check',
                        validationRuleCount,
                        500
                    ),
                ];
            } else if (groupKey === 'ui') {
                const recordTypeCount = await this.countRecordTypes(conn, objectName);
                items = [
                    makeLimit(
                        'recordTypes',
                        'Record Types',
                        'ui',
                        'utility:record',
                        recordTypeCount,
                        200
                    ),
                ];
            }
            if (requestToken !== this._requestToken) return;
            this.updateGroup(groupKey, { items, isLoading: false, error: '', hasLoaded: true });
        } catch (e) {
            if (requestToken !== this._requestToken) return;
            this.updateGroup(groupKey, {
                isLoading: false,
                error: e instanceof Error ? e.message : 'Failed to load limits',
                hasLoaded: true,
                items: [],
            });
        }
    };

    private updateGroup(groupKey: string, updates: Partial<LimitGroup>): void {
        this.groupState = this.groupState.map(group =>
            group.key === groupKey ? { ...group, ...updates } : group
        );
    }

    private async countFields(conn: any, obj: string): Promise<LimitItem[]> {
        const res = await conn.query(
            `SELECT QualifiedApiName, DataType, IsCalculated, RelationshipName ` +
                `FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${obj}'`
        );
        const fields = res?.records || [];
        let custom = 0,
            formula = 0,
            rollup = 0,
            lookup = 0,
            masterDetail = 0;
        for (const f of fields) {
            if (f.QualifiedApiName?.endsWith('__c')) custom++;
            if (f.IsCalculated === true) formula++;
            const dt = (f.DataType || '').toLowerCase();
            if (dt.includes('summary')) rollup++;
            if (f.RelationshipName) {
                if (dt.includes('master')) masterDetail++;
                else if (dt.includes('lookup')) lookup++;
            }
        }
        return [
            makeLimit('customFields', 'Custom Fields', 'schema', 'utility:text', custom, 500),
            makeLimit('formulaFields', 'Formula Fields', 'schema', 'utility:formula', formula, 800),
            makeLimit(
                'rollupSummaries',
                'Rollup Summaries',
                'schema',
                'utility:summary',
                rollup,
                25
            ),
            makeLimit('lookups', 'Lookups', 'schema', 'utility:link', lookup, 40),
            makeLimit(
                'masterDetails',
                'Master-Detail',
                'schema',
                'utility:hierarchy',
                masterDetail,
                3
            ),
        ];
    }

    private async countTooling(conn: any, toolingObject: string, obj: string): Promise<number> {
        const res = await conn.tooling.query(
            `SELECT COUNT() FROM ${toolingObject} WHERE EntityDefinition.QualifiedApiName = '${obj}'`
        );
        return res?.totalSize || 0;
    }

    private async countRecordTypes(conn: any, obj: string): Promise<number> {
        const res = await conn.query(
            `SELECT COUNT() FROM RecordType WHERE SobjectType = '${obj}' AND IsActive = true`
        );
        return res?.totalSize || 0;
    }

    /** Getters */

    get limitGroups(): LimitGroup[] {
        return this.groupState.map(group => ({
            ...group,
            sectionClass: `slds-section${group.isOpen ? ' slds-is-open' : ''} slds-m-bottom_small`,
            chevronIcon: group.isOpen ? 'utility:chevrondown' : 'utility:chevronright',
            loadingMessage: `Loading ${group.label} limits...`,
        })) as LimitGroup[];
    }

    get hasLimits(): boolean {
        return this.groupState.some(group => group.items.length > 0);
    }

    get totalLimitCount(): number {
        return this.groupState.reduce((count, group) => count + group.items.length, 0);
    }

    get summaryText(): string {
        return `${this.totalLimitCount} limits tracked`;
    }

    get hasLoadedData(): boolean {
        return this.groupState.some(group => group.hasLoaded);
    }

    get noLimits(): boolean {
        if (!this._hasLoaded) return false;
        const loadedAny = this.groupState.some(group => group.hasLoaded);
        return loadedAny && !this.hasLimits;
    }
}
