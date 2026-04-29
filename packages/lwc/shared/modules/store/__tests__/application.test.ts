import { test } from 'node:test';
import assert from 'node:assert/strict';

import application from '../modules/application/reducers.ts';
import {
    login,
    logout,
    updateConnector,
    navigate,
    fakeNavigate,
    open,
    hideMenu,
    showMenu,
    collapseMenu,
    expandMenu,
    collapseAgentChat,
    expandAgentChat,
} from '../modules/application/actions.ts';

test('application reducer: initial state is { connector: null }', () => {
    const state = application(undefined, { type: '@@INIT' });
    assert.deepEqual(state, { connector: null });
});

test('application reducer: LOGIN sets isLoggedIn + connector, drops prior flags', () => {
    const connector = { id: 'c1' };
    const state = application({ isLoggedOut: true, connector: null }, login(connector));
    assert.equal(state.isLoggedIn, true);
    assert.equal(state.connector, connector);
    assert.equal(state.isLoggedOut, undefined);
});

test('application reducer: LOGOUT clears connector and sets isLoggedOut', () => {
    const state = application({ isLoggedIn: true, connector: { id: 'c' } }, logout());
    assert.equal(state.isLoggedOut, true);
    assert.equal(state.connector, null);
    assert.equal(state.isLoggedIn, undefined);
});

test('application reducer: UPDATE_IDENTITY merges with prior state and sets isUpdate', () => {
    const prev = { isLoggedIn: true, connector: { id: 'old' } };
    const state = application(prev, updateConnector({ id: 'new' }));
    assert.equal(state.isLoggedIn, true);
    assert.deepEqual(state.connector, { id: 'new' });
    assert.equal(state.isUpdate, true);
});

test('application reducer: NAVIGATE resets state with redirectTo', () => {
    const state = application({ connector: { id: 'c' } }, navigate('/home'));
    assert.equal(state.isNavigate, true);
    assert.equal(state.redirectTo, '/home');
    assert.equal(state.connector, undefined);
});

test('application reducer: FAKE_NAVIGATE preserves action.type as state.type', () => {
    const state = application(undefined, fakeNavigate({ route: '/x' }));
    assert.equal(state.type, 'FAKE_NAVIGATE');
    assert.deepEqual(state.target, { route: '/x' });
});

test('application reducer: OPEN sets isOpen + target', () => {
    const state = application(undefined, open('/soql'));
    assert.equal(state.isOpen, true);
    assert.equal(state.target, '/soql');
});

test('application reducer: MENU_SHOW/MENU_HIDE toggle isMenuDisplayed', () => {
    assert.equal(application(undefined, showMenu()).isMenuDisplayed, true);
    assert.equal(application(undefined, hideMenu()).isMenuDisplayed, false);
});

test('application reducer: MENU_COLLAPSE/MENU_EXPAND carry source', () => {
    const collapsed = application(undefined, collapseMenu('user'));
    assert.equal(collapsed.isMenuExpanded, false);
    assert.equal(collapsed.source, 'user');
    const expanded = application(undefined, expandMenu('system'));
    assert.equal(expanded.isMenuExpanded, true);
    assert.equal(expanded.source, 'system');
});

test('application reducer: AGENT_CHAT_COLLAPSE/EXPAND set isAgentChatExpanded', () => {
    const collapsed = application(undefined, collapseAgentChat('user'));
    assert.equal(collapsed.isAgentChatExpanded, false);
    const expanded = application(undefined, expandAgentChat('tool'));
    assert.equal(expanded.isAgentChatExpanded, true);
    assert.equal(expanded.source, 'tool');
});

test('application reducer: unknown action returns state unchanged', () => {
    const prev = { connector: { id: 'x' } };
    const out = application(prev, { type: 'UNKNOWN' });
    assert.equal(out, prev);
});

test('action creators: shape matches expected { type, payload }', () => {
    assert.deepEqual(login({ id: 'c' }), { type: 'LOGIN', payload: { connector: { id: 'c' } } });
    assert.deepEqual(logout(), { type: 'LOGOUT' });
    assert.deepEqual(navigate('/x'), { type: 'NAVIGATE', payload: { target: '/x' } });
    assert.deepEqual(showMenu(), { type: 'MENU_SHOW' });
    assert.deepEqual(hideMenu(), { type: 'MENU_HIDE' });
    assert.deepEqual(collapseMenu('src'), {
        type: 'MENU_COLLAPSE',
        payload: { source: 'src' },
    });
});
