import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as CONST from '../../../constants.ts';
import application from '../reducers.ts';

test('application reducer: default state seeds connector=null', () => {
    const state = application(undefined, { type: '@@INIT' } as any);
    assert.deepEqual(state, { connector: null });
});

test('application reducer: unknown action returns prior state', () => {
    const prior = { connector: { id: 'x' }, isLoggedIn: true };
    const next = application(prior, { type: 'UNKNOWN' } as any);
    assert.equal(next, prior);
});

test('application reducer: LOGIN sets isLoggedIn + connector (replaces state)', () => {
    const next = application({ connector: null, isLoggedOut: true }, {
        type: CONST.LOGIN,
        payload: { connector: { id: 'c1' } },
    } as any);
    assert.deepEqual(next, { isLoggedIn: true, connector: { id: 'c1' } });
    // Prior flags are discarded — this is the documented shape.
    assert.equal((next as any).isLoggedOut, undefined);
});

test('application reducer: LOGOUT drops connector, sets isLoggedOut', () => {
    const next = application({ isLoggedIn: true, connector: { id: 'c1' } }, {
        type: CONST.LOGOUT,
    } as any);
    assert.deepEqual(next, { isLoggedOut: true, connector: null });
});

test('application reducer: UPDATE_IDENTITY merges new connector onto prior state', () => {
    const next = application({ connector: { id: 'old' }, isLoggedIn: true }, {
        type: CONST.UPDATE_IDENTITY,
        payload: { connector: { id: 'new' } },
    } as any);
    assert.deepEqual(next, {
        connector: { id: 'new' },
        isLoggedIn: true,
        isUpdate: true,
    });
});

test('application reducer: NAVIGATE emits redirectTo target', () => {
    const next = application({}, { type: CONST.NAVIGATE, payload: { target: '/home' } } as any);
    assert.deepEqual(next, { isNavigate: true, redirectTo: '/home' });
});

test('application reducer: FAKE_NAVIGATE preserves the action type in state', () => {
    const next = application({}, { type: CONST.FAKE_NAVIGATE, payload: { target: '/x' } } as any);
    assert.deepEqual(next, { type: CONST.FAKE_NAVIGATE, target: '/x' });
});

test('application reducer: OPEN sets isOpen + target', () => {
    const next = application({}, { type: CONST.OPEN, payload: { target: { url: '/y' } } } as any);
    assert.deepEqual(next, { isOpen: true, target: { url: '/y' } });
});

test('application reducer: MENU_HIDE / MENU_SHOW toggle isMenuDisplayed', () => {
    assert.deepEqual(application({}, { type: CONST.MENU_HIDE } as any), {
        isMenuDisplayed: false,
    });
    assert.deepEqual(application({}, { type: CONST.MENU_SHOW } as any), {
        isMenuDisplayed: true,
    });
});

test('application reducer: MENU_COLLAPSE / MENU_EXPAND carry source', () => {
    assert.deepEqual(
        application({}, { type: CONST.MENU_COLLAPSE, payload: { source: 'esc' } } as any),
        { isMenuExpanded: false, source: 'esc' }
    );
    assert.deepEqual(
        application({}, { type: CONST.MENU_EXPAND, payload: { source: 'key' } } as any),
        { isMenuExpanded: true, source: 'key' }
    );
});

test('application reducer: AGENT_CHAT_COLLAPSE / EXPAND carry source', () => {
    assert.deepEqual(
        application({}, { type: CONST.AGENT_CHAT_COLLAPSE, payload: { source: 'user' } } as any),
        { isAgentChatExpanded: false, source: 'user' }
    );
    assert.deepEqual(
        application({}, { type: CONST.AGENT_CHAT_EXPAND, payload: { source: 'user' } } as any),
        { isAgentChatExpanded: true, source: 'user' }
    );
});
