import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    reduxSlice,
    fetchScheduled,
    fetchAsyncApex,
    fetchFlexQueue,
    fetchBulk,
    abortScheduled,
    setActiveTab,
    setAutoRefresh,
} from '../slices/jobs.ts';
import { FLEX_QUEUE_SOQL } from '../constants.ts';
import { nextRenderLimit, renderedRows } from '../tableUtils.ts';

const { reducer } = reduxSlice;

function initial() {
    return reducer(undefined, { type: '@@INIT' });
}

test('jobs: initial state has three empty tabs and active=scheduled', () => {
    const s = initial();
    assert.equal(s.activeTab, 'scheduled');
    assert.equal(s.autoRefreshMs, null);
    assert.deepEqual(s.scheduled.data, []);
    assert.deepEqual(s.asyncApex.data, []);
    assert.deepEqual(s.flexQueue.data, []);
    assert.deepEqual(s.bulk.data, []);
});

test('jobs: setActiveTab switches the active tab', () => {
    const s = reducer(initial(), setActiveTab({ tab: 'bulk' }));
    assert.equal(s.activeTab, 'bulk');
});

test('jobs: setAutoRefresh stores interval', () => {
    const s = reducer(initial(), setAutoRefresh({ ms: 15000 }));
    assert.equal(s.autoRefreshMs, 15000);
    const cleared = reducer(s, setAutoRefresh({ ms: null }));
    assert.equal(cleared.autoRefreshMs, null);
});

test('jobs: fetchScheduled lifecycle populates data', () => {
    const pending = reducer(initial(), fetchScheduled.pending('req-1', { connector: {} as any }));
    assert.equal(pending.scheduled.isFetching, true);

    const records = [{ Id: '08e000', CronJobDetail: { Name: 'Job A' }, State: 'WAITING' }];
    const fulfilled = reducer(
        pending,
        fetchScheduled.fulfilled({ records }, 'req-1', { connector: {} as any })
    );
    assert.equal(fulfilled.scheduled.isFetching, false);
    assert.equal(fulfilled.scheduled.data.length, 1);
    assert.equal(fulfilled.scheduled.data[0].Id, '08e000');
    assert.ok(fulfilled.scheduled.fetchedAt);
});

test('jobs: fetchAsyncApex rejected captures error', () => {
    const rejected = reducer(
        initial(),
        fetchAsyncApex.rejected(new Error('boom'), 'req-2', { connector: {} as any })
    );
    assert.equal(rejected.asyncApex.isFetching, false);
    assert.equal(rejected.asyncApex.error, 'boom');
});

test('jobs: flex queue query avoids unsupported Status field', async () => {
    assert.equal(FLEX_QUEUE_SOQL.includes('Status'), false);
    assert.match(FLEX_QUEUE_SOQL, /WHERE JobType = 'BatchApex'/);
    let query = '';
    const connector = {
        conn: {
            query: async (soql: string) => {
                query = soql;
                return {
                    records: [
                        {
                            Id: '0Ha000000000001',
                            AsyncApexJobId: '707000000000001',
                            JobType: 'BatchApex',
                            JobPosition: 1,
                        },
                    ],
                };
            },
        },
    };

    const action = await fetchFlexQueue({ connector: connector as any })(
        () => undefined,
        () => initial(),
        undefined
    );

    assert.equal(action.type, fetchFlexQueue.fulfilled.type);
    assert.equal(query.includes('Status'), false);
    assert.match(query, /WHERE JobType = 'BatchApex'/);
    assert.equal(action.payload.records[0].Status, 'Queued');
});

test('jobs: fetchBulk fulfilled populates bulk tab', () => {
    const records = [{ id: '7501', _kind: 'ingest', state: 'JobComplete' }];
    const s = reducer(
        initial(),
        fetchBulk.fulfilled({ records, warnings: ['Bulk query jobs failed'] }, 'req-3', {
            connector: {} as any,
        })
    );
    assert.equal(s.bulk.data.length, 1);
    assert.equal(s.bulk.data[0]._kind, 'ingest');
    assert.deepEqual(s.bulk.warnings, ['Bulk query jobs failed']);
});

test('jobs: stores filters per tab without losing other filters', () => {
    let s = reducer(initial(), {
        type: 'jobs/setFilter',
        payload: { tab: 'scheduled', search: 'cleanup', status: 'WAITING' },
    });
    s = reducer(s, {
        type: 'jobs/setFilter',
        payload: { tab: 'bulk', search: 'Account' },
    });
    assert.equal(s.filters.scheduled.search, 'cleanup');
    assert.equal(s.filters.scheduled.status, 'WAITING');
    assert.equal(s.filters.bulk.search, 'Account');
    assert.equal(s.filters.bulk.status, 'all');
});

test('jobs: table rendering starts with a bounded row count', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({ id: index }));
    assert.equal(renderedRows(rows, 200).length, 200);
    assert.equal(nextRenderLimit(200, rows.length), 400);
    assert.equal(nextRenderLimit(4900, rows.length), 5000);
});

test('jobs: fetchBulk follows nextRecordsUrl and preserves partial warnings', async () => {
    const calls: string[] = [];
    const connector = {
        conn: {
            version: '64.0',
            request: async ({ url }: { url: string }) => {
                calls.push(url);
                if (url === '/services/data/v64.0/jobs/ingest') {
                    return {
                        records: [
                            {
                                id: '750A',
                                state: 'JobComplete',
                                createdDate: '2026-01-01T00:00:00.000Z',
                            },
                        ],
                        nextRecordsUrl: '/services/data/v64.0/jobs/ingest?page=2',
                    };
                }
                if (url === '/services/data/v64.0/jobs/ingest?page=2') {
                    return {
                        records: [
                            {
                                id: '750B',
                                state: 'InProgress',
                                createdDate: '2026-01-02T00:00:00.000Z',
                            },
                        ],
                    };
                }
                if (url === '/services/data/v64.0/jobs/query') {
                    throw new Error('query endpoint blocked');
                }
                throw new Error(`Unexpected URL ${url}`);
            },
        },
    };

    const action = await fetchBulk({ connector: connector as any })(
        () => undefined,
        () => initial(),
        undefined
    );

    assert.equal(action.type, fetchBulk.fulfilled.type);
    assert.deepEqual(
        action.payload.records.map((record: any) => record.id),
        ['750B', '750A']
    );
    assert.deepEqual(action.payload.warnings, ['Bulk query jobs failed: query endpoint blocked']);
    assert.deepEqual(calls, [
        '/services/data/v64.0/jobs/ingest',
        '/services/data/v64.0/jobs/query',
        '/services/data/v64.0/jobs/ingest?page=2',
    ]);
});

test('jobs: selected bulk job detail is stored separately from list data', () => {
    let s = reducer(initial(), {
        type: 'jobs/selectBulkJob',
        payload: { id: '750A' },
    });
    assert.equal(s.selectedBulkJobId, '750A');

    s = reducer(s, {
        type: 'jobs/fetchBulkJobDetail/fulfilled',
        payload: { detail: { id: '750A', state: 'JobComplete', numberRecordsProcessed: 10 } },
    });
    assert.equal(s.bulkDetail.data.id, '750A');
    assert.equal(s.bulkDetail.data.numberRecordsProcessed, 10);
});

test('jobs: abortScheduled.fulfilled removes the row from scheduled', () => {
    let s = reducer(
        initial(),
        fetchScheduled.fulfilled(
            {
                records: [
                    { Id: '08eAAA', CronJobDetail: { Name: 'A' } },
                    { Id: '08eBBB', CronJobDetail: { Name: 'B' } },
                ],
            },
            'req-4',
            { connector: {} as any }
        )
    );
    s = reducer(
        s,
        abortScheduled.fulfilled({ id: '08eAAA' }, 'req-5', { connector: {} as any, id: '08eAAA' })
    );
    assert.equal(s.scheduled.data.length, 1);
    assert.equal(s.scheduled.data[0].Id, '08eBBB');
});
