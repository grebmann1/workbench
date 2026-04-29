import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    SESSION_BOOTSTRAP_STORAGE_KEYS,
    resolveBootstrapMode,
    shouldUsePersistedBootstrapSeed,
    shouldUsePersistedSessionBootstrap,
    isSessionAuthErrorMessage,
    shouldRemountWorkbenchWorkspace,
} from '../bootstrapState.ts';

test('SESSION_BOOTSTRAP_STORAGE_KEYS: exposes sessionId + serverUrl keys', () => {
    assert.equal(SESSION_BOOTSTRAP_STORAGE_KEYS.sessionId, 'sfSessionId');
    assert.equal(SESSION_BOOTSTRAP_STORAGE_KEYS.serverUrl, 'sfServerUrl');
});

// ── resolveBootstrapMode ─────────────────────────────────────────────────────

test('resolveBootstrapMode: "session" when both sessionId and serverUrl present', () => {
    assert.equal(
        resolveBootstrapMode({ sessionId: 'abc', serverUrl: 'https://x.salesforce.com' }),
        'session'
    );
});

test('resolveBootstrapMode: "alias" when only alias present', () => {
    assert.equal(resolveBootstrapMode({ alias: 'my-org' }), 'alias');
});

test('resolveBootstrapMode: "none" when nothing present', () => {
    assert.equal(resolveBootstrapMode({}), 'none');
});

test('resolveBootstrapMode: "alias" when only one of session fields present', () => {
    assert.equal(resolveBootstrapMode({ sessionId: 'abc', alias: 'x' }), 'alias');
    assert.equal(resolveBootstrapMode({ serverUrl: 'https://x', alias: 'x' }), 'alias');
});

test('resolveBootstrapMode: ignores blank/whitespace values', () => {
    assert.equal(resolveBootstrapMode({ alias: '   ', sessionId: '', serverUrl: '' }), 'none');
});

// ── shouldUsePersistedBootstrapSeed ──────────────────────────────────────────

test('shouldUsePersistedBootstrapSeed: true when no sourceTabId', () => {
    assert.equal(shouldUsePersistedBootstrapSeed({}), true);
    assert.equal(shouldUsePersistedBootstrapSeed({ sourceTabId: '' }), true);
});

test('shouldUsePersistedBootstrapSeed: false when sourceTabId present and no explicit bootstrap', () => {
    assert.equal(shouldUsePersistedBootstrapSeed({ sourceTabId: 'tab-42' }), false);
});

test('shouldUsePersistedBootstrapSeed: true when hasExplicitBootstrap overrides sourceTabId', () => {
    assert.equal(
        shouldUsePersistedBootstrapSeed({ sourceTabId: 'tab-42', hasExplicitBootstrap: true }),
        true
    );
});

// ── shouldUsePersistedSessionBootstrap ───────────────────────────────────────

test('shouldUsePersistedSessionBootstrap: true when explicit session seed present', () => {
    assert.equal(shouldUsePersistedSessionBootstrap({ sessionId: 'abc' }), true);
    assert.equal(shouldUsePersistedSessionBootstrap({ serverUrl: 'https://x' }), true);
});

test('shouldUsePersistedSessionBootstrap: false when only alias present (no session seed)', () => {
    assert.equal(shouldUsePersistedSessionBootstrap({ alias: 'my-org' }), false);
});

test('shouldUsePersistedSessionBootstrap: true when nothing explicit at all', () => {
    assert.equal(shouldUsePersistedSessionBootstrap({}), true);
});

test('shouldUsePersistedSessionBootstrap: explicit session seed wins over explicit alias', () => {
    assert.equal(shouldUsePersistedSessionBootstrap({ alias: 'my-org', sessionId: 'abc' }), true);
});

// ── isSessionAuthErrorMessage ────────────────────────────────────────────────

test('isSessionAuthErrorMessage: matches case-insensitive auth error phrases', () => {
    assert.equal(isSessionAuthErrorMessage('Session expired'), true);
    assert.equal(isSessionAuthErrorMessage('SESSION EXPIRED'), true);
    assert.equal(isSessionAuthErrorMessage('Invalid session'), true);
    assert.equal(isSessionAuthErrorMessage('INVALID_SESSION_ID'), true);
    assert.equal(isSessionAuthErrorMessage('invalid_session_id: token rejected'), true);
});

test('isSessionAuthErrorMessage: returns false for unrelated messages', () => {
    assert.equal(isSessionAuthErrorMessage('Network error'), false);
    assert.equal(isSessionAuthErrorMessage(''), false);
    assert.equal(isSessionAuthErrorMessage(null), false);
    assert.equal(isSessionAuthErrorMessage(undefined), false);
});

// ── shouldRemountWorkbenchWorkspace ──────────────────────────────────────────

test('shouldRemountWorkbenchWorkspace: true when previous != next (both set)', () => {
    assert.equal(
        shouldRemountWorkbenchWorkspace({
            previousWorkspaceRoot: '/workspace/orgs/a',
            nextWorkspaceRoot: '/workspace/orgs/b',
        }),
        true
    );
});

test('shouldRemountWorkbenchWorkspace: false when roots match after normalization', () => {
    assert.equal(
        shouldRemountWorkbenchWorkspace({
            previousWorkspaceRoot: '/workspace/orgs/acme',
            nextWorkspaceRoot: 'workspace/orgs/acme',
        }),
        false
    );
    assert.equal(
        shouldRemountWorkbenchWorkspace({
            previousWorkspaceRoot: '\\workspace\\orgs\\acme',
            nextWorkspaceRoot: '/workspace/orgs/acme',
        }),
        false
    );
});

test('shouldRemountWorkbenchWorkspace: false when either root is missing', () => {
    assert.equal(
        shouldRemountWorkbenchWorkspace({ previousWorkspaceRoot: '', nextWorkspaceRoot: '/x' }),
        false
    );
    assert.equal(
        shouldRemountWorkbenchWorkspace({ previousWorkspaceRoot: '/x', nextWorkspaceRoot: '' }),
        false
    );
    assert.equal(shouldRemountWorkbenchWorkspace({}), false);
});
