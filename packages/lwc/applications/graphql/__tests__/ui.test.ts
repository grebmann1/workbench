import assert from 'node:assert/strict';
import { test } from 'node:test';

function installLocalStorage() {
    const store: Record<string, string> = {};
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).localStorage = {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
            store[k] = String(v);
        },
        removeItem: (k: string) => {
            delete store[k];
        },
    };
    return store;
}
installLocalStorage();

import { reduxSlice, INITIAL_BODY, INITIAL_VARIABLES } from '../slices/ui.ts';

const { reducer, actions } = reduxSlice;

function initial() {
    return reducer(undefined, { type: '@@INIT' });
}

test('graphql/ui: initial state has one tab with default body', () => {
    const state = initial();
    assert.equal(state.tabs.length, 1);
    assert.equal(state.tabs[0].body, INITIAL_BODY);
    assert.equal(state.tabs[0].variables, INITIAL_VARIABLES);
    assert.equal(state.currentTab?.id, state.tabs[0].id);
    assert.equal(state.recent.length, 0);
    assert.equal(state.variablesExpanded, false);
});

test('graphql/ui: addTab appends and selects the new tab', () => {
    const state = reducer(initial(), actions.addTab({ tab: { body: 'query { me }' } }));
    assert.equal(state.tabs.length, 2);
    assert.equal(state.currentTab.body, 'query { me }');
    assert.equal(state.currentTab.id, state.tabs[1].id);
});

test('graphql/ui: addTab with empty payload keeps defaults', () => {
    const state = reducer(initial(), actions.addTab({ tab: {} }));
    assert.equal(state.currentTab.body, INITIAL_BODY);
    assert.equal(state.currentTab.variables, INITIAL_VARIABLES);
});

test('graphql/ui: updateBody mutates current tab only', () => {
    let state = reducer(initial(), actions.addTab({ tab: { body: 'a' } }));
    state = reducer(state, actions.updateBody({ body: 'mutated' }));
    assert.equal(state.currentTab.body, 'mutated');
    assert.equal(state.tabs[1].body, 'mutated');
    assert.notEqual(state.tabs[0].body, 'mutated');
});

test('graphql/ui: updateVariables mutates current tab only', () => {
    let state = reducer(initial(), actions.addTab({ tab: { variables: '{"a":1}' } }));
    state = reducer(state, actions.updateVariables({ variables: '{"b":2}' }));
    assert.equal(state.currentTab.variables, '{"b":2}');
    assert.equal(state.tabs[1].variables, '{"b":2}');
});

test('graphql/ui: selectionTab no-ops on unknown id', () => {
    const state = reducer(initial(), actions.selectionTab({ id: 'does-not-exist' }));
    // Still the original tab.
    assert.equal(state.currentTab.id, state.tabs[0].id);
});

test('graphql/ui: removeTab keeps at least one tab and reselects', () => {
    const first = initial();
    const firstId = first.tabs[0].id;
    let state = reducer(first, actions.addTab({ tab: { body: 'a' } }));
    state = reducer(state, actions.removeTab({ id: state.currentTab.id }));
    assert.equal(state.tabs.length, 1);
    assert.equal(state.tabs[0].id, firstId);

    // Removing the sole tab should leave the slice with a fresh tab.
    state = reducer(state, actions.removeTab({ id: state.tabs[0].id }));
    assert.equal(state.tabs.length, 1);
    assert.ok(state.currentTab?.id);
});

test('graphql/ui: saveRecent dedups and caps at 20', () => {
    let state = initial();
    for (let i = 0; i < 25; i++) {
        state = reducer(state, actions.saveRecent({ body: `q${i}`, variables: '{}' }));
    }
    assert.equal(state.recent.length, 20);
    assert.equal(state.recent[0].body, 'q24');

    state = reducer(state, actions.saveRecent({ body: 'q24', variables: '{}' }));
    assert.equal(state.recent.length, 20);
    assert.equal(state.recent[0].body, 'q24');
    const count = state.recent.filter(r => r.body === 'q24').length;
    assert.equal(count, 1);
});

test('graphql/ui: saveRecent ignores empty body', () => {
    let state = initial();
    state = reducer(state, actions.saveRecent({ body: '', variables: '{}' }));
    assert.equal(state.recent.length, 0);
    state = reducer(state, actions.saveRecent({}));
    assert.equal(state.recent.length, 0);
});

test('graphql/ui: updateRecentPanel flips boolean', () => {
    let state = initial();
    state = reducer(state, actions.updateRecentPanel({ value: true }));
    assert.equal(state.recentPanelToggled, true);
    state = reducer(state, actions.updateRecentPanel({ value: false }));
    assert.equal(state.recentPanelToggled, false);
});

test('graphql/ui: toggleVariables flips expanded flag', () => {
    let state = initial();
    assert.equal(state.variablesExpanded, false);
    state = reducer(state, actions.toggleVariables());
    assert.equal(state.variablesExpanded, true);
    state = reducer(state, actions.toggleVariables());
    assert.equal(state.variablesExpanded, false);
});

test('graphql/ui: renameTab sets a custom name; empty clears to null', () => {
    let state = initial();
    const id = state.tabs[0].id;
    state = reducer(state, actions.renameTab({ id, name: '  My tab  ' }));
    assert.equal(state.tabs[0].name, 'My tab');
    state = reducer(state, actions.renameTab({ id, name: '' }));
    assert.equal(state.tabs[0].name, null);
    // Unknown id is a no-op.
    state = reducer(state, actions.renameTab({ id: 'missing', name: 'x' }));
    assert.equal(state.tabs[0].name, null);
});

test('graphql/ui: saveRecent stores response + took + savedAt', () => {
    let state = initial();
    state = reducer(
        state,
        actions.saveRecent({
            body: '{ a }',
            variables: '{}',
            response: { data: { ok: 1 }, errors: null },
            took: 42,
        })
    );
    const entry = state.recent[0];
    assert.equal(entry.body, '{ a }');
    assert.deepEqual(entry.response, { data: { ok: 1 }, errors: null });
    assert.equal(entry.took, 42);
    assert.ok(typeof entry.savedAt === 'number' && entry.savedAt > 0);
});

test('graphql/ui: clearRecent empties the list', () => {
    let state = initial();
    state = reducer(state, actions.saveRecent({ body: 'q', variables: '{}' }));
    assert.equal(state.recent.length, 1);
    state = reducer(state, actions.clearRecent());
    assert.equal(state.recent.length, 0);
});

test('graphql/ui: loadCacheSettings restores tabs with corrupted entries', () => {
    // Pre-seed localStorage with a corrupted tab record.
    const alias = 'org-xyz';
    (globalThis as any).localStorage.setItem(
        `${alias}-GRAPHQL_SETTINGS_KEY`,
        JSON.stringify({
            tabs: [
                { id: 't1', body: null, variables: 42 },
                { id: 't2', body: 'ok', variables: '{"x":1}' },
            ],
            currentTabId: 't2',
            variablesExpanded: true,
        })
    );
    const state = reducer(initial(), actions.loadCacheSettings({ alias }));
    assert.equal(state.tabs.length, 2);
    // Corrupted → falls back to defaults.
    assert.equal(state.tabs[0].body, INITIAL_BODY);
    assert.equal(state.tabs[0].variables, INITIAL_VARIABLES);
    // Valid tab preserved.
    assert.equal(state.tabs[1].body, 'ok');
    assert.equal(state.tabs[1].variables, '{"x":1}');
    assert.equal(state.currentTab.id, 't2');
    assert.equal(state.variablesExpanded, true);
});
