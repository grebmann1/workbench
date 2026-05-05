import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ConnectorLike } from 'host-api/connector';
import {
    ASYNC_APEX_LIMIT,
    BULK_RESULT_ENDPOINTS,
    FLEX_QUEUE_SOQL,
    SCHEDULED_SOQL,
    asyncApexSoql,
} from '../constants';
import type {
    ApexTestDetails,
    AsyncApexJob,
    BulkJob,
    BulkJobDetail,
    DetailState,
    FlexQueueJob,
    JobsTab,
    ScheduledJob,
    TabFilter,
    TabState,
} from '../types';

export interface JobsState {
    scheduled: TabState<ScheduledJob>;
    asyncApex: TabState<AsyncApexJob>;
    flexQueue: TabState<FlexQueueJob>;
    bulk: TabState<BulkJob>;
    activeTab: JobsTab;
    autoRefreshMs: number | null;
    filters: Record<JobsTab, TabFilter>;
    selectedBulkJobId: string | null;
    selectedAsyncJobId: string | null;
    bulkDetail: DetailState<BulkJobDetail>;
    apexTestDetails: DetailState<ApexTestDetails>;
}

const emptyTab = <T>(): TabState<T> => ({
    isFetching: false,
    data: [],
    error: null,
    warnings: [],
    fetchedAt: null,
});

const emptyFilter = (): TabFilter => ({
    search: '',
    status: 'all',
});

const emptyDetail = <T>(): DetailState<T> => ({
    isFetching: false,
    data: null,
    error: null,
});

const initialState: JobsState = {
    scheduled: emptyTab(),
    asyncApex: emptyTab(),
    flexQueue: emptyTab(),
    bulk: emptyTab(),
    activeTab: 'scheduled',
    autoRefreshMs: null,
    filters: {
        scheduled: emptyFilter(),
        asyncApex: emptyFilter(),
        flexQueue: emptyFilter(),
        bulk: emptyFilter(),
    },
    selectedBulkJobId: null,
    selectedAsyncJobId: null,
    bulkDetail: emptyDetail(),
    apexTestDetails: emptyDetail(),
};

function resolveApiVersion(connector: ConnectorLike): string {
    const v = (connector as { conn?: { version?: unknown } })?.conn?.version;
    return typeof v === 'string' && v.length > 0 ? v : '64.0';
}

function errorMessage(err: unknown): string {
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

function escapeSoqlLiteral(value: string): string {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function normalizeQueryRecords<T>(res: unknown): T[] {
    const records = (res as { records?: T[] })?.records;
    return Array.isArray(records) ? records : [];
}

function extractBulkRecords(value: unknown): BulkJob[] {
    const page = value as { records?: BulkJob[]; jobs?: BulkJob[] } | BulkJob[];
    if (Array.isArray(page)) return page;
    if (Array.isArray(page?.records)) return page.records;
    if (Array.isArray(page?.jobs)) return page.jobs;
    return [];
}

async function request(connector: ConnectorLike, url: string, method = 'GET', body?: unknown) {
    return (connector as { conn: { request: (input: unknown) => Promise<unknown> } }).conn.request({
        method,
        url,
        ...(body === undefined ? {} : { body }),
    });
}

async function fetchAllBulkPages(connector: ConnectorLike, firstUrl: string): Promise<BulkJob[]> {
    const records: BulkJob[] = [];
    let page = await request(connector, firstUrl);
    for (;;) {
        records.push(...extractBulkRecords(page));
        const nextRecordsUrl = (page as { nextRecordsUrl?: string })?.nextRecordsUrl;
        if (!nextRecordsUrl) break;
        page = await request(connector, nextRecordsUrl);
    }
    return records;
}

async function toolingQuery<T>(connector: ConnectorLike, soql: string): Promise<T[]> {
    const tooling = (
        connector as { conn?: { tooling?: { query?: (soql: string) => Promise<unknown> } } }
    )?.conn?.tooling;
    if (!tooling?.query) {
        throw new Error('Tooling API is not available for this connection.');
    }
    const res = await tooling.query(soql);
    return normalizeQueryRecords<T>(res);
}

export const fetchScheduled = createAsyncThunk(
    'jobs/fetchScheduled',
    async ({ connector }: { connector: ConnectorLike }) => {
        const res = await (
            connector as { conn: { query: (soql: string) => Promise<unknown> } }
        ).conn.query(SCHEDULED_SOQL);
        return { records: normalizeQueryRecords<ScheduledJob>(res) };
    }
);

export const fetchAsyncApex = createAsyncThunk(
    'jobs/fetchAsyncApex',
    async ({ connector, offset = 0 }: { connector: ConnectorLike; offset?: number }) => {
        const res = await (
            connector as { conn: { query: (soql: string) => Promise<unknown> } }
        ).conn.query(asyncApexSoql(offset));
        const records = normalizeQueryRecords<AsyncApexJob>(res);
        return {
            records,
            offset,
            hasMore: records.length === ASYNC_APEX_LIMIT,
        };
    }
);

export const fetchMoreAsyncApex = createAsyncThunk(
    'jobs/fetchMoreAsyncApex',
    async ({ connector, offset }: { connector: ConnectorLike; offset: number }) => {
        const res = await (
            connector as { conn: { query: (soql: string) => Promise<unknown> } }
        ).conn.query(asyncApexSoql(offset));
        const records = normalizeQueryRecords<AsyncApexJob>(res);
        return {
            records,
            offset,
            hasMore: records.length === ASYNC_APEX_LIMIT,
        };
    }
);

export const fetchFlexQueue = createAsyncThunk(
    'jobs/fetchFlexQueue',
    async ({ connector }: { connector: ConnectorLike }) => {
        const res = await (
            connector as { conn: { query: (soql: string) => Promise<unknown> } }
        ).conn.query(FLEX_QUEUE_SOQL);
        const records = normalizeQueryRecords<FlexQueueJob>(res).map(record => ({
            ...record,
            Status: 'Queued',
        }));
        return { records };
    }
);

export const fetchBulk = createAsyncThunk(
    'jobs/fetchBulk',
    async ({ connector }: { connector: ConnectorLike }) => {
        const version = resolveApiVersion(connector);
        const warnings: string[] = [];
        const [ingest, query] = await Promise.all([
            fetchAllBulkPages(connector, `/services/data/v${version}/jobs/ingest`).catch(err => {
                warnings.push(`Bulk ingest jobs failed: ${errorMessage(err)}`);
                return [];
            }),
            fetchAllBulkPages(connector, `/services/data/v${version}/jobs/query`).catch(err => {
                warnings.push(`Bulk query jobs failed: ${errorMessage(err)}`);
                return [];
            }),
        ]);
        const ingestJobs = ingest.map(r => ({ ...r, _kind: 'ingest' as const }));
        const queryJobs = query.map(r => ({ ...r, _kind: 'query' as const }));
        const records = [...ingestJobs, ...queryJobs].sort((a, b) => {
            const ad = Date.parse(a.createdDate || a.systemModstamp || '') || 0;
            const bd = Date.parse(b.createdDate || b.systemModstamp || '') || 0;
            return bd - ad;
        });
        return { records, warnings };
    }
);

export const abortScheduled = createAsyncThunk(
    'jobs/abortScheduled',
    async ({ connector, id }: { connector: ConnectorLike; id: string }) => {
        const anon = `System.abortJob('${id}');`;
        const res = await (
            connector as {
                conn: {
                    tooling: {
                        executeAnonymous: (apex: string) => Promise<{
                            success?: boolean;
                            compiled?: boolean;
                            exceptionMessage?: string;
                            compileProblem?: string;
                        }>;
                    };
                };
            }
        ).conn.tooling.executeAnonymous(anon);
        if (!res?.success || res?.compiled === false) {
            const msg =
                res?.exceptionMessage ||
                res?.compileProblem ||
                'Salesforce rejected the abort call.';
            throw new Error(msg);
        }
        return { id };
    }
);

export const fetchBulkJobDetail = createAsyncThunk(
    'jobs/fetchBulkJobDetail',
    async ({ connector, id }: { connector: ConnectorLike; id: string }) => {
        const version = resolveApiVersion(connector);
        const detail = (await request(
            connector,
            `/services/data/v${version}/jobs/ingest/${id}`
        )) as BulkJobDetail;
        return { detail };
    }
);

export const abortBulkJob = createAsyncThunk(
    'jobs/abortBulkJob',
    async ({ connector, id }: { connector: ConnectorLike; id: string }) => {
        const version = resolveApiVersion(connector);
        await request(connector, `/services/data/v${version}/jobs/ingest/${id}`, 'PATCH', {
            state: 'Aborted',
        });
        return { id };
    }
);

export const fetchBulkJobResults = createAsyncThunk(
    'jobs/fetchBulkJobResults',
    async ({
        connector,
        id,
        resultType,
    }: {
        connector: ConnectorLike;
        id: string;
        resultType: keyof typeof BULK_RESULT_ENDPOINTS;
    }) => {
        const version = resolveApiVersion(connector);
        let lastError: unknown = null;
        for (const suffix of BULK_RESULT_ENDPOINTS[resultType]) {
            try {
                const text = await request(
                    connector,
                    `/services/data/v${version}/jobs/ingest/${id}/${suffix}`
                );
                return { id, resultType, text: String(text ?? '') };
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error('Failed downloading results.');
    }
);

export const fetchApexTestDetails = createAsyncThunk(
    'jobs/fetchApexTestDetails',
    async ({ connector, jobId }: { connector: ConnectorLike; jobId: string }) => {
        const escapedJobId = escapeSoqlLiteral(jobId);
        const [summaryRecords, queueItems] = await Promise.all([
            toolingQuery(
                connector,
                `SELECT Id,Status,NumberTestsTotal,NumberTestsCompleted,NumberTestErrors FROM ApexTestRunResult WHERE AsyncApexJobId='${escapedJobId}'`
            ),
            toolingQuery(
                connector,
                `SELECT Id,Status,ApexClassId,MethodName,ExtendedStatus FROM ApexTestQueueItem WHERE ParentJobId='${escapedJobId}'`
            ),
        ]);
        let results = await toolingQuery(
            connector,
            `SELECT Id,Outcome,Message,StackTrace,ApexClassId,ApexClass.Name,MethodName,AsyncApexJobId FROM ApexTestResult WHERE AsyncApexJobId='${escapedJobId}' ORDER BY Outcome ASC,ApexClass.Name,MethodName`
        ).catch(() => []);
        if (!results.length && queueItems.length) {
            const queueIds = queueItems
                .map(item => String((item as { Id?: string }).Id || '').trim())
                .filter(Boolean);
            if (queueIds.length) {
                const inList = queueIds.map(id => `'${escapeSoqlLiteral(id)}'`).join(',');
                results = await toolingQuery(
                    connector,
                    `SELECT Id,Outcome,Message,StackTrace,ApexClassId,ApexClass.Name,MethodName,QueueItemId FROM ApexTestResult WHERE QueueItemId IN (${inList}) ORDER BY Outcome ASC,ApexClass.Name,MethodName`
                );
            }
        }
        return {
            detail: {
                jobId,
                summary: (summaryRecords[0] as ApexTestDetails['summary']) || null,
                queueItems: queueItems as ApexTestDetails['queueItems'],
                results: results as ApexTestDetails['results'],
            },
        };
    }
);

const jobsSlice = createSlice({
    name: 'jobs',
    initialState,
    reducers: {
        setActiveTab: (state, action: { payload: { tab: JobsTab } }) => {
            state.activeTab = action.payload.tab;
        },
        setAutoRefresh: (state, action: { payload: { ms: number | null } }) => {
            state.autoRefreshMs = action.payload.ms;
        },
        setFilter: (
            state,
            action: { payload: { tab: JobsTab; search?: string; status?: string } }
        ) => {
            const current = state.filters[action.payload.tab];
            state.filters[action.payload.tab] = {
                search: action.payload.search ?? current.search,
                status: action.payload.status ?? current.status,
            };
        },
        selectBulkJob: (state, action: { payload: { id: string | null } }) => {
            state.selectedBulkJobId = action.payload.id;
            if (!action.payload.id) {
                state.bulkDetail = emptyDetail();
            }
        },
        selectAsyncJob: (state, action: { payload: { id: string | null } }) => {
            state.selectedAsyncJobId = action.payload.id;
            if (!action.payload.id) {
                state.apexTestDetails = emptyDetail();
            }
        },
    },
    extraReducers: builder => {
        const wire = <T>(
            thunk: ReturnType<typeof createAsyncThunk>,
            key: 'scheduled' | 'asyncApex' | 'flexQueue' | 'bulk'
        ) => {
            builder
                .addCase(thunk.pending, state => {
                    state[key].isFetching = true;
                    state[key].error = null;
                    state[key].warnings = [];
                })
                .addCase(
                    thunk.fulfilled,
                    (
                        state,
                        action: {
                            payload?: {
                                records?: T[];
                                warnings?: string[];
                                hasMore?: boolean;
                                offset?: number;
                            };
                        }
                    ) => {
                        state[key].isFetching = false;
                        state[key].data = action.payload?.records ?? [];
                        state[key].fetchedAt = Date.now();
                        state[key].error = null;
                        state[key].warnings = action.payload?.warnings ?? [];
                        state[key].hasMore = action.payload?.hasMore;
                        state[key].offset = (action.payload?.offset ?? 0) + state[key].data.length;
                    }
                )
                .addCase(thunk.rejected, (state, action: { error?: { message?: string } }) => {
                    state[key].isFetching = false;
                    state[key].error = action.error?.message || 'Fetch failed';
                });
        };
        wire(fetchScheduled, 'scheduled');
        wire(fetchAsyncApex, 'asyncApex');
        wire(fetchFlexQueue, 'flexQueue');
        wire(fetchBulk, 'bulk');

        builder
            .addCase(fetchMoreAsyncApex.pending, state => {
                state.asyncApex.isFetching = true;
                state.asyncApex.error = null;
            })
            .addCase(fetchMoreAsyncApex.fulfilled, (state, action) => {
                const records = action.payload?.records ?? [];
                state.asyncApex.isFetching = false;
                state.asyncApex.data.push(...records);
                state.asyncApex.fetchedAt = Date.now();
                state.asyncApex.error = null;
                state.asyncApex.hasMore = action.payload?.hasMore;
                state.asyncApex.offset = (action.payload?.offset ?? 0) + records.length;
            })
            .addCase(fetchMoreAsyncApex.rejected, (state, action) => {
                state.asyncApex.isFetching = false;
                state.asyncApex.error = action.error?.message || 'Fetch failed';
            })
            .addCase(abortScheduled.fulfilled, (state, action: { payload?: { id?: string } }) => {
                const id = action.payload?.id;
                if (!id) return;
                state.scheduled.data = state.scheduled.data.filter(r => r.Id !== id);
            })
            .addCase(abortScheduled.rejected, (state, action) => {
                state.scheduled.error = errorMessage(action.error?.message);
            })
            .addCase(fetchBulkJobDetail.pending, state => {
                state.bulkDetail.isFetching = true;
                state.bulkDetail.error = null;
            })
            .addCase(fetchBulkJobDetail.fulfilled, (state, action) => {
                state.bulkDetail.isFetching = false;
                state.bulkDetail.data = action.payload.detail;
            })
            .addCase(fetchBulkJobDetail.rejected, (state, action) => {
                state.bulkDetail.isFetching = false;
                state.bulkDetail.error = errorMessage(action.error?.message);
            })
            .addCase(abortBulkJob.fulfilled, (state, action) => {
                const id = action.payload.id;
                state.bulk.data = state.bulk.data.map(job =>
                    job.id === id ? { ...job, state: 'Aborted' } : job
                );
                if (state.bulkDetail.data?.id === id) {
                    state.bulkDetail.data = { ...state.bulkDetail.data, state: 'Aborted' };
                }
            })
            .addCase(abortBulkJob.rejected, (state, action) => {
                state.bulk.error = errorMessage(action.error?.message);
            })
            .addCase(fetchApexTestDetails.pending, state => {
                state.apexTestDetails.isFetching = true;
                state.apexTestDetails.error = null;
            })
            .addCase(fetchApexTestDetails.fulfilled, (state, action) => {
                state.apexTestDetails.isFetching = false;
                state.apexTestDetails.data = action.payload.detail;
            })
            .addCase(fetchApexTestDetails.rejected, (state, action) => {
                state.apexTestDetails.isFetching = false;
                state.apexTestDetails.error = errorMessage(action.error?.message);
            });
    },
});

export const reduxSlice = jobsSlice;
export const { setActiveTab, setAutoRefresh, setFilter, selectBulkJob, selectAsyncJob } =
    jobsSlice.actions;
export type { JobsTab } from '../types';
