import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ConnectorLike } from 'host-api/connector';
import { injectReducer } from 'host-api/store';

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
};

function errorMessage(err: unknown): string {
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
}

function normalizeQueryRecords<T>(res: unknown): T[] {
    const records = (res as { records?: T[] })?.records;
    return Array.isArray(records) ? records : [];
}

async function toolingQuery<T>(connector: ConnectorLike, soql: string): Promise<T[]> {
    const tooling = (
        connector as { conn?: { tooling?: { query?: (soql: string) => Promise<unknown> } } }
    )?.conn?.tooling;
    if (!tooling?.query) {
        throw new Error('Tooling API is not available for this connection.');
    }
    const res = await tooling.query(soql);
    return normalizeQueryRecords<T>(res);
}

export const fetchInteractions = createAsyncThunk(
    'agentforceDebugger/fetchInteractions',
    async ({ connector, agentId }: { connector: ConnectorLike; agentId: string }) => {
        return toolingQuery<GenAiInteraction>(
            connector,
            `SELECT Id, ConversationIdentifier, PlannerId, StartTime, EndTime, Status FROM GenAiInteraction WHERE PlannerId = '${agentId}' ORDER BY StartTime DESC LIMIT 50`
        );
    }
);

export const fetchSteps = createAsyncThunk(
    'agentforceDebugger/fetchSteps',
    async ({ connector, interactionId }: { connector: ConnectorLike; interactionId: string }) => {
        return toolingQuery<GenAiInteractionStep>(
            connector,
            `SELECT Id, GenAiInteractionId, StepType, StepInput, StepOutput, Duration, TokenCount, Status, StepOrder FROM GenAiInteractionStep WHERE GenAiInteractionId = '${interactionId}' ORDER BY StepOrder`
        );
    }
);

const debuggerSlice = createSlice({
    name: 'agentforceDebugger',
    initialState,
    reducers: {
        selectInteraction: (state, action: { payload: string }) => {
            state.selectedInteractionId = action.payload;
            state.steps = [];
            state.currentStepIndex = -1;
            state.playbackActive = false;
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
    },
    extraReducers: builder => {
        builder
            .addCase(fetchInteractions.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchInteractions.fulfilled, (state, action) => {
                state.loading = false;
                state.interactions = action.payload;
                state.selectedInteractionId = null;
                state.steps = [];
            })
            .addCase(fetchInteractions.rejected, (state, action) => {
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
            })
            .addCase(fetchSteps.rejected, (state, action) => {
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            });
    },
});

export const reduxSlice = debuggerSlice;

injectReducer('agentforceDebugger', debuggerSlice.reducer);
