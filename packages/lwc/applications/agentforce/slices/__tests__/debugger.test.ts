/**
 * Slice-behavior tests for the agentforce debugger slice — focused on the
 * stale-vs-clear policy applied in the rejected reducers.
 *
 * See `agents.test.ts` for the rationale behind reconstructing the slice
 * locally rather than importing `../debugger.ts` (LWC `@api` syntax in
 * transitive deps cannot be parsed by plain Node).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSlice } from '@reduxjs/toolkit';

import type {
    DebuggerState,
    GenAiInteraction,
    GenAiInteractionStep,
    PendingJumpIntent,
} from '../debugger.ts';

// ---------------------------------------------------------------------------
// Test rig: faithful clone of the debugger slice's rejected-reducer policy.
// MUST stay in sync with `slices/debugger.ts`.
// ---------------------------------------------------------------------------

const initialState: DebuggerState = {
    interactions: [],
    selectedInteractionId: null,
    steps: [],
    loading: false,
    error: null,
    currentStepIndex: -1,
    playbackActive: false,
    playbackSpeed: 1500,
    filters: {
        PlannerInvocation: true,
        TopicClassification: true,
        ActionExecution: true,
        LLMCall: true,
        GuardrailCheck: true,
    },
    searchQuery: '',
    pendingJumpIntent: null,
};

const FETCH_INTERACTIONS_REJECTED = 'agentforceDebugger/fetchInteractions/rejected';
const FETCH_INTERACTIONS_FULFILLED = 'agentforceDebugger/fetchInteractions/fulfilled';
const FETCH_STEPS_REJECTED = 'agentforceDebugger/fetchSteps/rejected';
const FETCH_STEPS_FULFILLED = 'agentforceDebugger/fetchSteps/fulfilled';

const FAILED_STATUSES: ReadonlyArray<string> = ['Failed', 'Timeout', 'Error'];

function sortFailedFirst<T extends { Status: string }>(rows: ReadonlyArray<T>): T[] {
    const copy = rows.slice();
    copy.sort((a, b) => {
        const aFailed = FAILED_STATUSES.includes(a.Status) ? 0 : 1;
        const bFailed = FAILED_STATUSES.includes(b.Status) ? 0 : 1;
        return aFailed - bFailed;
    });
    return copy;
}

const testSlice = createSlice({
    name: 'agentforceDebuggerTest',
    initialState,
    reducers: {
        jumpToFirstError(state) {
            if (!state.steps || state.steps.length === 0) {
                state.currentStepIndex = -1;
                return;
            }
            const idx = state.steps.findIndex(
                s => s.Status === 'Error' || s.Status === 'Failed' || s.Status === 'Timeout'
            );
            state.currentStepIndex = idx === -1 ? -1 : idx;
            state.playbackActive = false;
        },
        // Faithful clone of the deep-link plumbing in `../debugger.ts`.
        selectInteraction(state, action: { payload: string }) {
            // Idempotent re-selection preserves a queued jump intent — the
            // hydration path re-emits the same id and we must not race it.
            if (state.selectedInteractionId === action.payload) return;
            state.selectedInteractionId = action.payload;
            state.steps = [];
            state.currentStepIndex = -1;
            state.playbackActive = false;
            state.pendingJumpIntent = null;
        },
        setPendingJumpIntent(state, action: { payload: PendingJumpIntent }) {
            state.pendingJumpIntent = action.payload;
        },
    },
    extraReducers: builder => {
        builder
            .addCase(
                FETCH_INTERACTIONS_FULFILLED,
                (state, action: { payload: GenAiInteraction[] }) => {
                    state.loading = false;
                    state.interactions = sortFailedFirst(action.payload);
                    state.selectedInteractionId = null;
                    state.steps = [];
                }
            )
            .addCase(
                FETCH_INTERACTIONS_REJECTED,
                (state, action: { error?: { message?: string } }) => {
                    // KEEP stale interactions — history list is not selection-scoped.
                    state.loading = false;
                    state.error = action.error?.message ?? 'Unknown error';
                }
            )
            .addCase(
                FETCH_STEPS_FULFILLED,
                (state, action: { payload: GenAiInteractionStep[] }) => {
                    state.loading = false;
                    state.steps = action.payload;
                    state.currentStepIndex = -1;
                    state.playbackActive = false;
                    // Consume any queued deep-link jump intent — mirrored from
                    // `../debugger.ts` so `setPendingJumpIntent` + a steps load
                    // is testable end-to-end here.
                    const intent = state.pendingJumpIntent;
                    state.pendingJumpIntent = null;
                    if (!intent) return;
                    if (intent === 'firstError') {
                        const idx = state.steps.findIndex(
                            s =>
                                s.Status === 'Error' ||
                                s.Status === 'Failed' ||
                                s.Status === 'Timeout'
                        );
                        state.currentStepIndex = idx === -1 ? -1 : idx;
                        return;
                    }
                    const target = intent.stepOrder;
                    const stepIdx = state.steps.findIndex(s => s.StepOrder === target);
                    state.currentStepIndex = stepIdx;
                }
            )
            .addCase(FETCH_STEPS_REJECTED, (state, action: { error?: { message?: string } }) => {
                // CLEAR — steps are scoped to the selected interaction; reset playback.
                state.loading = false;
                state.error = action.error?.message ?? 'Unknown error';
                state.steps = [];
                state.currentStepIndex = -1;
                state.playbackActive = false;
            });
    },
});

function makeState(overrides: Partial<DebuggerState> = {}): DebuggerState {
    return { ...initialState, ...overrides };
}

test('fetchInteractions.rejected: KEEPS stale interactions and sets state.error', () => {
    const stale: GenAiInteraction[] = [
        {
            Id: '0XiAA',
            ConversationIdentifier: 'c1',
            PlannerId: '0XxAA',
            StartTime: '2026-01-01T00:00:00Z',
            EndTime: null,
            Status: 'Completed',
        },
    ];
    const before = makeState({ interactions: stale, loading: true });

    const next = testSlice.reducer(before, {
        type: FETCH_INTERACTIONS_REJECTED,
        error: { message: 'transient failure' },
    });

    assert.equal(next.loading, false);
    assert.equal(next.error, 'transient failure');
    assert.deepEqual(next.interactions, stale, 'interactions list must NOT be cleared');
});

test('fetchSteps.rejected: CLEARS steps + resets playback and sets state.error', () => {
    const stepFixture: GenAiInteractionStep = {
        Id: '0XsAA',
        GenAiInteractionId: '0XiAA',
        StepType: 'PlannerInvocation',
        StepInput: '{}',
        StepOutput: '{}',
        Duration: 0,
        TokenCount: null,
        Status: 'Completed',
        StepOrder: 1,
    };
    const before = makeState({
        steps: [stepFixture],
        loading: true,
        currentStepIndex: 0,
        playbackActive: true,
        selectedInteractionId: '0XiAA',
    });

    const next = testSlice.reducer(before, {
        type: FETCH_STEPS_REJECTED,
        error: { message: 'INVALID_TYPE' },
    });

    assert.equal(next.loading, false);
    assert.equal(next.error, 'INVALID_TYPE');
    assert.deepEqual(next.steps, [], 'steps MUST be cleared (scoped to interaction)');
    assert.equal(next.currentStepIndex, -1, 'playback index reset');
    assert.equal(next.playbackActive, false, 'playback stopped');
});

test('source contract: debugger.ts wires the documented stale-vs-clear policy', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../debugger.ts'), 'utf8');

    // fetchInteractions.rejected: must NOT clear state.interactions
    assert.match(src, /fetchInteractions\.rejected[\s\S]+?KEEP stale interactions/);
    // fetchSteps.rejected: must clear state.steps
    assert.match(src, /fetchSteps\.rejected[\s\S]+?state\.steps = \[\];/);
});

// ---------------------------------------------------------------------------
// jumpToFirstError reducer behaviour
// ---------------------------------------------------------------------------

function makeStep(order: number, status: string): GenAiInteractionStep {
    return {
        Id: `0Xs${order.toString().padStart(3, '0')}`,
        GenAiInteractionId: '0XiAA',
        StepType: 'PlannerInvocation',
        StepInput: '{}',
        StepOutput: '{}',
        Duration: 0,
        TokenCount: null,
        Status: status,
        StepOrder: order,
    };
}

test('jumpToFirstError: empty steps → currentStepIndex = -1', () => {
    const before = makeState({ currentStepIndex: 3, steps: [] });
    const next = testSlice.reducer(before, testSlice.actions.jumpToFirstError());
    assert.equal(next.currentStepIndex, -1);
});

test('jumpToFirstError: no errors anywhere → currentStepIndex = -1', () => {
    const before = makeState({
        steps: [makeStep(1, 'Success'), makeStep(2, 'Completed'), makeStep(3, 'Success')],
        currentStepIndex: 2,
        playbackActive: true,
    });
    const next = testSlice.reducer(before, testSlice.actions.jumpToFirstError());
    assert.equal(next.currentStepIndex, -1);
    assert.equal(next.playbackActive, false, 'playback must be stopped');
});

test('jumpToFirstError: first step is error → currentStepIndex = 0', () => {
    const before = makeState({
        steps: [makeStep(1, 'Error'), makeStep(2, 'Success'), makeStep(3, 'Success')],
        currentStepIndex: -1,
    });
    const next = testSlice.reducer(before, testSlice.actions.jumpToFirstError());
    assert.equal(next.currentStepIndex, 0);
});

test('jumpToFirstError: Nth step is error → currentStepIndex = N', () => {
    const before = makeState({
        steps: [
            makeStep(1, 'Success'),
            makeStep(2, 'Success'),
            makeStep(3, 'Failed'),
            makeStep(4, 'Error'), // not picked — first wins
        ],
    });
    const next = testSlice.reducer(before, testSlice.actions.jumpToFirstError());
    assert.equal(next.currentStepIndex, 2);
});

test('jumpToFirstError: Timeout counts as a failure status', () => {
    const before = makeState({
        steps: [makeStep(1, 'Success'), makeStep(2, 'Timeout')],
    });
    const next = testSlice.reducer(before, testSlice.actions.jumpToFirstError());
    assert.equal(next.currentStepIndex, 1);
});

// ---------------------------------------------------------------------------
// fetchInteractions.fulfilled — failed-first sort
// ---------------------------------------------------------------------------

test('fetchInteractions.fulfilled: failed/error/timeout interactions surface to the top', () => {
    const mk = (id: string, status: string, startTime: string): GenAiInteraction => ({
        Id: id,
        ConversationIdentifier: id,
        PlannerId: '0Xx000000000000',
        StartTime: startTime,
        EndTime: null,
        Status: status,
    });
    // Simulates SOQL `ORDER BY StartTime DESC` — newest first, mixed statuses.
    const payload: GenAiInteraction[] = [
        mk('0Xi001', 'Completed', '2026-05-01T10:00:00Z'),
        mk('0Xi002', 'Failed', '2026-05-01T09:00:00Z'),
        mk('0Xi003', 'Completed', '2026-05-01T08:00:00Z'),
        mk('0Xi004', 'Timeout', '2026-05-01T07:00:00Z'),
        mk('0Xi005', 'Error', '2026-05-01T06:00:00Z'),
        mk('0Xi006', 'Completed', '2026-05-01T05:00:00Z'),
    ];

    const before = makeState({ loading: true });
    const next = testSlice.reducer(before, {
        type: FETCH_INTERACTIONS_FULFILLED,
        payload,
    });

    // Failed/Timeout/Error first, in their original (StartTime DESC) order;
    // Completed below, also in original order.
    const ids = next.interactions.map(i => i.Id);
    assert.deepEqual(ids, ['0Xi002', '0Xi004', '0Xi005', '0Xi001', '0Xi003', '0Xi006']);
    assert.equal(next.loading, false);
});

test('thunks accept optional bypassCache?: boolean (N5 contract)', async () => {
    // Static-source check: each fetch* thunk in debugger.ts must declare
    // bypassCache?: boolean. Drift would silently break refresh-button call
    // sites that pass { bypassCache: true }.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../debugger.ts'), 'utf8');

    for (const thunk of ['fetchInteractions', 'fetchSteps']) {
        const re = new RegExp(`export const ${thunk}[\\s\\S]+?bypassCache\\?: boolean`);
        assert.match(src, re, `${thunk} must declare optional bypassCache?: boolean`);
    }
});

// ---------------------------------------------------------------------------
// pendingJumpIntent — the deep-link plumbing for `agentforce.openTrace`.
// Engineer 9 added this; it queues a jump that fetchSteps.fulfilled consumes.
// ---------------------------------------------------------------------------

test('setPendingJumpIntent: stores firstError intent verbatim', () => {
    const before = makeState();
    const next = testSlice.reducer(before, testSlice.actions.setPendingJumpIntent('firstError'));
    assert.equal(next.pendingJumpIntent, 'firstError');
});

test('setPendingJumpIntent: stores { stepOrder } intent verbatim', () => {
    const before = makeState();
    const next = testSlice.reducer(
        before,
        testSlice.actions.setPendingJumpIntent({ stepOrder: 4 })
    );
    assert.deepEqual(next.pendingJumpIntent, { stepOrder: 4 });
});

test('selectInteraction: changing id clears any queued jump intent', () => {
    const before = makeState({
        selectedInteractionId: '0XiOLD',
        pendingJumpIntent: 'firstError',
    });
    const next = testSlice.reducer(before, testSlice.actions.selectInteraction('0XiNEW'));
    assert.equal(next.selectedInteractionId, '0XiNEW');
    assert.equal(
        next.pendingJumpIntent,
        null,
        'a fresh selection invalidates jumps queued for the previous interaction'
    );
});

test('selectInteraction: re-selecting same id is idempotent (preserves queued intent + steps)', () => {
    // Hydration race guard: when the URL re-emits the same id (after
    // `agentforce.openTrace` navigates), we must NOT clobber the queued
    // intent or the loaded steps.
    const stepFixture: GenAiInteractionStep = {
        Id: '0XsAA',
        GenAiInteractionId: '0XiAA',
        StepType: 'PlannerInvocation',
        StepInput: '{}',
        StepOutput: '{}',
        Duration: 0,
        TokenCount: null,
        Status: 'Completed',
        StepOrder: 1,
    };
    const before = makeState({
        selectedInteractionId: '0XiAA',
        pendingJumpIntent: { stepOrder: 3 },
        steps: [stepFixture],
        currentStepIndex: 0,
    });
    const next = testSlice.reducer(before, testSlice.actions.selectInteraction('0XiAA'));
    assert.deepEqual(next.pendingJumpIntent, { stepOrder: 3 }, 'queued intent must survive re-selection');
    assert.deepEqual(next.steps, [stepFixture], 'steps must survive re-selection');
});

test('fetchSteps.fulfilled: consumes firstError intent and parks cursor on the first failure', () => {
    const steps: GenAiInteractionStep[] = [
        makeStep(1, 'Success'),
        makeStep(2, 'Failed'),
        makeStep(3, 'Error'),
    ];
    const before = makeState({ pendingJumpIntent: 'firstError', loading: true });
    const next = testSlice.reducer(before, { type: FETCH_STEPS_FULFILLED, payload: steps });
    assert.equal(next.currentStepIndex, 1, 'first failed step is at index 1');
    assert.equal(next.pendingJumpIntent, null, 'intent must be consumed (one-shot)');
});

test('fetchSteps.fulfilled: consumes { stepOrder } intent matching against StepOrder', () => {
    const steps: GenAiInteractionStep[] = [
        makeStep(1, 'Success'),
        makeStep(2, 'Success'),
        makeStep(7, 'Success'), // gap in StepOrder is intentional
    ];
    const before = makeState({ pendingJumpIntent: { stepOrder: 7 }, loading: true });
    const next = testSlice.reducer(before, { type: FETCH_STEPS_FULFILLED, payload: steps });
    assert.equal(next.currentStepIndex, 2, 'index 2 has StepOrder=7');
    assert.equal(next.pendingJumpIntent, null);
});

test('fetchSteps.fulfilled: { stepOrder } not found leaves cursor parked at -1', () => {
    const steps: GenAiInteractionStep[] = [makeStep(1, 'Success'), makeStep(2, 'Success')];
    const before = makeState({ pendingJumpIntent: { stepOrder: 99 }, loading: true });
    const next = testSlice.reducer(before, { type: FETCH_STEPS_FULFILLED, payload: steps });
    assert.equal(next.currentStepIndex, -1, 'unmatched stepOrder must NOT silently clamp');
    assert.equal(next.pendingJumpIntent, null);
});
