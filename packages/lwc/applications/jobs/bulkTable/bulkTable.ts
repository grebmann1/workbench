import { LightningElement, api, track } from 'lwc';
import {
    INITIAL_RENDER_LIMIT,
    matchesFilter,
    nextRenderLimit,
    renderedRows,
    statusBadgeClass,
} from '../tableUtils';
import type { BulkJob, TabFilter, TabState } from '../types';

interface BulkRow {
    id: string;
    kind: string;
    operation: string;
    object: string;
    state: string;
    stateClass: string;
    numberRecordsProcessed: number | string;
    numberRecordsFailed: number | string;
    createdDate: string;
    systemModstamp: string;
    canSelect: boolean;
    isSelectDisabled: boolean;
}

export default class BulkTable extends LightningElement {
    _state: TabState<BulkJob> = {
        isFetching: false,
        data: [],
        error: null,
        warnings: [],
        fetchedAt: null,
    };
    _filter: TabFilter = { search: '', status: 'all' };
    @track rows: BulkRow[] = [];
    @track renderLimit = INITIAL_RENDER_LIMIT;

    @api
    get state(): TabState<BulkJob> {
        return this._state;
    }
    set state(value: TabState<BulkJob>) {
        this._state = value || this._state;
        this.renderLimit = INITIAL_RENDER_LIMIT;
        this.rows = (this._state.data || []).map(r => ({
            id: r.id,
            kind: r._kind,
            operation: r.operation || '',
            object: r.object || '',
            state: r.state || '',
            stateClass: statusBadgeClass(r.state),
            numberRecordsProcessed: r.numberRecordsProcessed ?? '',
            numberRecordsFailed: r.numberRecordsFailed ?? '',
            createdDate: r.createdDate || '',
            systemModstamp: r.systemModstamp || '',
            canSelect: r._kind === 'ingest',
            isSelectDisabled: r._kind !== 'ingest',
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
                [row.id, row.kind, row.operation, row.object, row.state],
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

    handleSelect = (event: Event) => {
        const id = (event.currentTarget as HTMLElement)?.dataset?.id;
        if (id) {
            this.dispatchEvent(new CustomEvent('select', { detail: { id } }));
        }
    };

    handleShowMore = () => {
        this.renderLimit = nextRenderLimit(this.renderLimit, this.visibleRows.length);
    };
}
