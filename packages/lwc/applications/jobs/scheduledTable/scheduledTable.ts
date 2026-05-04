import { LightningElement, api, track } from 'lwc';
import {
    INITIAL_RENDER_LIMIT,
    matchesFilter,
    nextRenderLimit,
    renderedRows,
    statusBadgeClass,
} from '../tableUtils';
import type { ScheduledJob, TabFilter, TabState } from '../types';

interface ScheduledRow {
    id: string;
    name: string;
    jobType: string;
    state: string;
    stateClass: string;
    cronExpression: string;
    nextFireTime: string;
    previousFireTime: string;
    timesTriggered: number | string;
}

export default class ScheduledTable extends LightningElement {
    _state: TabState<ScheduledJob> = {
        isFetching: false,
        data: [],
        error: null,
        warnings: [],
        fetchedAt: null,
    };
    _filter: TabFilter = { search: '', status: 'all' };
    @track rows: ScheduledRow[] = [];
    @track renderLimit = INITIAL_RENDER_LIMIT;

    @api
    get state(): TabState<ScheduledJob> {
        return this._state;
    }
    set state(value: TabState<ScheduledJob>) {
        this._state = value || this._state;
        this.renderLimit = INITIAL_RENDER_LIMIT;
        this.rows = (this._state.data || []).map(r => ({
            id: r.Id,
            name: r.CronJobDetail?.Name || r.Id,
            jobType: r.CronJobDetail?.JobType || '',
            state: r.State || '',
            stateClass: statusBadgeClass(r.State),
            cronExpression: r.CronExpression || '',
            nextFireTime: r.NextFireTime || '',
            previousFireTime: r.PreviousFireTime || '',
            timesTriggered: r.TimesTriggered ?? '',
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
                [row.id, row.name, row.jobType, row.state, row.cronExpression],
                row.state,
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

    handleAbort = (event: Event) => {
        const id = (event.currentTarget as HTMLElement)?.dataset?.id;
        if (id) {
            this.dispatchEvent(new CustomEvent('abort', { detail: { id } }));
        }
    };

    handleShowMore = () => {
        this.renderLimit = nextRenderLimit(this.renderLimit, this.visibleRows.length);
    };
}
