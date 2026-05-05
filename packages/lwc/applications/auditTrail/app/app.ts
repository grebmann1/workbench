import { registerCommand } from 'host-api/commands';
import ToolkitElement from 'host-api/element';
import { store, injectReducer, connectStore } from 'host-api/store';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';
import Toast from 'lightning/toast';
import { track, wire } from 'lwc';
import moment from 'moment';
import Analytics from 'shared/analytics';
import { AUDIT } from 'auditTrail/slices';
import type { AuditEntry, AuditFilter } from 'auditTrail/slices/auditTrail';
import type { AuditCategory } from 'auditTrail/parser';

const {
    fetchAuditTrail,
    setFilter,
    setLimit,
    matchesFilter,
    distinctValues,
    distinctEntities,
    DEFAULT_LIMIT,
} = AUDIT;

const LIMIT_OPTIONS = [
    { label: '200', value: '200' },
    { label: '500', value: '500' },
    { label: '1000', value: '1000' },
    { label: '2000', value: '2000' },
];

const CATEGORY_OPTIONS: Array<{ label: string; value: 'all' | AuditCategory }> = [
    { label: 'All categories', value: 'all' },
    { label: 'Profile', value: 'profile' },
    { label: 'Permission Set', value: 'permset' },
    { label: 'User', value: 'user' },
    { label: 'Package', value: 'package' },
    { label: 'Metadata', value: 'metadata' },
    { label: 'Other', value: 'other' },
];

const CATEGORY_STYLE: Record<string, string> = {
    profile: 'background:#0070d2;color:#fff;',
    permset: 'background:#04844b;color:#fff;',
    user: 'background:#b85c00;color:#fff;',
    package: 'background:#5867e8;color:#fff;',
    metadata: 'background:#3e3e3c;color:#fff;',
    other: 'background:#dddbda;color:#181818;',
};

interface TabulatorCtor {
    new (element: Element, options: Record<string, any>): TabulatorInstance;
}

interface TabulatorInstance {
    destroy(): void;
    replaceData(data: any[]): void;
}

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function categoryBadge(cell: any): string {
    const value = (cell.getValue() as string) || 'other';
    const style = CATEGORY_STYLE[value] || CATEGORY_STYLE.other;
    return `<span class="audit-category-badge" style="${style}">${escapeHtml(value)}</span>`;
}

function formatDate(cell: any): string {
    const raw = cell.getValue();
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return escapeHtml(raw);
    return escapeHtml(d.toLocaleString());
}

const TABLE_COLUMNS = [
    { title: 'Date', field: 'CreatedDate', width: 170, formatter: formatDate, sorter: 'string' },
    {
        title: 'User',
        field: 'userName',
        width: 160,
        formatter: (cell: any) => escapeHtml(cell.getValue()),
    },
    {
        title: 'Section',
        field: 'Section',
        width: 160,
        formatter: (cell: any) => escapeHtml(cell.getValue()),
    },
    {
        title: 'Category',
        field: 'category',
        width: 110,
        formatter: categoryBadge,
    },
    {
        title: 'Entity',
        field: 'entity',
        width: 200,
        formatter: (cell: any) => escapeHtml(cell.getValue()),
    },
    {
        title: 'Action',
        field: 'Action',
        width: 140,
        formatter: (cell: any) => escapeHtml(cell.getValue()),
    },
    {
        title: 'Display',
        field: 'Display',
        widthGrow: 3,
        formatter: (cell: any) => escapeHtml(cell.getValue()),
        variableHeight: true,
    },
    {
        title: 'Delegate',
        field: 'DelegateUser',
        width: 140,
        formatter: (cell: any) => escapeHtml(cell.getValue()),
    },
];

function toRowData(entry: AuditEntry) {
    return {
        id: entry.Id,
        CreatedDate: entry.CreatedDate,
        userName: entry.CreatedBy?.Name || '',
        Section: entry.Section || '',
        Action: entry.Action || '',
        Display: entry.Display || '',
        DelegateUser: entry.DelegateUser || '',
        category: entry._parsed?.category || 'other',
        entity: entry._parsed?.entity || '',
    };
}

let _bootstrapped = false;
function bootstrap() {
    if (_bootstrapped) return;
    _bootstrapped = true;
    injectReducer('auditTrail', AUDIT.reduxSlice.reducer);
    registerCommand('auditTrail.open', () => {
        const target = `sftoolkit:${JSON.stringify({
            type: 'application',
            state: { applicationName: 'auditTrail' },
        })}`;
        return legacyStore.dispatch(legacyStore_application.navigate(target));
    });
}
bootstrap();

function escapeCsv(value: unknown): string {
    if (value == null) return '';
    const s = String(value);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

export default class App extends ToolkitElement {
    @track data: AuditEntry[] = [];
    @track filter: AuditFilter = {
        search: '',
        section: 'all',
        userName: 'all',
        category: 'all',
        entity: 'all',
        since: null,
        until: null,
    };
    @track isFetching = false;
    @track error: string | null = null;
    @track fetchedAt: number | null = null;
    @track ageLabel: string | null = null;
    @track limitValue = String(DEFAULT_LIMIT);

    limitOptions = LIMIT_OPTIONS;
    categoryOptions = CATEGORY_OPTIONS;
    _ageTimer: ReturnType<typeof setInterval> | null = null;

    // Tabulator — imported dynamically so the audit app doesn't bloat the initial bundle.
    _tabulatorCtor: TabulatorCtor | null = null;
    _tabulatorImportPromise: Promise<TabulatorCtor> | null = null;
    _tableInstance: TabulatorInstance | null = null;
    _tableRunId = 0;

    connectedCallback() {
        Analytics.trackAppOpen('auditTrail', { alias: this.alias });
        this.fetchNow();
        this._ageTimer = setInterval(() => this.updateAge(), 15000);
    }

    disconnectedCallback() {
        if (this._ageTimer) {
            clearInterval(this._ageTimer);
            this._ageTimer = null;
        }
        if (this._tableInstance) {
            this._tableInstance.destroy();
            this._tableInstance = null;
        }
    }

    renderedCallback() {
        this.renderTable();
    }

    @wire(connectStore, { store })
    storeChange({ auditTrail }: { auditTrail: any }) {
        if (!auditTrail) return;
        this.data = auditTrail.data || [];
        this.filter = auditTrail.filter;
        this.isFetching = auditTrail.isFetching;
        this.error = auditTrail.error;
        this.fetchedAt = auditTrail.fetchedAt;
        this.limitValue = String(auditTrail.limit);
        this.updateAge();
        this.renderTable();
    }

    updateAge = () => {
        this.ageLabel = this.fetchedAt ? moment(this.fetchedAt).fromNow() : null;
    };

    async ensureTabulator(): Promise<TabulatorCtor> {
        if (this._tabulatorCtor) return this._tabulatorCtor;
        if (!this._tabulatorImportPromise) {
            this._tabulatorImportPromise = import('tabulator-tables').then(
                (mod: any) => mod.TabulatorFull || mod.default || mod.Tabulator
            );
        }
        this._tabulatorCtor = await this._tabulatorImportPromise;
        return this._tabulatorCtor;
    }

    renderTable = async () => {
        const runId = ++this._tableRunId;
        const element = this.template.querySelector('.audit-tabulator');
        if (!element) return;
        const data = this.visibleRows.map(toRowData);

        if (this._tableInstance) {
            this._tableInstance.replaceData(data);
            return;
        }

        const Tabulator = await this.ensureTabulator();
        if (!Tabulator || runId !== this._tableRunId) return;
        // Guard against the element being torn down while we awaited the dynamic import.
        if (!this.template.querySelector('.audit-tabulator')) return;

        this._tableInstance = new Tabulator(element, {
            height: '100%',
            data,
            layout: 'fitDataStretch',
            columns: TABLE_COLUMNS,
            rowHeight: 32,
            columnHeaderVertAlign: 'middle',
            placeholder: 'No audit trail entries match the current filters.',
        });
    };

    fetchNow() {
        const connector = this.connector;
        if (!connector) return;
        // Read the filter straight from the store — `this.filter` lags a tick
        // behind dispatches made in the same event handler (e.g. date changes).
        const state = (store.getState() as any).auditTrail;
        const currentFilter = state?.filter ?? this.filter;
        const currentLimit = state?.limit ?? Number(this.limitValue) ?? DEFAULT_LIMIT;
        store.dispatch(
            fetchAuditTrail({
                connector,
                filter: currentFilter,
                limit: currentLimit,
            })
        );
    }

    handleRefresh = () => this.fetchNow();

    handleSearchChange = (event: any) => {
        store.dispatch(setFilter({ search: event.target?.value ?? '' }));
    };

    handleSectionChange = (event: any) => {
        const value = event.detail?.value ?? event.target?.value ?? 'all';
        store.dispatch(setFilter({ section: value }));
    };

    handleUserChange = (event: any) => {
        const value = event.detail?.value ?? event.target?.value ?? 'all';
        store.dispatch(setFilter({ userName: value }));
    };

    handleCategoryChange = (event: any) => {
        const value = event.detail?.value ?? event.target?.value ?? 'all';
        store.dispatch(setFilter({ category: value as 'all' | AuditCategory }));
    };

    handleEntityChange = (event: any) => {
        const value = event.detail?.value ?? event.target?.value ?? 'all';
        store.dispatch(setFilter({ entity: value }));
    };

    handleSinceChange = (event: any) => {
        store.dispatch(setFilter({ since: event.target?.value || null }));
        this.fetchNow();
    };

    handleUntilChange = (event: any) => {
        store.dispatch(setFilter({ until: event.target?.value || null }));
        this.fetchNow();
    };

    handleLimitChange = (event: any) => {
        const value = event.detail?.value ?? event.target?.value;
        this.limitValue = value;
        store.dispatch(setLimit({ limit: Number(value) || DEFAULT_LIMIT }));
    };

    handleExportCsv = () => {
        const rows = this.visibleRows;
        if (rows.length === 0) {
            Toast.show({ label: 'No rows to export', variant: 'warning' });
            return;
        }
        const header = [
            'CreatedDate',
            'CreatedBy',
            'Action',
            'Section',
            'Category',
            'Entity',
            'Display',
            'DelegateUser',
        ];
        const body = rows
            .map(r =>
                [
                    r.CreatedDate,
                    r.CreatedBy?.Name || '',
                    r.Action,
                    r.Section,
                    r._parsed?.category || '',
                    r._parsed?.entity || '',
                    r.Display,
                    r.DelegateUser || '',
                ]
                    .map(escapeCsv)
                    .join(',')
            )
            .join('\n');
        const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
        const blob = new Blob([bom, header.join(','), '\n', body], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `setup-audit-trail-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    get visibleRows(): AuditEntry[] {
        return this.data.filter(e => matchesFilter(e, this.filter));
    }

    get visibleCount() {
        return this.visibleRows.length;
    }

    get isEmpty() {
        return !this.isFetching && this.visibleRows.length === 0;
    }

    get sectionOptions() {
        return [
            { label: 'All sections', value: 'all' },
            ...distinctValues(this.data, 'Section').map(v => ({ label: v, value: v })),
        ];
    }

    get userOptions() {
        return [
            { label: 'All users', value: 'all' },
            ...distinctValues(this.data, 'userName').map(v => ({ label: v, value: v })),
        ];
    }

    get entityOptions() {
        return [
            { label: 'All entities', value: 'all' },
            ...distinctEntities(this.data, this.filter.category).map(v => ({
                label: v,
                value: v,
            })),
        ];
    }

    get isEntityDisabled() {
        return this.entityOptions.length <= 1;
    }

    get searchValue() {
        return this.filter.search;
    }
    get sectionValue() {
        return this.filter.section;
    }
    get userValue() {
        return this.filter.userName;
    }
    get categoryValue() {
        return this.filter.category;
    }
    get entityValue() {
        return this.filter.entity;
    }
    get sinceValue() {
        return this.filter.since || '';
    }
    get untilValue() {
        return this.filter.until || '';
    }
}
