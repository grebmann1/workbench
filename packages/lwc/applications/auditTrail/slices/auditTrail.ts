import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ConnectorLike } from 'host-api/connector';
import { parseAuditDisplay } from '../parser';
import type { AuditCategory, ParsedAuditDisplay } from '../parser';

export interface AuditEntry {
    Id: string;
    CreatedDate: string;
    Action: string;
    Section: string;
    Display: string;
    DelegateUser: string | null;
    ResponsibleNamespacePrefix: string | null;
    CreatedBy?: { Name?: string; Username?: string };
    _parsed?: ParsedAuditDisplay;
}

export interface AuditFilter {
    search: string;
    section: string;
    userName: string;
    category: 'all' | AuditCategory;
    entity: string;
    since: string | null;
    until: string | null;
}

interface AuditState {
    isFetching: boolean;
    data: AuditEntry[];
    error: string | null;
    fetchedAt: number | null;
    filter: AuditFilter;
    limit: number;
}

export const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

const initialFilter: AuditFilter = {
    search: '',
    section: 'all',
    userName: 'all',
    category: 'all',
    entity: 'all',
    since: null,
    until: null,
};

const initialState: AuditState = {
    isFetching: false,
    data: [],
    error: null,
    fetchedAt: null,
    filter: initialFilter,
    limit: DEFAULT_LIMIT,
};

function escapeSoqlLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// SOQL DateTime literals must be ISO 8601 with a Z suffix and no quotes.
// `lightning-input[type=date]` gives us `YYYY-MM-DD` — we pad to start/end of day.
function toSoqlDateTime(date: string, endOfDay: boolean): string {
    if (/T\d{2}:\d{2}:\d{2}/.test(date)) {
        return date.endsWith('Z') ? date : `${date}Z`;
    }
    return endOfDay ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
}

export function buildAuditSoql(filter: AuditFilter, limit: number): string {
    const where: string[] = [];
    if (filter.since) where.push(`CreatedDate >= ${toSoqlDateTime(filter.since, false)}`);
    if (filter.until) where.push(`CreatedDate <= ${toSoqlDateTime(filter.until, true)}`);
    const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    return (
        'SELECT Id, CreatedDate, Action, Section, Display, DelegateUser, ' +
        'ResponsibleNamespacePrefix, CreatedBy.Name, CreatedBy.Username ' +
        `FROM SetupAuditTrail${whereClause} ORDER BY CreatedDate DESC LIMIT ${safeLimit}`
    );
}

export const fetchAuditTrail = createAsyncThunk(
    'auditTrail/fetch',
    async ({
        connector,
        filter,
        limit,
    }: {
        connector: ConnectorLike;
        filter: AuditFilter;
        limit: number;
    }) => {
        const soql = buildAuditSoql(filter, limit);
        const res: any = await (connector as any).conn.query(soql);
        return { records: (res?.records ?? []) as AuditEntry[] };
    }
);

const auditSlice = createSlice({
    name: 'auditTrail',
    initialState,
    reducers: {
        setFilter: (state, action: { payload: Partial<AuditFilter> }) => {
            state.filter = { ...state.filter, ...action.payload };
            // When Category changes, clear Entity since its option set depends on Category.
            if ('category' in action.payload) {
                state.filter.entity = 'all';
            }
        },
        resetFilter: state => {
            state.filter = initialFilter;
        },
        setLimit: (state, action: { payload: { limit: number } }) => {
            state.limit = action.payload.limit;
        },
    },
    extraReducers: builder => {
        builder
            .addCase(fetchAuditTrail.pending, state => {
                state.isFetching = true;
                state.error = null;
            })
            .addCase(fetchAuditTrail.fulfilled, (state, action: any) => {
                state.isFetching = false;
                const records: AuditEntry[] = action.payload?.records ?? [];
                state.data = records.map(r => ({
                    ...r,
                    _parsed: parseAuditDisplay(r.Display),
                }));
                state.fetchedAt = Date.now();
            })
            .addCase(fetchAuditTrail.rejected, (state, action: any) => {
                state.isFetching = false;
                state.error = action.error?.message || 'Fetch failed';
            });
    },
});

export const reduxSlice = auditSlice;
export const { setFilter, resetFilter, setLimit } = auditSlice.actions;

export function matchesFilter(entry: AuditEntry, filter: AuditFilter): boolean {
    if (filter.section !== 'all' && entry.Section !== filter.section) return false;
    const userName = entry.CreatedBy?.Name || '';
    if (filter.userName !== 'all' && userName !== filter.userName) return false;
    const parsed = entry._parsed;
    if (filter.category !== 'all') {
        if (!parsed || parsed.category !== filter.category) return false;
    }
    if (filter.entity !== 'all') {
        if (!parsed || parsed.entity !== filter.entity) return false;
    }
    if (filter.search) {
        const needle = filter.search.toLowerCase();
        const haystack = [
            entry.Display,
            entry.Section,
            entry.Action,
            userName,
            entry.CreatedBy?.Username || '',
            entry.DelegateUser || '',
            parsed?.entity || '',
        ]
            .join(' ')
            .toLowerCase();
        if (!haystack.includes(needle)) return false;
    }
    return true;
}

export function distinctValues(entries: AuditEntry[], key: 'Section' | 'userName'): string[] {
    const set = new Set<string>();
    for (const e of entries) {
        const v = key === 'Section' ? e.Section : e.CreatedBy?.Name || '';
        if (v) set.add(v);
    }
    return [...set].sort();
}

export function distinctEntities(entries: AuditEntry[], category: 'all' | AuditCategory): string[] {
    const set = new Set<string>();
    for (const e of entries) {
        const parsed = e._parsed;
        if (!parsed?.entity) continue;
        if (category !== 'all' && parsed.category !== category) continue;
        set.add(parsed.entity);
    }
    return [...set].sort();
}

// Exporting escapeSoqlLiteral for future date-bound variants that need it.
export { escapeSoqlLiteral };
