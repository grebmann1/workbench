import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    reduxSlice,
    executeQuery,
    querySelectors,
    parseVariables,
    resolveApiVersion,
} from '../slices/query.ts';

const { reducer, actions } = reduxSlice;

function initial() {
    return reducer(undefined, { type: '@@INIT' });
}

test('graphql/query: pending marks fetching and resets data', () => {
    const state = reducer(
        initial(),
        executeQuery.pending('req-1', {
            connector: {} as any,
            query: '{ me }',
            variables: '{}',
            tabId: 'TAB-A',
            createdDate: 100,
        })
    );
    const entry = querySelectors.selectById({ graphqlQuery: state }, 'tab-a');
    assert.ok(entry);
    assert.equal(entry.isFetching, true);
    assert.equal(entry.data, null);
    assert.equal(entry.createdDate, 100);
});

test('graphql/query: fulfilled stores data and errors', () => {
    let state = reducer(
        initial(),
        executeQuery.pending('req-2', {
            connector: {} as any,
            query: '{ me }',
            variables: '{}',
            tabId: 'TAB-B',
            createdDate: 100,
        })
    );
    state = reducer(
        state,
        executeQuery.fulfilled(
            {
                tabId: 'TAB-B',
                createdDate: 100,
                took: 42,
                data: { uiapi: { query: { Account: { edges: [] } } } },
                errors: null,
            },
            'req-2',
            {
                connector: {} as any,
                query: '{ me }',
                variables: '{}',
                tabId: 'TAB-B',
                createdDate: 100,
            }
        )
    );
    const entry = querySelectors.selectById({ graphqlQuery: state }, 'tab-b');
    assert.equal(entry.isFetching, false);
    assert.equal(entry.took, 42);
    assert.deepEqual(entry.data, { uiapi: { query: { Account: { edges: [] } } } });
    assert.equal(entry.errors, null);
});

test('graphql/query: fulfilled preserves errors alongside data (GraphQL convention)', () => {
    const state = reducer(
        initial(),
        executeQuery.fulfilled(
            {
                tabId: 'TAB-C',
                createdDate: 200,
                took: 10,
                data: { partial: true },
                errors: [{ message: 'Field X not found', path: ['foo'] }],
            },
            'req-3',
            {
                connector: {} as any,
                query: '{ partial }',
                variables: '{}',
                tabId: 'TAB-C',
                createdDate: 200,
            }
        )
    );
    const entry = querySelectors.selectById({ graphqlQuery: state }, 'tab-c');
    assert.equal(entry.errors.length, 1);
    assert.equal(entry.errors[0].message, 'Field X not found');
    assert.deepEqual(entry.data, { partial: true });
});

test('graphql/query: rejected stores error and clears fetching', () => {
    const state = reducer(
        initial(),
        executeQuery.rejected(new Error('network down'), 'req-4', {
            connector: {} as any,
            query: '{ me }',
            variables: '{}',
            tabId: 'TAB-D',
            createdDate: 0,
        })
    );
    const entry = querySelectors.selectById({ graphqlQuery: state }, 'tab-d');
    assert.equal(entry.isFetching, false);
    assert.equal(entry.error.message, 'network down');
});

test('graphql/query: rejected with AbortError clears fetching and leaves no error', () => {
    const abortErr: any = new Error('Aborted');
    abortErr.name = 'AbortError';
    const state = reducer(
        initial(),
        executeQuery.rejected(abortErr, 'req-5', {
            connector: {} as any,
            query: '{ me }',
            variables: '{}',
            tabId: 'TAB-E',
            createdDate: 0,
        })
    );
    const entry = querySelectors.selectById({ graphqlQuery: state }, 'tab-e');
    assert.equal(entry.isFetching, false);
    assert.equal(entry.error, null);
});

test('graphql/query: clearQuery removes the tab entry', () => {
    let state = reducer(
        initial(),
        executeQuery.fulfilled(
            {
                tabId: 'TAB-F',
                createdDate: 0,
                took: 1,
                data: { ok: 1 },
                errors: null,
            },
            'req-6',
            {
                connector: {} as any,
                query: '{ ok }',
                variables: '{}',
                tabId: 'TAB-F',
                createdDate: 0,
            }
        )
    );
    assert.ok(querySelectors.selectById({ graphqlQuery: state }, 'tab-f'));
    state = reducer(state, actions.clearQuery({ tabId: 'TAB-F' }));
    assert.equal(querySelectors.selectById({ graphqlQuery: state }, 'tab-f'), undefined);
});

test('graphql/query: parseVariables accepts empty input as {}', () => {
    assert.deepEqual(parseVariables(''), {});
    assert.deepEqual(parseVariables('   '), {});
    assert.deepEqual(parseVariables(null), {});
    assert.deepEqual(parseVariables(undefined), {});
});

test('graphql/query: parseVariables rejects arrays and primitives', () => {
    assert.throws(() => parseVariables('[1,2,3]'), /JSON object/);
    assert.throws(() => parseVariables('42'), /JSON object/);
    assert.throws(() => parseVariables('"string"'), /JSON object/);
    assert.throws(() => parseVariables('null'), /JSON object/);
});

test('graphql/query: parseVariables surfaces JSON parse error', () => {
    assert.throws(() => parseVariables('{ not json }'), /Variables JSON is invalid/);
});

test('graphql/query: resolveApiVersion falls back when missing', () => {
    assert.equal(resolveApiVersion({} as any), '64.0');
    assert.equal(resolveApiVersion({ conn: {} } as any), '64.0');
    assert.equal(resolveApiVersion({ conn: { version: '' } } as any), '64.0');
    assert.equal(resolveApiVersion({ conn: { version: '62.0' } } as any), '62.0');
});
