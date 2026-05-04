import { LightningElement, api, track } from 'lwc';
import {
    INITIAL_RENDER_LIMIT,
    matchesFilter,
    nextRenderLimit,
    renderedRows,
    statusBadgeClass,
} from '../tableUtils';
import type { AsyncApexJob, TabFilter, TabState } from '../types';

interface AsyncApexRow {
    id: string;
    className: string;
    methodName: string;
    jobType: string;
    status: string;
    statusClass: string;
    progress: string;
    numberOfErrors: number | string;
    createdDate: string;
    completedDate: string;
    extendedStatus: string;
    canDrilldown: boolean;
    isDrilldownDisabled: boolean;
}

export default class AsyncApexTable extends LightningElement {
    _state: TabState<AsyncApexJob> = {
        isFetching: false,
        data: [],
        error: null,
        warnings: [],
        fetchedAt: null,
    };
    _filter: TabFilter = { search: '', status: 'all' };
    @track rows: AsyncApexRow[] = [];
    @track renderLimit = INITIAL_RENDER_LIMIT;

    @api
    get state(): TabState<AsyncApexJob> {
        return this._state;
    }
    set state(value: TabState<AsyncApexJob>) {
        this._state = value || this._state;
        this.renderLimit = INITIAL_RENDER_LIMIT;
        this.rows = (this._state.data || []).map(r => ({
            id: r.Id,
            className: r.ApexClass?.Name || '',
            methodName: r.MethodName || '',
            jobType: r.JobType || '',
            status: r.Status || '',
            statusClass: statusBadgeClass(r.Status),
            progress:
                r.TotalJobItems != null
                    ? `${r.JobItemsProcessed ?? 0} / ${r.TotalJobItems}`
                    : `${r.JobItemsProcessed ?? 0}`,
            numberOfErrors: r.NumberOfErrors ?? '',
            createdDate: r.CreatedDate || '',
            completedDate: r.CompletedDate || '',
            extendedStatus: r.ExtendedStatus || '',
            canDrilldown: r.JobType === 'TestRequest' || r.JobType === 'ApexTestQueueItem',
            isDrilldownDisabled: !(
                r.JobType === 'TestRequest' || r.JobType === 'ApexTestQueueItem'
            ),
        }));
    }

    @api
    get filter(): TabFilter {
        return this._filter;
    }
    set filter(value: TabFilter) {
        this._filter = value || this._filter;
        this.renderLimit = INITIAL_RENDER_LIMIT;
    }

    get isLoading() {
        return this._state.isFetching;
    }

    get isEmpty() {
        return !this.isLoading && this.visibleRows.length === 0;
    }

    get hasMore() {
        return Boolean(this._state.hasMore);
    }

    get visibleRows() {
        return this.rows.filter(row =>
            matchesFilter(
                [
                    row.id,
                    row.className,
                    row.methodName,
                    row.jobType,
                    row.status,
                    row.extendedStatus,
                ],
                row.status,
                this._filter
            )
        );
    }

    get renderedRows() {
        return renderedRows(this.visibleRows, this.renderLimit);
    }

    get hasMoreRows() {
        return this.visibleRows.length > this.renderedRows.length;
    }

    get visibleRowCount() {
        return this.visibleRows.length;
    }

    get renderedRowCount() {
        return this.renderedRows.length;
    }

    handleSelect = (event: Event) => {
        const id = (event.currentTarget as HTMLElement)?.dataset?.id;
        if (id) {
            this.dispatchEvent(new CustomEvent('select', { detail: { id } }));
        }
    };

    handleLoadMore = () => {
        this.dispatchEvent(new CustomEvent('loadmore'));
    };

    handleShowMore = () => {
        this.renderLimit = nextRenderLimit(this.renderLimit, this.visibleRows.length);
    };
}
