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
    @track limits: LimitItem[] = [];
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
            this.loadLimits();
        }
    }

    @api
    activate(): void {
        if (!this._hasLoaded && !isEmpty(this._objectName)) {
            this.loadLimits();
        }
    }

    handleRefresh = (): void => {
        this._hasLoaded = false;
        this.loadLimits();
    };

    loadLimits = async (): Promise<void> => {
        if (isEmpty(this._objectName)) return;
        this.isLoading = true;
        this._hasLoaded = true;

        try {
            await ensureSessionClientCallOption(this.connector);
            const conn = this.connector.conn;
            const obj = this._objectName;

            const [fieldResults, vrResults, rtResults] = await Promise.allSettled([
                this.countFields(conn, obj),
                this.countTooling(conn, 'ValidationRule', obj),
                this.countRecordTypes(conn, obj),
            ]);

            const items: LimitItem[] = [];
            if (fieldResults.status === 'fulfilled') {
                items.push(...fieldResults.value);
            }
            if (vrResults.status === 'fulfilled') {
                items.push(
                    makeLimit(
                        'validationRules',
                        'Validation Rules',
                        'automation',
                        'utility:check',
                        vrResults.value,
                        500
                    )
                );
            }
            if (rtResults.status === 'fulfilled') {
                items.push(
                    makeLimit(
                        'recordTypes',
                        'Record Types',
                        'ui',
                        'utility:record',
                        rtResults.value,
                        200
                    )
                );
            }
            this.limits = items;
        } catch (e) {
            console.error('Limits load error:', e);
        }
        this.isLoading = false;
    };

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
        const groupMap = new Map<string, { key: string; label: string; items: LimitItem[] }>();
        const groupDefs = [
            { key: 'schema', label: 'Schema' },
            { key: 'automation', label: 'Automation' },
            { key: 'ui', label: 'UI & Layout' },
        ];
        for (const g of groupDefs) {
            groupMap.set(g.key, { ...g, items: [] });
        }
        for (const item of this.limits) {
            const group = groupMap.get(item.group);
            if (group) group.items.push(item);
        }
        return groupDefs
            .map(g => groupMap.get(g.key))
            .filter(g => g && g.items.length > 0) as LimitGroup[];
    }

    get hasLimits(): boolean {
        return this.limits.length > 0;
    }

    get noLimits(): boolean {
        return this.limits.length === 0;
    }
}
