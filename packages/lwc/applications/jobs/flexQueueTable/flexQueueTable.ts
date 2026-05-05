import { LightningElement, api, track } from 'lwc';
import {
    INITIAL_RENDER_LIMIT,
    matchesFilter,
    nextRenderLimit,
    renderedRows,
    statusBadgeClass,
} from '../tableUtils';
import type { FlexQueueJob, TabFilter, TabState } from '../types';

interface FlexQueueRow {
    id: string;
    asyncApexJobId: string;
    jobType: string;
    jobPosition: number | string;
    status: string;
    statusClass: string;
}

export default class FlexQueueTable extends LightningElement {
    _state: TabState<FlexQueueJob> = {
        isFetching: false,
        data: [],
        error: null,
        warnings: [],
        fetchedAt: null,
    };
    _filter: TabFilter = { search: '', status: 'all' };
    @track rows: FlexQueueRow[] = [];
    @track renderLimit = INITIAL_RENDER_LIMIT;

    @api
    get state(): TabState<FlexQueueJob> {
        return this._state;
    }
    set state(value: TabState<FlexQueueJob>) {
        this._state = value || this._state;
        this.renderLimit = INITIAL_RENDER_LIMIT;
        this.rows = (this._state.data || []).map(r => ({
            id: r.Id,
            asyncApexJobId: r.AsyncApexJobId || '',
            jobType: r.JobType || '',
            jobPosition: r.JobPosition ?? '',
            status: r.Status || '',
            statusClass: statusBadgeClass(r.Status),
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

    get visibleRows() {
        return this.rows.filter(row =>
            matchesFilter(
                [row.id, row.asyncApexJobId, row.jobType, row.jobPosition, row.status],
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

    handleShowMore = () => {
        this.renderLimit = nextRenderLimit(this.renderLimit, this.visibleRows.length);
    };
}
