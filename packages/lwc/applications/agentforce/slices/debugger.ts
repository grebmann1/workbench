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
}

const initialState: DebuggerState = {
    interactions: [],
    selectedInteractionId: null,
    steps: [],
    loading: false,
    error: null,
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
        },
        clearDebugger: state => {
            state.interactions = [];
            state.selectedInteractionId = null;
            state.steps = [];
            state.error = null;
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
            })
            .addCase(fetchSteps.rejected, (state, action) => {
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            });
    },
});

export const reduxSlice = debuggerSlice;

injectReducer('agentforceDebugger', debuggerSlice.reducer);
