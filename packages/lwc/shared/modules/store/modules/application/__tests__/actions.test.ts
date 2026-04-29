import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as CONST from '../../../constants.ts';
import {
    login,
    updateConnector,
    logout,
    navigate,
    fakeNavigate,
    open,
    hideMenu,
    showMenu,
    collapseMenu,
    expandMenu,
    collapseAgentChat,
    expandAgentChat,
} from '../actions.ts';

test('login: returns LOGIN action with connector payload', () => {
    const connector = { id: 'x' };
    assert.deepEqual(login(connector), {
        type: CONST.LOGIN,
        payload: { connector },
    });
});

test('updateConnector: returns UPDATE_IDENTITY action with connector payload', () => {
    const connector = { id: 'y' };
    assert.deepEqual(updateConnector(connector), {
        type: CONST.UPDATE_IDENTITY,
        payload: { connector },
    });
});

test('logout: returns LOGOUT action with no payload', () => {
    assert.deepEqual(logout(), { type: CONST.LOGOUT });
});

test('navigate / fakeNavigate / open: carry target in payload', () => {
    const target = { path: '/home' };
    assert.deepEqual(navigate(target), {
        type: CONST.NAVIGATE,
        payload: { target },
    });
    assert.deepEqual(fakeNavigate(target), {
        type: CONST.FAKE_NAVIGATE,
        payload: { target },
    });
    assert.deepEqual(open(target), {
        type: CONST.OPEN,
        payload: { target },
    });
});

test('hideMenu / showMenu: payload-less toggles', () => {
    assert.deepEqual(hideMenu(), { type: CONST.MENU_HIDE });
    assert.deepEqual(showMenu(), { type: CONST.MENU_SHOW });
});

test('menu collapse/expand: carry source string', () => {
    assert.deepEqual(collapseMenu('user'), {
        type: CONST.MENU_COLLAPSE,
        payload: { source: 'user' },
    });
    assert.deepEqual(expandMenu('shortcut'), {
        type: CONST.MENU_EXPAND,
        payload: { source: 'shortcut' },
    });
});

test('agent chat collapse/expand: carry source string', () => {
    assert.deepEqual(collapseAgentChat('esc'), {
        type: CONST.AGENT_CHAT_COLLAPSE,
        payload: { source: 'esc' },
    });
    assert.deepEqual(expandAgentChat('hotkey'), {
        type: CONST.AGENT_CHAT_EXPAND,
        payload: { source: 'hotkey' },
    });
});
