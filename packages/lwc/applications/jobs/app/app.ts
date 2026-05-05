import { registerCommand } from 'host-api/commands';
import ToolkitElement from 'host-api/element';
import { store, injectReducer, connectStore } from 'host-api/store';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';
import LightningConfirm from 'lightning/confirm';
import Toast from 'lightning/toast';
import { track, wire } from 'lwc';
import moment from 'moment';
import Analytics from 'shared/analytics';
import { CSV } from 'shared/utils';
import { JOBS } from 'jobs/slices';
import type { JobsState, JobsTab } from 'jobs/slices/jobs';
import { AUTO_REFRESH_OPTIONS, FILTER_ALL, JOB_TABS, SETUP_LINKS } from '../constants';
import type {
    ApexTestDetails,
    AsyncApexJob,
    BulkJob,
    BulkJobDetail,
    DetailState,
    FlexQueueJob,
    ScheduledJob,
    TabFilter,
    TabState,
} from '../types';

const {
    fetchScheduled,
    fetchAsyncApex,
    fetchMoreAsyncApex,
    fetchFlexQueue,
    fetchBulk,
    abortScheduled,
    fetchBulkJobDetail,
    abortBulkJob,
    fetchBulkJobResults,
    fetchApexTestDetails,
    setActiveTab,
    setAutoRefresh,
    setFilter,
    selectBulkJob,
    selectAsyncJob,
} = JOBS;

let _jobsBootstrapped = false;
let activeJobsApp: App | null = null;

function emptyTab<T>(): TabState<T> {
    return { isFetching: false, data: [], error: null, warnings: [], fetchedAt: null };
}

function emptyDetail<T>(): DetailState<T> {
    return { isFetching: false, data: null, error: null };
}

function emptyFilter(): TabFilter {
    return { search: '', status: FILTER_ALL };
}

function getJobStatus(job: ScheduledJob | AsyncApexJob | FlexQueueJob | BulkJob): string {
    return (
        (job as ScheduledJob).State ||
        (job as AsyncApexJob).Status ||
        (job as FlexQueueJob).Status ||
        (job as BulkJob).state ||
        ''
    );
}

function getStatusTone(status = '') {
    const normalized = status.toLowerCase();
    if (['completed', 'jobcomplete', 'waiting', 'queued'].includes(normalized)) return 'success';
    if (
        ['processing', 'preparing', 'inprogress', 'holding', 'uploadcomplete'].includes(normalized)
    ) {
        return 'warning';
    }
    if (['failed', 'aborted'].includes(normalized)) return 'error';
    return 'neutral';
}

function buildStatusOptions(records: Array<ScheduledJob | AsyncApexJob | FlexQueueJob | BulkJob>) {
    const statuses = Array.from(new Set(records.map(getJobStatus).filter(Boolean))).sort();
    return [
        { label: 'All statuses', value: FILTER_ALL },
        ...statuses.map(status => ({ label: status, value: status })),
    ];
}

function bootstrapJobsExtension() {
    if (_jobsBootstrapped) return;
    _jobsBootstrapped = true;
    injectReducer('jobs', JOBS.reduxSlice.reducer);

    registerCommand('jobs.open', () => {
        const target = `sftoolkit:${JSON.stringify({
            type: 'application',
            state: { applicationName: 'jobs' },
        })}`;
        return legacyStore.dispatch(legacyStore_application.navigate(target));
    });

    registerCommand('jobs.refresh', ({ tab }: { tab?: JobsTab } = {}) => {
        return activeJobsApp?.refreshCommand(tab) ?? { error: 'Jobs Monitor is not open.' };
    });

    registerCommand(
        'jobs.abort',
        ({ id, kind }: { id?: string; kind?: 'scheduled' | 'bulk' } = {}) => {
            return (
                activeJobsApp?.abortCommand({ id, kind }) ?? { error: 'Jobs Monitor is not open.' }
            );
        }
    );
}
bootstrapJobsExtension();

export default class App extends ToolkitElement {
    @track activeTab: JobsTab = 'scheduled';
    @track autoRefreshValue = '0';

    @track scheduledState = emptyTab<ScheduledJob>();
    @track asyncApexState = emptyTab<AsyncApexJob>();
    @track flexQueueState = emptyTab<FlexQueueJob>();
    @track bulkState = emptyTab<BulkJob>();
    @track filters: Record<JobsTab, TabFilter> = {
        scheduled: emptyFilter(),
        asyncApex: emptyFilter(),
        flexQueue: emptyFilter(),
        bulk: emptyFilter(),
    };
    @track selectedBulkJobId: string | null = null;
    @track selectedAsyncJobId: string | null = null;
    @track bulkDetail = emptyDetail<BulkJobDetail>();
    @track apexTestDetails = emptyDetail<ApexTestDetails>();
    @track failedPreviewOpen = false;
    @track failedPreviewLoading = false;
    @track failedPreviewError: string | null = null;
    @track failedPreviewColumns: Array<Record<string, unknown>> = [];
    @track failedPreviewRows: Array<Record<string, unknown>> = [];
    @track failedPreviewIsTruncated = false;

    _refreshTimer: ReturnType<typeof setInterval> | null = null;
    _ageTimer: ReturnType<typeof setInterval> | null = null;
    @track scheduledAge: string | null = null;
    @track asyncApexAge: string | null = null;
    @track flexQueueAge: string | null = null;
    @track bulkAge: string | null = null;

    tabs = JOB_TABS;
    autoRefreshOptions = AUTO_REFRESH_OPTIONS;
    setupLinks = SETUP_LINKS;

    connectedCallback() {
        activeJobsApp = this;
        Analytics.trackAppOpen('jobs', { alias: this.alias });
        this.refreshActiveTab();
        this._ageTimer = setInterval(() => this.updateAges(), 15000);
    }

    disconnectedCallback() {
        this.clearRefreshTimer();
        if (this._ageTimer) {
            clearInterval(this._ageTimer);
            this._ageTimer = null;
        }
        if (activeJobsApp === this) {
            activeJobsApp = null;
        }
    }

    @wire(connectStore, { store })
    storeChange({ jobs }: { jobs?: JobsState }) {
        if (!jobs) return;
        this.scheduledState = jobs.scheduled;
        this.asyncApexState = jobs.asyncApex;
        this.flexQueueState = jobs.flexQueue;
        this.bulkState = jobs.bulk;
        this.filters = jobs.filters;
        this.selectedBulkJobId = jobs.selectedBulkJobId;
        this.selectedAsyncJobId = jobs.selectedAsyncJobId;
        this.bulkDetail = jobs.bulkDetail;
        this.apexTestDetails = jobs.apexTestDetails;
        if (jobs.activeTab !== this.activeTab) {
            this.activeTab = jobs.activeTab;
        }
        this.updateAges();
    }

    updateAges = () => {
        this.scheduledAge = this.scheduledState.fetchedAt
            ? moment(this.scheduledState.fetchedAt).fromNow()
            : null;
        this.asyncApexAge = this.asyncApexState.fetchedAt
            ? moment(this.asyncApexState.fetchedAt).fromNow()
            : null;
        this.flexQueueAge = this.flexQueueState.fetchedAt
            ? moment(this.flexQueueState.fetchedAt).fromNow()
            : null;
        this.bulkAge = this.bulkState.fetchedAt ? moment(this.bulkState.fetchedAt).fromNow() : null;
    };

    handleSelectTab = (event: CustomEvent) => {
        const value = (event.target as HTMLElement & { value?: JobsTab })?.value;
        if (!value || value === this.activeTab) return;
        store.dispatch(setActiveTab({ tab: value }));
        this.refreshActiveTab();
    };

    handleRefreshClick = () => {
        this.refreshActiveTab();
    };

    handleSearchChange = (event: CustomEvent) => {
        const value = String((event.detail as { value?: string })?.value ?? '');
        store.dispatch(setFilter({ tab: this.activeTab, search: value }));
    };

    handleStatusFilterChange = (event: CustomEvent) => {
        const value = String((event.detail as { value?: string })?.value ?? FILTER_ALL);
        store.dispatch(setFilter({ tab: this.activeTab, status: value }));
    };

    handleSetupLinkClick = (event: Event) => {
        const url = (event.currentTarget as HTMLElement)?.dataset?.url;
        if (!url) return;
        legacyStore.dispatch(legacyStore_application.navigate(url));
    };

    handleAbortScheduled = async (event: CustomEvent) => {
        const id = (event.detail as { id?: string })?.id;
        if (!id) return;
        await this.abortScheduledJob(id);
    };

    async abortScheduledJob(id: string) {
        const confirmed = await LightningConfirm.open({
            variant: 'header',
            theme: 'warning',
            label: 'Abort scheduled job',
            message: `Abort CronTrigger ${id}? This cannot be undone.`,
        });
        if (!confirmed) return;
        const res = await store.dispatch(abortScheduled({ connector: this.connector, id }));
        if (abortScheduled.fulfilled.match(res)) {
            Toast.show({ label: 'Scheduled job aborted', variant: 'success' });
        } else {
            Toast.show({
                label: 'Failed to abort scheduled job',
                message: res.error?.message || 'Unknown error',
                variant: 'error',
                mode: 'sticky',
            });
        }
    }

    handleAutoRefreshChange = (event: CustomEvent) => {
        const value = String((event.detail as { value?: string })?.value ?? '0');
        this.autoRefreshValue = value;
        const ms = Number(value);
        store.dispatch(setAutoRefresh({ ms: ms > 0 ? ms : null }));
        this.clearRefreshTimer();
        if (ms > 0) {
            this._refreshTimer = setInterval(() => this.refreshActiveTab(), ms);
        }
    };

    handleLoadMoreAsyncApex = () => {
        if (!this.connector) return;
        store.dispatch(
            fetchMoreAsyncApex({
                connector: this.connector,
                offset: this.asyncApexState.offset ?? this.asyncApexState.data.length,
            })
        );
    };

    handleSelectBulk = async (event: CustomEvent) => {
        const id = (event.detail as { id?: string })?.id;
        if (!id || !this.connector) return;
        store.dispatch(selectBulkJob({ id }));
        this.failedPreviewOpen = false;
        await store.dispatch(fetchBulkJobDetail({ connector: this.connector, id }));
    };

    handleSelectAsync = async (event: CustomEvent) => {
        const id = (event.detail as { id?: string })?.id;
        if (!id || !this.connector) return;
        store.dispatch(selectAsyncJob({ id }));
        await store.dispatch(fetchApexTestDetails({ connector: this.connector, jobId: id }));
    };

    handleRefreshSelectedBulk = async () => {
        if (!this.connector || !this.selectedBulkJobId) return;
        await store.dispatch(
            fetchBulkJobDetail({ connector: this.connector, id: this.selectedBulkJobId })
        );
    };

    handleAbortSelectedBulk = async () => {
        if (!this.connector || !this.selectedBulkJobId) return;
        const confirmed = await LightningConfirm.open({
            variant: 'header',
            theme: 'warning',
            label: 'Abort Bulk job',
            message: `Abort Bulk ingest job ${this.selectedBulkJobId}? This cannot be undone.`,
        });
        if (!confirmed) return;
        const res = await store.dispatch(
            abortBulkJob({ connector: this.connector, id: this.selectedBulkJobId })
        );
        if (abortBulkJob.fulfilled.match(res)) {
            Toast.show({ label: 'Bulk job aborted', variant: 'success' });
            await this.handleRefreshSelectedBulk();
        } else {
            Toast.show({
                label: 'Failed to abort Bulk job',
                message: res.error?.message || 'Unknown error',
                variant: 'error',
                mode: 'sticky',
            });
        }
    };

    handleDownloadSuccess = async () => {
        await this.downloadBulkResults('successful');
    };

    handleDownloadFailed = async () => {
        await this.downloadBulkResults('failed');
    };

    handleDownloadUnprocessed = async () => {
        await this.downloadBulkResults('unprocessed');
    };

    handlePreviewFailed = async () => {
        if (!this.connector || !this.selectedBulkJobId) return;
        this.failedPreviewOpen = true;
        this.failedPreviewLoading = true;
        this.failedPreviewError = null;
        this.failedPreviewRows = [];
        this.failedPreviewColumns = [];
        this.failedPreviewIsTruncated = false;
        const res = await store.dispatch(
            fetchBulkJobResults({
                connector: this.connector,
                id: this.selectedBulkJobId,
                resultType: 'failed',
            })
        );
        if (fetchBulkJobResults.fulfilled.match(res)) {
            try {
                this.buildFailedPreview(String(res.payload.text || ''));
            } catch (err) {
                this.failedPreviewError = err instanceof Error ? err.message : String(err);
            }
        } else {
            this.failedPreviewError = res.error?.message || 'Failed to load failed results.';
        }
        this.failedPreviewLoading = false;
    };

    handleCloseFailedPreview = () => {
        this.failedPreviewOpen = false;
    };

    async downloadBulkResults(resultType: 'successful' | 'failed' | 'unprocessed') {
        if (!this.connector || !this.selectedBulkJobId) return;
        const res = await store.dispatch(
            fetchBulkJobResults({
                connector: this.connector,
                id: this.selectedBulkJobId,
                resultType,
            })
        );
        if (fetchBulkJobResults.fulfilled.match(res)) {
            this.downloadText(
                `${this.selectedBulkJobId}-${resultType}-results.csv`,
                String(res.payload.text || ''),
                'text/csv'
            );
        } else {
            Toast.show({
                label: 'Failed to download Bulk results',
                message: res.error?.message || 'Unknown error',
                variant: 'error',
                mode: 'sticky',
            });
        }
    }

    clearRefreshTimer() {
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }

    refreshActiveTab() {
        const connector = this.connector;
        if (!connector) return;
        switch (this.activeTab) {
            case 'scheduled':
                store.dispatch(fetchScheduled({ connector }));
                break;
            case 'asyncApex':
                store.dispatch(fetchAsyncApex({ connector }));
                break;
            case 'flexQueue':
                store.dispatch(fetchFlexQueue({ connector }));
                break;
            case 'bulk':
                store.dispatch(fetchBulk({ connector }));
                break;
        }
    }

    refreshCommand(tab?: JobsTab) {
        if (tab && tab !== this.activeTab) {
            store.dispatch(setActiveTab({ tab }));
        }
        this.refreshActiveTab();
        return { result: `Refreshing ${tab || this.activeTab} jobs.` };
    }

    async abortCommand({ id, kind }: { id?: string; kind?: 'scheduled' | 'bulk' }) {
        if (!id) return { error: 'Missing job id.' };
        if (kind === 'bulk') {
            store.dispatch(selectBulkJob({ id }));
            await this.handleAbortSelectedBulk();
            return { result: `Abort requested for Bulk job ${id}.` };
        }
        await this.abortScheduledJob(id);
        return { result: `Abort requested for scheduled job ${id}.` };
    }

    buildFailedPreview(csv: string) {
        const trimmed = csv.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            throw new Error(
                'Failed results preview is not a CSV file. Use Download Failed instead.'
            );
        }
        const parsed = CSV.parseCsvText(csv, { delimiter: '' });
        if (parsed?.error && !(parsed?.rows?.length || 0)) {
            throw new Error(String(parsed.error));
        }
        const headers = (parsed?.headers || []).slice(0, 5);
        const rows = (parsed?.rows || []).slice(0, 200);
        this.failedPreviewIsTruncated = (parsed?.rows?.length || 0) > rows.length;
        this.failedPreviewColumns = headers.map(header => ({
            label: header,
            fieldName: header,
            type: 'text',
            wrapText: true,
        }));
        this.failedPreviewRows = rows.map((row, index) => ({ key: `failed-${index}`, ...row }));
    }

    downloadText(name: string, text: string, contentType: string) {
        const blob = new Blob([text], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    get isScheduledActive() {
        return this.activeTab === 'scheduled';
    }
    get isAsyncApexActive() {
        return this.activeTab === 'asyncApex';
    }
    get isFlexQueueActive() {
        return this.activeTab === 'flexQueue';
    }
    get isBulkActive() {
        return this.activeTab === 'bulk';
    }

    get activeAge() {
        if (this.isScheduledActive) return this.scheduledAge;
        if (this.isAsyncApexActive) return this.asyncApexAge;
        if (this.isFlexQueueActive) return this.flexQueueAge;
        return this.bulkAge;
    }

    get isRefreshing() {
        if (this.isScheduledActive) return this.scheduledState.isFetching;
        if (this.isAsyncApexActive) return this.asyncApexState.isFetching;
        if (this.isFlexQueueActive) return this.flexQueueState.isFetching;
        return this.bulkState.isFetching;
    }

    get isRefreshDisabled() {
        return this.isRefreshing;
    }

    get activeError() {
        if (this.isScheduledActive) return this.scheduledState.error;
        if (this.isAsyncApexActive) return this.asyncApexState.error;
        if (this.isFlexQueueActive) return this.flexQueueState.error;
        return this.bulkState.error;
    }

    get activeWarnings() {
        if (this.isScheduledActive) return this.scheduledState.warnings;
        if (this.isAsyncApexActive) return this.asyncApexState.warnings;
        if (this.isFlexQueueActive) return this.flexQueueState.warnings;
        return this.bulkState.warnings;
    }

    get hasActiveWarnings() {
        return this.activeWarnings.length > 0;
    }

    get activeFilter() {
        return this.filters[this.activeTab] || emptyFilter();
    }

    get activeSearchValue() {
        return this.activeFilter.search;
    }

    get activeStatusValue() {
        return this.activeFilter.status;
    }

    get activeStatusOptions() {
        return buildStatusOptions(this.activeRecords);
    }

    get activeRecords(): Array<ScheduledJob | AsyncApexJob | FlexQueueJob | BulkJob> {
        if (this.isScheduledActive) return this.scheduledState.data;
        if (this.isAsyncApexActive) return this.asyncApexState.data;
        if (this.isFlexQueueActive) return this.flexQueueState.data;
        return this.bulkState.data;
    }

    get activeTotal() {
        return this.activeRecords.length;
    }

    get activeStatusSummary() {
        const counts = this.activeRecords.reduce(
            (acc, record) => {
                const status = getJobStatus(record) || 'Unknown';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>
        );
        return Object.entries(counts)
            .slice(0, 4)
            .map(([status, count]) => ({
                status,
                count,
                className: `jobs-status-pill jobs-status-pill_${getStatusTone(status)}`,
            }));
    }

    get hasStatusSummary() {
        return this.activeStatusSummary.length > 0;
    }

    get bulkDetailRows() {
        const detail = this.bulkDetail.data;
        if (!detail) return [];
        return [
            { label: 'State', value: detail.state || 'Unknown' },
            { label: 'Object', value: detail.object || '-' },
            { label: 'Operation', value: detail.operation || '-' },
            { label: 'Processed', value: String(detail.numberRecordsProcessed ?? 0) },
            { label: 'Failed', value: String(detail.numberRecordsFailed ?? 0) },
        ];
    }

    get hasBulkSelection() {
        return Boolean(this.selectedBulkJobId);
    }

    get canAbortSelectedBulk() {
        const state = this.bulkDetail.data?.state;
        return Boolean(
            this.selectedBulkJobId && state && !['JobComplete', 'Failed', 'Aborted'].includes(state)
        );
    }

    get canUseBulkResults() {
        return Boolean(this.selectedBulkJobId && this.bulkDetail.data?.state === 'JobComplete');
    }

    get isBulkResultsDisabled() {
        return !this.canUseBulkResults;
    }

    get isAbortSelectedBulkDisabled() {
        return !this.canAbortSelectedBulk;
    }

    get hasFailedPreviewRows() {
        return this.failedPreviewRows.length > 0;
    }

    get hasApexTestSelection() {
        return Boolean(this.selectedAsyncJobId);
    }

    get apexTestSummaryText() {
        const summary = this.apexTestDetails.data?.summary;
        if (!summary) return 'No Apex test run summary found for this job.';
        return `Status: ${summary.Status || 'Unknown'} • Completed: ${
            summary.NumberTestsCompleted ?? 0
        }/${summary.NumberTestsTotal ?? 0} • Errors: ${summary.NumberTestErrors ?? 0}`;
    }

    get apexTestResultRows() {
        return (this.apexTestDetails.data?.results || []).map((result, index) => ({
            key: result.Id || `result-${index}`,
            className: result.ApexClass?.Name || result.ApexClassId || '',
            methodName: result.MethodName || '',
            outcome: result.Outcome || '',
            message: result.Message || '',
            stackTrace: result.StackTrace || '',
        }));
    }

    get apexTestResultColumns() {
        return [
            { label: 'Class', fieldName: 'className', type: 'text' },
            { label: 'Method', fieldName: 'methodName', type: 'text' },
            { label: 'Outcome', fieldName: 'outcome', type: 'text' },
            { label: 'Message', fieldName: 'message', type: 'text', wrapText: true },
            { label: 'Stack Trace', fieldName: 'stackTrace', type: 'text', wrapText: true },
        ];
    }

    get hasApexTestResults() {
        return this.apexTestResultRows.length > 0;
    }
}
