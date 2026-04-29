import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reduxSlice } from '../shell.ts';

const r = reduxSlice.reducer;
const a = reduxSlice.actions;

test('shell: initial state', () => {
    const s = r(undefined, { type: '@@INIT' } as any);
    assert.equal(s.menuExpanded, true);
    assert.equal(s.menuDisplayed, true);
    assert.equal(s.agentChatExpanded, false);
    assert.equal(s.redirectTo, null);
});

test('shell: collapseMenu / expandMenu toggle + record source', () => {
    let s = r(undefined, a.collapseMenu({ source: 'hotkey' }));
    assert.equal(s.menuExpanded, false);
    assert.equal(s.menuSource, 'hotkey');
    s = r(s, a.expandMenu({ source: 'click' }));
    assert.equal(s.menuExpanded, true);
    assert.equal(s.menuSource, 'click');
});

test('shell: hideMenu / showMenu toggle visibility', () => {
    let s = r(undefined, a.hideMenu());
    assert.equal(s.menuDisplayed, false);
    s = r(s, a.showMenu());
    assert.equal(s.menuDisplayed, true);
});

test('shell: agent chat expand/collapse', () => {
    let s = r(undefined, a.expandAgentChat({ source: 'cmd' }));
    assert.equal(s.agentChatExpanded, true);
    assert.equal(s.agentChatSource, 'cmd');
    s = r(s, a.collapseAgentChat({ source: 'esc' }));
    assert.equal(s.agentChatExpanded, false);
});

test('shell: navigate + clearRedirect (payload object with target, or plain string)', () => {
    let s = r(undefined, a.navigate({ target: '/soql' }));
    assert.equal(s.redirectTo, '/soql');
    s = r(undefined, a.navigate('/api'));
    assert.equal(s.redirectTo, '/api');
    s = r(s, a.clearRedirect());
    assert.equal(s.redirectTo, null);
});

test('shell: open + clearOpen', () => {
    let s = r(undefined, a.open({ target: 'metadata' }));
    assert.equal(s.openTarget, 'metadata');
    s = r(s, a.clearOpen());
    assert.equal(s.openTarget, null);
});

test('shell: fakeNavigate sets both target and legacy type; clearFakeNavigate resets', () => {
    let s = r(undefined, a.fakeNavigate({ target: 'home' }));
    assert.equal(s.fakeNavigateTarget, 'home');
    assert.equal(s.fakeNavigateType, 'FAKE_NAVIGATE');
    s = r(s, a.clearFakeNavigate());
    assert.equal(s.fakeNavigateTarget, null);
    assert.equal(s.fakeNavigateType, null);
});
