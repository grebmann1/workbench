import assert from 'node:assert/strict';
import { test } from 'node:test';

import { statusTone, statusBadgeClass, matchesFilter } from '../tableUtils.ts';
import { FILTER_ALL } from '../constants.ts';

test('statusTone: returns success for completed/jobcomplete/waiting/queued (case-insensitive)', () => {
    assert.equal(statusTone('Completed'), 'success');
    assert.equal(statusTone('JobComplete'), 'success');
    assert.equal(statusTone('WAITING'), 'success');
    assert.equal(statusTone('queued'), 'success');
});

test('statusTone: returns warning for processing/preparing/inprogress/holding/uploadcomplete (case-insensitive)', () => {
    assert.equal(statusTone('Processing'), 'warning');
    assert.equal(statusTone('PREPARING'), 'warning');
    assert.equal(statusTone('InProgress'), 'warning');
    assert.equal(statusTone('holding'), 'warning');
    assert.equal(statusTone('UploadComplete'), 'warning');
});

test('statusTone: returns error for failed/aborted (case-insensitive)', () => {
    assert.equal(statusTone('Failed'), 'error');
    assert.equal(statusTone('ABORTED'), 'error');
});

test('statusTone: returns neutral for unknown status and default empty status', () => {
    assert.equal(statusTone('SomethingElse'), 'neutral');
    assert.equal(statusTone(), 'neutral');
    assert.equal(statusTone(''), 'neutral');
});

test('statusBadgeClass: composes the badge class from statusTone', () => {
    assert.equal(statusBadgeClass('Completed'), 'jobs-table-badge jobs-table-badge_success');
    assert.equal(statusBadgeClass('Processing'), 'jobs-table-badge jobs-table-badge_warning');
    assert.equal(statusBadgeClass('Failed'), 'jobs-table-badge jobs-table-badge_error');
    assert.equal(statusBadgeClass('Unknown'), 'jobs-table-badge jobs-table-badge_neutral');
    assert.equal(statusBadgeClass(), 'jobs-table-badge jobs-table-badge_neutral');
});

test('matchesFilter: returns true when filter is entirely undefined', () => {
    assert.equal(matchesFilter(['Account', 'Cleanup'], 'WAITING', undefined), true);
});

test('matchesFilter: returns false when status filter does not match', () => {
    const result = matchesFilter(['Account'], 'WAITING', { search: '', status: 'FAILED' });
    assert.equal(result, false);
});

test('matchesFilter: returns true when status filter is FILTER_ALL regardless of status', () => {
    const result = matchesFilter(['Account'], 'WAITING', { search: '', status: FILTER_ALL });
    assert.equal(result, true);
});

test('matchesFilter: returns true when there is no search term', () => {
    assert.equal(matchesFilter(['Account'], 'WAITING', { status: FILTER_ALL }), true);
    assert.equal(
        matchesFilter(['Account'], 'WAITING', { search: '   ', status: FILTER_ALL }),
        true
    );
});

test('matchesFilter: matches when any value includes the search term (case-insensitive)', () => {
    const result = matchesFilter(['Account Cleanup', 'Some Other Job'], 'WAITING', {
        search: 'CLEANUP',
        status: FILTER_ALL,
    });
    assert.equal(result, true);
});

test('matchesFilter: does not match when no value includes the search term', () => {
    const result = matchesFilter(['Account Cleanup', 'Some Other Job'], 'WAITING', {
        search: 'zzz-not-found',
        status: FILTER_ALL,
    });
    assert.equal(result, false);
});

test('matchesFilter: stringifies non-string values before matching', () => {
    const result = matchesFilter([42, null, undefined, 'Job'], 'WAITING', {
        search: '42',
        status: FILTER_ALL,
    });
    assert.equal(result, true);
});

test('matchesFilter: combines status mismatch short-circuit with a search term present', () => {
    const result = matchesFilter(['Account Cleanup'], 'WAITING', {
        search: 'cleanup',
        status: 'FAILED',
    });
    assert.equal(result, false);
});
