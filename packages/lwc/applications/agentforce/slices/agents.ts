import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ConnectorLike } from 'host-api/connector';
import { injectReducer } from 'host-api/store';

export interface GenAiPlanner {
    Id: string;
    MasterLabel: string;
    DeveloperName: string;
    Description: string | null;
}

export interface GenAiPlugin {
    Id: string;
    MasterLabel: string;
    DeveloperName: string;
    Description: string | null;
    GenAiPlannerId: string;
}

export interface GenAiFunction {
    Id: string;
    MasterLabel: string;
    DeveloperName: string;
    ActionType: string | null;
    FlowDefinitionId: string | null;
    GenAiPluginId: string;
}

export interface GenAiPromptTemplate {
    Id: string;
    MasterLabel: string;
    DeveloperName: string;
    Description: string | null;
}

export interface FlowRef {
    id: string;
    label: string;
    processType: string;
    actionId: string;
}

export interface ApexRef {
    id: string;
    name: string;
    actionId: string;
}

export interface AgentforceDependencies {
    flows: FlowRef[];
    apexClasses: ApexRef[];
}

export interface AgentforceState {
    agents: GenAiPlanner[];
    topics: GenAiPlugin[];
    actions: GenAiFunction[];
    prompts: GenAiPromptTemplate[];
    dependencies: AgentforceDependencies;
    loading: boolean;
    error: string | null;
    selectedAgentId: string | null;
    selectedTopicId: string | null;
}

const initialState: AgentforceState = {
    agents: [],
    topics: [],
    actions: [],
    prompts: [],
    dependencies: { flows: [], apexClasses: [] },
    loading: false,
    error: null,
    selectedAgentId: null,
    selectedTopicId: null,
};

function errorMessage(err: unknown): string {
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
}

async function toolingQuery<T>(connector: ConnectorLike, soql: string): Promise<T[]> {
    const conn = (connector as { conn?: Record<string, unknown> })?.conn;
    const tooling = conn?.tooling as
        | { query?: (soql: string) => { run: (opts: unknown) => Promise<T[] | null> } }
        | undefined;
    if (!tooling?.query) {
        throw new Error('Tooling API is not available for this connection.');
    }
    const queryExec = tooling.query(soql);
    const records = await queryExec.run({
        responseTarget: 'Records',
        autoFetch: true,
        maxFetch: 10000,
    });
    return records || [];
}

export const fetchAgents = createAsyncThunk(
    'agentforce/fetchAgents',
    async ({ connector }: { connector: ConnectorLike }) => {
        const records = await toolingQuery<{
            Id: string;
            DeveloperName: string;
            MasterLabel: string;
            Description?: string | null;
        }>(
            connector,
            'SELECT Id, DeveloperName, MasterLabel, Description FROM BotDefinition ORDER BY MasterLabel'
        );
        return records.map(r => ({
            Id: r.Id,
            MasterLabel: r.MasterLabel || r.DeveloperName,
            DeveloperName: r.DeveloperName,
            Description: r.Description || null,
        }));
    }
);

export const fetchTopics = createAsyncThunk(
    'agentforce/fetchTopics',
    async ({ connector, agentId }: { connector: ConnectorLike; agentId: string }) => {
        try {
            return await toolingQuery<GenAiPlugin>(
                connector,
                `SELECT Id, MasterLabel, DeveloperName, Description, GenAiPlannerId FROM GenAiPlugin WHERE GenAiPlannerId = '${agentId}'`
            );
        } catch {
            // GenAiPlugin may not be available via Tooling API in all orgs/versions.
            // Try querying via BotDefinition's related topic metadata.
            return [];
        }
    }
);

export const fetchActions = createAsyncThunk(
    'agentforce/fetchActions',
    async ({ connector, topicId }: { connector: ConnectorLike; topicId: string }) => {
        try {
            return await toolingQuery<GenAiFunction>(
                connector,
                `SELECT Id, MasterLabel, DeveloperName, ActionType, FlowDefinitionId, GenAiPluginId FROM GenAiFunction WHERE GenAiPluginId = '${topicId}'`
            );
        } catch {
            return [];
        }
    }
);

export const fetchPromptTemplates = createAsyncThunk(
    'agentforce/fetchPromptTemplates',
    async ({ connector }: { connector: ConnectorLike }) => {
        try {
            return await toolingQuery<GenAiPromptTemplate>(
                connector,
                'SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPromptTemplate ORDER BY MasterLabel'
            );
        } catch {
            return [];
        }
    }
);

export const fetchDependencies = createAsyncThunk(
    'agentforce/fetchDependencies',
    async ({
        connector,
        actions,
    }: {
        connector: ConnectorLike;
        actions: GenAiFunction[];
    }): Promise<AgentforceDependencies> => {
        const flows: FlowRef[] = [];
        const apexClasses: ApexRef[] = [];

        const flowActions = actions.filter(a => a.FlowDefinitionId);
        if (flowActions.length > 0) {
            const flowIds = flowActions.map(a => `'${a.FlowDefinitionId}'`).join(',');
            const flowRecords = await toolingQuery<{
                Id: string;
                MasterLabel: string;
                ActiveVersionId: string;
            }>(
                connector,
                `SELECT Id, MasterLabel, ActiveVersionId FROM FlowDefinition WHERE Id IN (${flowIds})`
            );
            for (const fr of flowRecords) {
                const action = flowActions.find(a => a.FlowDefinitionId === fr.Id);
                if (action) {
                    flows.push({
                        id: fr.Id,
                        label: fr.MasterLabel,
                        processType: '',
                        actionId: action.Id,
                    });
                }
            }
        }

        const apexActions = actions.filter(
            a => a.ActionType && a.ActionType.toLowerCase().includes('apex')
        );
        for (const action of apexActions) {
            apexClasses.push({
                id: action.Id,
                name: action.DeveloperName || action.MasterLabel,
                actionId: action.Id,
            });
        }

        return { flows, apexClasses };
    }
);

const agentforceSlice = createSlice({
    name: 'agentforce',
    initialState,
    reducers: {
        selectAgent: (state, action: { payload: { agentId: string } }) => {
            state.selectedAgentId = action.payload.agentId;
            state.selectedTopicId = null;
            state.topics = [];
            state.actions = [];
            state.dependencies = { flows: [], apexClasses: [] };
        },
        selectTopic: (state, action: { payload: { topicId: string } }) => {
            state.selectedTopicId = action.payload.topicId;
            state.actions = [];
        },
        clearSelection: state => {
            state.selectedAgentId = null;
            state.selectedTopicId = null;
            state.topics = [];
            state.actions = [];
        },
    },
    extraReducers: builder => {
        builder
            .addCase(fetchAgents.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchAgents.fulfilled, (state, action) => {
                state.loading = false;
                state.agents = action.payload;
            })
            .addCase(fetchAgents.rejected, (state, action) => {
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            })
            .addCase(fetchTopics.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchTopics.fulfilled, (state, action) => {
                state.loading = false;
                state.topics = action.payload;
            })
            .addCase(fetchTopics.rejected, (state, action) => {
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            })
            .addCase(fetchActions.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchActions.fulfilled, (state, action) => {
                state.loading = false;
                state.actions = action.payload;
            })
            .addCase(fetchActions.rejected, (state, action) => {
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            })
            .addCase(fetchPromptTemplates.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchPromptTemplates.fulfilled, (state, action) => {
                state.loading = false;
                state.prompts = action.payload;
            })
            .addCase(fetchPromptTemplates.rejected, (state, action) => {
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            })
            .addCase(fetchDependencies.pending, state => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchDependencies.fulfilled, (state, action) => {
                state.loading = false;
                state.dependencies = action.payload;
            })
            .addCase(fetchDependencies.rejected, (state, action) => {
                state.loading = false;
                state.error = errorMessage(action.error?.message);
            });
    },
});

export const reduxSlice = agentforceSlice;

injectReducer('agentforce', agentforceSlice.reducer);
