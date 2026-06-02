import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ConnectorLike } from 'host-api/connector';
import { injectReducer, reportError } from 'host-api/store';
import { handleSliceError, setSliceErrorReporter } from 'shared/sliceHelpers/handleSliceError';
import { runSoqlQuery, asSalesforceId } from 'shared/soqlQuery/soqlQuery';

// Wire the host's reportError into the shared slice helper. Idempotent — the
// agents slice does the same call; whichever module loads first wins, and the
// result is identical.
setSliceErrorReporter(reportError);

export interface GenAiInteraction {
    Id: string;
    ConversationIdentifier: string;
    PlannerId: string;
    StartTime: string;
    EndTime: string | null;
    Status: string;
}

export interface GenAiInteractionStep {
    Id: string;
    GenAiInteractionId: string;
    StepType: string;
    StepInput: string;
    StepOutput: string;
    Duration: number;
    TokenCount: number | null;
    Status: string;
    StepOrder: number;
}

/**
 * Deferred jump request, applied after `fetchSteps.fulfilled` lands. Used by
 * the `agentforce.openTrace` deep-link path so the URL can encode either:
 *   - `'firstError'` — jump to the first failed step (no `stepId` in URL).
 *   - `{ stepOrder: N }` — jump to that specific 1-based StepOrder.
 *
 * Steps load asynchronously; storing the intent in state (rather than a
 * setTimeout/race in app.ts) lets the reducer apply it deterministically
 * the moment the payload arrives.
 */
export type PendingJumpIntent = 'firstError' | { stepOrder: number } | null;

export interface DebuggerState {
    interactions: GenAiInteraction[];
    selectedInteractionId: string | null;
    steps: GenAiInteractionStep[];
    loading: boolean;
    error: string | null;
    currentStepIndex: number;
    playbackActive: boolean;
    playbackSpeed: number;
    filters: Record<string, boolean>;
    searchQuery: string;
    pendingJumpIntent: PendingJumpIntent;
}

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

function errorMessage(err: unknown): string {
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
}

type ApiMode = 'tooling' | 'data';

/**
 * `bypassCache` is plumbed through every fetch thunk so refresh-button call
 * sites can opt out of the SWR cache once F2 lands. Today the flag is a no-op
 * (no SWR layer to bypass) — the contract is in place to avoid a future
 * signature break for refresh / X1 work.
 */
export const fetchInteractions = createAsyncThunk(
    'agentforceDebugger/fetchInteractions',
    async ({
        connector,
        agentId,
        apiMode = 'tooling',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        bypassCache: _bypassCache = false,
    }: {
        connector: ConnectorLike;
        agentId: string;
        apiMode?: ApiMode;
        bypassCache?: boolean;
    }) => {
        try {
            const safeAgentId = asSalesforceId(agentId);
            return await runSoqlQuery<GenAiInteraction>(
                connector,
                `SELECT Id, ConversationIdentifier, PlannerId, StartTime, EndTime, Status FROM GenAiInteraction WHERE PlannerId = '${safeAgentId}' ORDER BY StartTime DESC LIMIT 50`,
                { mode: apiMode }
            );
        } catch (err) {
            handleSliceError('agentforce', err);
        }
    }
);

export const fetchSteps = createAsyncThunk(
    'agentforceDebugger/fetchSteps',
    async ({
        connector,
        interactionId,
        apiMode = 'tooling',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        bypassCache: _bypassCache = false,
    }: {
        connector: ConnectorLike;
        interactionId: string;
        apiMode?: ApiMode;
        bypassCache?: boolean;
    }) => {
        try {
            const safeInteractionId = asSalesforceId(interactionId);
            return await runSoqlQuery<GenAiInteractionStep>(
                connector,
                `SELECT Id, GenAiInteractionId, StepType, StepInput, StepOutput, Duration, TokenCount, Status, StepOrder FROM GenAiInteractionStep WHERE GenAiInteractionId = '${safeInteractionId}' ORDER BY StepOrder`,
                { mode: apiMode }
            );
        } catch (err) {
            handleSliceError('agentforce', err);
        }
    }
);

const FAILED_STATUSES: ReadonlyArray<string> = ['Failed', 'Timeout', 'Error'];

/**
 * Custom display order for the interactions list: failed/timeout/error
 * interactions to the top, the rest in SOQL-supplied order (StartTime DESC)
 * underneath. JS `Array.prototype.sort` is stable in modern engines, so the
 * "rest" bucket keeps its incoming order.
 */
function sortFailedFirst<T extends { Status: string }>(rows: ReadonlyArray<T>): T[] {
    const copy = rows.slice();
    copy.sort((a, b) => {
        const aFailed = FAILED_STATUSES.includes(a.Status) ? 0 : 1;
        const bFailed = FAILED_STATUSES.includes(b.Status) ? 0 : 1;
        return aFailed - bFailed;
    });
    return copy;
}

const debuggerSlice = createSlice({
    name: 'agentforceDebugger',
    initialState,
    reducers: {
        selectInteraction: (state, action: { payload: string }) => {
            // Idempotent re-selection: when the URL hydration path re-emits
            // the same interaction id (e.g. after `agentforce.openTrace`
            // navigates), preserve the loaded steps + queued jump intent.
            // Clearing them would race the deep-link handler.
            if (state.selectedInteractionId === action.payload) return;
            state.selectedInteractionId = action.payload;
            state.steps = [];
            state.currentStepIndex = -1;
            state.playbackActive = false;
            // A fresh selection (different id) invalidates any deep-link
            // jump that was queued for a different interaction.
            state.pendingJumpIntent = null;
        },
        /**
         * Queue a jump to apply once `fetchSteps.fulfilled` lands. Called by
         * the `agentforce.openTrace` deep-link path; the consumer is the
         * `fetchSteps.fulfilled` reducer.
         */
        setPendingJumpIntent: (state, action: { payload: PendingJumpIntent }) => {
            state.pendingJumpIntent = action.payload;
        },
        clearDebugger: state => {
            state.interactions = [];
            state.selectedInteractionId = null;
            state.steps = [];
            state.error = null;
            state.currentStepIndex = -1;
            state.playbackActive = false;
        },
        setStepIndex: (state, action: { payload: number }) => {
            const maxIndex = state.steps.length - 1;
            state.currentStepIndex = Math.max(-1, Math.min(action.payload, maxIndex));
            state.playbackActive = false;
        },
        nextStep: state => {
            const visibleIndices = state.steps
                .map((s, i) => ({ type: s.StepType, index: i }))
                .filter(item => state.filters[item.type] !== false)
                .map(item => item.index);
            if (visibleIndices.length === 0) return;

            const currentPos = visibleIndices.indexOf(state.currentStepIndex);
            if (currentPos < visibleIndices.length - 1) {
                state.currentStepIndex = visibleIndices[currentPos + 1];
            } else if (state.currentStepIndex === -1) {
                state.currentStepIndex = visibleIndices[0];
            } else {
                // At end — stop playback
                state.playbackActive = false;
            }
        },
        prevStep: state => {
            const visibleIndices = state.steps
                .map((s, i) => ({ type: s.StepType, index: i }))
                .filter(item => state.filters[item.type] !== false)
                .map(item => item.index);
            if (visibleIndices.length === 0) return;

            const currentPos = visibleIndices.indexOf(state.currentStepIndex);
            if (currentPos > 0) {
                state.currentStepIndex = visibleIndices[currentPos - 1];
            } else if (currentPos === -1) {
                // Not in visible list, go to first visible
                state.currentStepIndex = visibleIndices[0];
            } else {
                state.currentStepIndex = visibleIndices[0];
            }
        },
        togglePlayback: state => {
            state.playbackActive = !state.playbackActive;
        },
        setPlaybackSpeed: (state, action: { payload: number }) => {
            state.playbackSpeed = action.payload;
        },
        setFilter: (state, action: { payload: { type: string; enabled: boolean } }) => {
            state.filters[action.payload.type] = action.payload.enabled;
            state.currentStepIndex = -1;
        },
        setSearchQuery: (state, action: { payload: string }) => {
            state.searchQuery = action.payload;
            state.currentStepIndex = -1;
        },
        /**
         * Jump the playback cursor to the first failed step in the loaded
         * interaction. No-op (cursor parked at -1) if there are no steps or
         * no errors. Bound to F8 in the debugger component and to the
         * `agentforce.openTrace` deep-link path when no explicit `stepId`
         * is provided in the URL.
         *
         * Status values that count as "error" mirror the strings emitted
         * by Salesforce's GenAiInteractionStep payloads — see Engineer 4
         * fixtures. We accept the small string-literal union locally
         * rather than tightening `Status: string` on the entity type.
         */
        jumpToFirstError: state => {
            if (!state.steps || state.steps.length === 0) {
                state.currentStepIndex = -1;
                return;
            }
            const firstError = state.steps.findIndex(
                s => s.Status === 'Error' || s.Status === 'Failed' || s.Status === 'Timeout'
            );
            state.currentStepIndex = firstError === -1 ? -1 : firstError;
            state.playbackActive = false;
        },
    },
    extraReducers: builder => {
        builder
            .addCase(fetchInteractions.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchInteractions.fulfilled, (state, action) => {
                state.loading = false;
                // Custom sort: surface failed/timeout/error interactions to
                // the top, then fall back to the server's StartTime DESC
                // order for the rest. Stable sort preserves SOQL order
                // within each bucket.
                state.interactions = sortFailedFirst(action.payload);
                state.selectedInteractionId = null;
                state.steps = [];
            })
            .addCase(fetchInteractions.rejected, (state, action) => {
                // Stale-vs-clear policy: KEEP stale interactions — the
                // history list is not scoped to a transient selection, and
                // a flapping query (during polling) shouldn't blank the
                // user's debugger session.
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            })
            .addCase(fetchSteps.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchSteps.fulfilled, (state, action) => {
                state.loading = false;
                state.steps = action.payload;
                state.currentStepIndex = -1;
                state.playbackActive = false;

                // Consume any pending deep-link jump intent. We do this
                // here (rather than via a setTimeout in the caller) so the
                // jump is deterministic w.r.t. the payload landing.
                const intent = state.pendingJumpIntent;
                state.pendingJumpIntent = null;
                if (!intent) return;
                if (intent === 'firstError') {
                    const idx = state.steps.findIndex(
                        s => s.Status === 'Error' || s.Status === 'Failed' || s.Status === 'Timeout'
                    );
                    state.currentStepIndex = idx === -1 ? -1 : idx;
                    return;
                }
                // { stepOrder } — match against StepOrder (1-based). If not
                // found, leave the cursor at -1.
                const target = intent.stepOrder;
                const stepIdx = state.steps.findIndex(s => s.StepOrder === target);
                state.currentStepIndex = stepIdx;
            })
            .addCase(fetchSteps.rejected, (state, action) => {
                // Stale-vs-clear policy: CLEAR — steps are scoped to the
                // selected interaction. Showing the previous interaction's
                // steps under a new interaction's title would be misleading
                // and would also leave playback indices invalid.
                state.loading = false;
                state.error = errorMessage(action.error?.message);
                state.steps = [];
                state.currentStepIndex = -1;
                state.playbackActive = false;
            });
    },
});

export const reduxSlice = debuggerSlice;

injectReducer('agentforceDebugger', debuggerSlice.reducer);
