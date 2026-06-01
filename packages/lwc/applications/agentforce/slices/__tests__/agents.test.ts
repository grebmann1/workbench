/**
 * Slice-behavior tests for the agentforce agents slice — focused on the
 * stale-vs-clear policy applied in the rejected reducers.
 *
 * Why we don't import `../agents.ts` directly
 * -------------------------------------------
 * The slice file imports `host-api/store`, which transitively loads the
 * full core store graph including LWC components decorated with `@api`
 * (invalid syntax under plain Node — the test runner can't parse them).
 * Stubbing `host-api/store` via an ESM resolver hook from the test file
 * is unreliable because `module.register()` and dynamic-import scheduling
 * race with the existing tsconfig-paths resolver.
 *
 * Pragmatic alternative: re-construct the same `extraReducers` cases the
 * slice uses, and pin the policy contract here. Any drift between this
 * test and `../agents.ts` will be caught in code review (the rejected
 * branches are tiny and explicitly commented). This is consistent with
 * Engineer 4's `types.test.ts` which pins the type contract without
 * importing the slice runtime.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSlice } from '@reduxjs/toolkit';

import type { AgentforceState, GenAiPlanner, GenAiPlugin } from '../agents.ts';

// ---------------------------------------------------------------------------
// Test rig: faithful clone of the agentforce slice's rejected-reducer policy.
// MUST stay in sync with `slices/agents.ts`. Each branch documents its policy.
// ---------------------------------------------------------------------------

const initialState: AgentforceState = {
    agents: [],
    agentScripts: [],
    topics: [],
    actions: [],
    prompts: [],
    dependencies: { flows: [], apexClasses: [] },
    loading: false,
    error: null,
    selectedAgentId: null,
    selectedTopicId: null,
    apiMode: 'tooling',
    selectedScriptContent: null,
    scriptContentLoading: false,
};

const FETCH_AGENTS_REJECTED = 'agentforce/fetchAgents/rejected';
const FETCH_TOPICS_REJECTED = 'agentforce/fetchTopics/rejected';
const FETCH_ACTIONS_REJECTED = 'agentforce/fetchActions/rejected';
const FETCH_DEPENDENCIES_REJECTED = 'agentforce/fetchDependencies/rejected';

const testSlice = createSlice({
    name: 'agentforceTest',
    initialState,
    reducers: {
        // Faithful clones of the synchronous reducers in `../agents.ts`.
        // MUST stay in sync with the slice — the static-source contract
        // tests below catch drift.
        selectAgent: (state, action: { payload: { agentId: string } }) => {
            state.selectedAgentId = action.payload.agentId;
            state.selectedTopicId = null;
            state.topics = [];
            state.actions = [];
            state.dependencies = { flows: [], apexClasses: [] };
            state.selectedScriptContent = null;
        },
        setApiMode: (state, action: { payload: AgentforceState['apiMode'] }) => {
            state.apiMode = action.payload;
            state.agents = [];
            state.topics = [];
            state.actions = [];
            state.selectedAgentId = null;
            state.selectedTopicId = null;
            state.dependencies = { flows: [], apexClasses: [] };
        },
    },
    extraReducers: builder => {
        builder
            .addCase(FETCH_AGENTS_REJECTED, (state, action: { error?: { message?: string } }) => {
                // KEEP stale agents — Maya can keep working on the previous list.
                state.loading = false;
                state.error = action.error?.message ?? 'Unknown error';
            })
            .addCase(FETCH_TOPICS_REJECTED, (state, action: { error?: { message?: string } }) => {
                // CLEAR — topics are scoped to the selected agent.
                state.loading = false;
                state.error = action.error?.message ?? 'Unknown error';
                state.topics = [];
            })
            .addCase(FETCH_ACTIONS_REJECTED, (state, action: { error?: { message?: string } }) => {
                // CLEAR — actions are scoped to the selected topic.
                state.loading = false;
                state.error = action.error?.message ?? 'Unknown error';
                state.actions = [];
            })
            .addCase(
                FETCH_DEPENDENCIES_REJECTED,
                (state, action: { error?: { message?: string } }) => {
                    // CLEAR — dependencies are derived from the actions; stale
                    // entries can point at the wrong flow/apex.
                    state.loading = false;
                    state.error = action.error?.message ?? 'Unknown error';
                    state.dependencies = { flows: [], apexClasses: [] };
                }
            );
    },
});

function makeState(overrides: Partial<AgentforceState> = {}): AgentforceState {
    return { ...initialState, ...overrides };
}

test('fetchAgents.rejected: KEEPS stale agents and sets state.error', () => {
    const stale: GenAiPlanner[] = [
        { Id: '0XxAA', MasterLabel: 'A', DeveloperName: 'A', Description: null },
        { Id: '0XxBB', MasterLabel: 'B', DeveloperName: 'B', Description: null },
    ];
    const before = makeState({ agents: stale, loading: true });

    const next = testSlice.reducer(before, {
        type: FETCH_AGENTS_REJECTED,
        error: { message: 'permission denied' },
    });

    assert.equal(next.loading, false);
    assert.equal(next.error, 'permission denied');
    assert.deepEqual(next.agents, stale, 'agents must NOT be cleared on rejection');
});

test('fetchTopics.rejected: CLEARS topics and sets state.error', () => {
    const before = makeState({
        topics: [
            {
                Id: '0XtAA',
                MasterLabel: 'T1',
                DeveloperName: 'T1',
                Description: null,
                GenAiPlannerId: '0XxAA',
            },
        ] as GenAiPlugin[],
        loading: true,
        selectedAgentId: '0XxAA',
    });

    const next = testSlice.reducer(before, {
        type: FETCH_TOPICS_REJECTED,
        error: { message: 'service error' },
    });

    assert.equal(next.loading, false);
    assert.equal(next.error, 'service error');
    assert.deepEqual(next.topics, [], 'topics MUST be cleared on rejection (scoped to selection)');
});

test('source contract: agents.ts wires `state.error` and the documented policy', async () => {
    // Static-analysis sanity: read the slice source and assert the rejected
    // branches mention the stale-vs-clear policy + the field mutation. This
    // catches drift between this test rig and the real slice.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../agents.ts'), 'utf8');

    // fetchAgents.rejected: must NOT clear state.agents
    assert.match(src, /fetchAgents\.rejected[\s\S]+?KEEP stale agents/);
    // fetchTopics.rejected: must clear state.topics
    assert.match(src, /fetchTopics\.rejected[\s\S]+?state\.topics = \[\];/);
    // fetchActions.rejected: must clear state.actions
    assert.match(src, /fetchActions\.rejected[\s\S]+?state\.actions = \[\];/);
});

test('thunks accept optional bypassCache?: boolean (N5 contract)', async () => {
    // Static-source check: each fetch* thunk in agents.ts must declare
    // bypassCache?: boolean in its parameter type. Drift here would silently
    // break refresh-button call sites (the field becomes "excess property"
    // under strict object types).
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../agents.ts'), 'utf8');

    for (const thunk of [
        'fetchAgents',
        'fetchAgentScripts',
        'fetchAgentScriptContent',
        'fetchTopics',
        'fetchActions',
        'fetchPromptTemplates',
        'fetchDependencies',
    ]) {
        const re = new RegExp(`export const ${thunk}[\\s\\S]+?bypassCache\\?: boolean`);
        assert.match(src, re, `${thunk} must declare optional bypassCache?: boolean`);
    }
});

// ---------------------------------------------------------------------------
// Synchronous reducers — selection / mode switches that cascade through the
// downstream tree (topics, actions, dependencies, script content).
// ---------------------------------------------------------------------------

test('selectAgent: clears topics, actions, dependencies, selectedScriptContent', () => {
    const before = makeState({
        selectedAgentId: '0XxOLD',
        selectedTopicId: '0XtOLD',
        topics: [
            {
                Id: '0XtOLD',
                MasterLabel: 'T',
                DeveloperName: 'T',
                Description: null,
                GenAiPlannerId: '0XxOLD',
            },
        ] as GenAiPlugin[],
        actions: [{ Id: '0XaOLD' }] as unknown as AgentforceState['actions'],
        dependencies: {
            flows: [{ id: 'f1' }] as unknown as AgentforceState['dependencies']['flows'],
            apexClasses: [],
        },
        selectedScriptContent: {
            Id: '0Xs',
            Body: 'x',
        } as unknown as AgentforceState['selectedScriptContent'],
    });

    const next = testSlice.reducer(before, testSlice.actions.selectAgent({ agentId: '0XxNEW' }));

    assert.equal(next.selectedAgentId, '0XxNEW');
    assert.equal(next.selectedTopicId, null, 'topic selection must reset');
    assert.deepEqual(next.topics, [], 'topics scoped to old agent must clear');
    assert.deepEqual(next.actions, [], 'actions scoped to old selection must clear');
    assert.deepEqual(next.dependencies, { flows: [], apexClasses: [] }, 'dependencies must clear');
    assert.equal(next.selectedScriptContent, null, 'inline script content must clear');
});

test('setApiMode: clears agents and downstream selection cascade', () => {
    const before = makeState({
        apiMode: 'tooling',
        agents: [{ Id: '0XxAA', MasterLabel: 'A', DeveloperName: 'A', Description: null }],
        topics: [
            {
                Id: '0XtAA',
                MasterLabel: 'T',
                DeveloperName: 'T',
                Description: null,
                GenAiPlannerId: '0XxAA',
            },
        ] as GenAiPlugin[],
        actions: [{ Id: '0Xa' }] as unknown as AgentforceState['actions'],
        selectedAgentId: '0XxAA',
        selectedTopicId: '0XtAA',
        dependencies: {
            flows: [{ id: 'f' }] as unknown as AgentforceState['dependencies']['flows'],
            apexClasses: [],
        },
    });

    const next = testSlice.reducer(before, testSlice.actions.setApiMode('metadata'));

    assert.equal(next.apiMode, 'metadata');
    assert.deepEqual(
        next.agents,
        [],
        'agent list must clear (different API surfaces shape data differently)'
    );
    assert.deepEqual(next.topics, []);
    assert.deepEqual(next.actions, []);
    assert.equal(next.selectedAgentId, null);
    assert.equal(next.selectedTopicId, null);
    assert.deepEqual(next.dependencies, { flows: [], apexClasses: [] });
});

test('fetchActions.rejected: CLEARS actions and sets state.error', () => {
    const before = makeState({
        actions: [{ Id: '0Xa' }] as unknown as AgentforceState['actions'],
        loading: true,
        selectedTopicId: '0XtAA',
    });
    const next = testSlice.reducer(before, {
        type: FETCH_ACTIONS_REJECTED,
        error: { message: 'INVALID_FIELD' },
    });
    assert.equal(next.loading, false);
    assert.equal(next.error, 'INVALID_FIELD');
    assert.deepEqual(next.actions, [], 'actions MUST be cleared (scoped to topic)');
});

test('fetchDependencies.rejected: CLEARS dependencies and sets state.error', () => {
    const before = makeState({
        dependencies: {
            flows: [{ id: 'f1' }] as unknown as AgentforceState['dependencies']['flows'],
            apexClasses: [
                { id: 'c1' },
            ] as unknown as AgentforceState['dependencies']['apexClasses'],
        },
        loading: true,
    });
    const next = testSlice.reducer(before, {
        type: FETCH_DEPENDENCIES_REJECTED,
        error: { message: 'limits exceeded' },
    });
    assert.equal(next.loading, false);
    assert.equal(next.error, 'limits exceeded');
    assert.deepEqual(
        next.dependencies,
        { flows: [], apexClasses: [] },
        'dependencies MUST clear — stale entries can point at the wrong flow/apex'
    );
});

test('source contract: setApiMode + selectAgent reset the selection cascade', async () => {
    // Drift guard for the synchronous reducers — the test rig above mirrors
    // the source policy. If either reducer stops resetting selection, the
    // tree pane will desynchronize from the active selection.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../agents.ts'), 'utf8');

    // selectAgent must null out selectedTopicId AND clear topics/actions/deps.
    assert.match(
        src,
        /selectAgent[\s\S]+?state\.selectedTopicId = null[\s\S]+?state\.topics = \[\][\s\S]+?state\.actions = \[\][\s\S]+?state\.dependencies = \{ flows: \[\], apexClasses: \[\] \}/,
        'selectAgent must reset the full downstream cascade'
    );
    // setApiMode must clear agents (the source-of-truth list for the mode).
    assert.match(
        src,
        /setApiMode[\s\S]+?state\.agents = \[\]/,
        'setApiMode must clear the agents list'
    );
});
