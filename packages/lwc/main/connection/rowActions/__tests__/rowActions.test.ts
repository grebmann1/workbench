import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    CONNECTION_ROW_ACTIONS,
    getErrorRowActionName,
    resolveRequestedConnectionAction,
} from '../rowActions.ts';

test('CONNECTION_ROW_ACTIONS: canonical string values', () => {
    assert.equal(CONNECTION_ROW_ACTIONS.AUTHORIZE, 'authorize');
    assert.equal(CONNECTION_ROW_ACTIONS.LOGIN, 'login');
    assert.equal(CONNECTION_ROW_ACTIONS.CLEAR_ERROR, 'clearError');
});

test('getErrorRowActionName: AUTHORIZE → AUTHORIZE, else LOGIN', () => {
    assert.equal(getErrorRowActionName('authorize'), 'authorize');
    assert.equal(getErrorRowActionName('login'), 'login');
    assert.equal(getErrorRowActionName(undefined), 'login');
    assert.equal(getErrorRowActionName('random-other'), 'login');
});

test('resolveRequestedConnectionAction: LOGIN+row=AUTHORIZE → AUTHORIZE (row wins)', () => {
    assert.equal(resolveRequestedConnectionAction('login', 'authorize'), 'authorize');
});

test('resolveRequestedConnectionAction: otherwise returns actionName or LOGIN default', () => {
    assert.equal(resolveRequestedConnectionAction('authorize', 'login'), 'authorize');
    assert.equal(resolveRequestedConnectionAction('clearError', 'login'), 'clearError');
    assert.equal(resolveRequestedConnectionAction(undefined, undefined), 'login');
});
