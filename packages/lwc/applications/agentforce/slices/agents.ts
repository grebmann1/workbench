import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { ConnectorLike } from 'host-api/connector';
import { injectReducer } from 'host-api/store';
import { createMetadataApiClient, unzipRetrieveZip } from 'shared/metadataApi';

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

export interface AgentScript {
    fullName: string;
    type: string;
    fileName: string;
    lastModifiedDate: string;
}

export interface AgentScriptContent {
    fullName: string;
    agentSource: string;
    bundleMeta: string | null;
}

export interface AgentforceDependencies {
    flows: FlowRef[];
    apexClasses: ApexRef[];
}

export type ApiMode = 'tooling' | 'data';

export interface AgentforceState {
    agents: GenAiPlanner[];
    agentScripts: AgentScript[];
    topics: GenAiPlugin[];
    actions: GenAiFunction[];
    prompts: GenAiPromptTemplate[];
    dependencies: AgentforceDependencies;
    loading: boolean;
    error: string | null;
    selectedAgentId: string | null;
    selectedTopicId: string | null;
    apiMode: ApiMode;
    selectedScriptContent: AgentScriptContent | null;
    scriptContentLoading: boolean;
}

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

function errorMessage(err: unknown): string {
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
}

const AGENTFORCE_METADATA_MIN_API_VERSION = '63.0';

function getAgentforceMetadataApiVersion(conn: Record<string, unknown> | undefined): string {
    const rawVersion = String((conn as { version?: string } | undefined)?.version || '').trim();
    const parsed = Number.parseFloat(rawVersion);
    const minParsed = Number.parseFloat(AGENTFORCE_METADATA_MIN_API_VERSION);
    if (!Number.isFinite(parsed) || parsed < minParsed) {
        return AGENTFORCE_METADATA_MIN_API_VERSION;
    }
    return rawVersion;
}

function getFirstXmlText(parent: Document | Element, tagName: string): string {
    const el =
        parent.getElementsByTagNameNS?.('*', tagName)?.[0] ||
        parent.getElementsByTagName(tagName)?.[0];
    return String(el?.textContent || '').trim();
}

function parseMetadataListFromXml(xmlLike: string | Document): Record<string, unknown>[] {
    const doc =
        typeof xmlLike === 'string'
            ? new DOMParser().parseFromString(xmlLike, 'application/xml')
            : xmlLike;
    const resultNodes = Array.from(doc.getElementsByTagNameNS?.('*', 'result') || []);
    if (!resultNodes.length) return [];
    return resultNodes.map(node => ({
        fullName: getFirstXmlText(node, 'fullName'),
        type: getFirstXmlText(node, 'type'),
        fileName: getFirstXmlText(node, 'fileName'),
        lastModifiedDate: getFirstXmlText(node, 'lastModifiedDate'),
    }));
}

function normalizeMetadataListResults(results: unknown): Record<string, unknown>[] {
    if (!results) return [];
    if (Array.isArray(results)) return results as Record<string, unknown>[];
    if (typeof results === 'string' && results.includes('<listMetadataResponse')) {
        return parseMetadataListFromXml(results);
    }
    if (typeof Document !== 'undefined' && results instanceof Document) {
        return parseMetadataListFromXml(results);
    }
    if (typeof results === 'object') {
        const maybeObject = results as { result?: unknown };
        if (Array.isArray(maybeObject.result)) {
            return maybeObject.result as Record<string, unknown>[];
        }
        if (maybeObject.result && typeof maybeObject.result === 'object') {
            return [maybeObject.result as Record<string, unknown>];
        }
        return [results as Record<string, unknown>];
    }
    return [];
}

type QueryApi = { query?: (soql: string) => { run: (opts: unknown) => Promise<unknown[] | null> } };

async function soqlQuery<T>(
    connector: ConnectorLike,
    soql: string,
    mode: ApiMode = 'tooling'
): Promise<T[]> {
    const conn = (connector as { conn?: Record<string, unknown> })?.conn;
    let api: QueryApi | undefined;
    if (mode === 'tooling') {
        api = conn?.tooling as QueryApi | undefined;
    } else {
        api = conn as QueryApi | undefined;
    }
    if (!api?.query) {
        throw new Error(
            `${mode === 'tooling' ? 'Tooling' : 'Data'} API is not available for this connection.`
        );
    }
    const queryExec = api.query(soql);
    const records = await queryExec.run({
        responseTarget: 'Records',
        autoFetch: true,
        maxFetch: 10000,
    });
    return (records as T[] | null) || [];
}

export const fetchAgents = createAsyncThunk(
    'agentforce/fetchAgents',
    async ({ connector, apiMode = 'tooling' }: { connector: ConnectorLike; apiMode?: ApiMode }) => {
        try {
            const records = await soqlQuery<{
                Id: string;
                DeveloperName: string;
                MasterLabel: string;
                Description?: string | null;
            }>(
                connector,
                'SELECT Id, DeveloperName, MasterLabel, Description FROM BotDefinition ORDER BY MasterLabel',
                apiMode
            );
            return records.map(r => ({
                Id: r.Id,
                MasterLabel: r.MasterLabel || r.DeveloperName,
                DeveloperName: r.DeveloperName,
                Description: r.Description || null,
            }));
        } catch {
            return [];
        }
    }
);

export const fetchAgentScripts = createAsyncThunk(
    'agentforce/fetchAgentScripts',
    async ({ connector }: { connector: ConnectorLike }) => {
        const conn = (connector as { conn?: Record<string, unknown> })?.conn;
        const metaClient = createMetadataApiClient({
            connection: conn as never,
            apiVersion: getAgentforceMetadataApiVersion(conn),
        });
        const results = await metaClient.listMetadata({
            queries: [{ type: 'AiAuthoringBundle', folder: null }],
        });
        const records = normalizeMetadataListResults(results);
        return records
            .map(r => ({
                fullName: (r.fullName as string) || '',
                type: (r.type as string) || 'AiAuthoringBundle',
                fileName: (r.fileName as string) || '',
                lastModifiedDate: (r.lastModifiedDate as string) || '',
            }))
            .filter(r => Boolean(r.fullName));
    }
);

export const fetchAgentScriptContent = createAsyncThunk(
    'agentforce/fetchAgentScriptContent',
    async ({
        connector,
        fullName,
    }: {
        connector: ConnectorLike;
        fullName: string;
    }): Promise<AgentScriptContent> => {
        const conn = (connector as { conn?: Record<string, unknown> })?.conn;
        // SOAP metadata.retrieve() — zip-based async flow
        const metaClient = createMetadataApiClient({
            connection: conn as never,
            apiVersion: getAgentforceMetadataApiVersion(conn),
        });
        const typesMap = new Map([['AiAuthoringBundle', [fullName]]]);
        const { id } = await metaClient.retrieve({ typesMap });

        const TIMEOUT = 30000;
        const POLL_INTERVAL = 1500;
        const startedAt = Date.now();
        let status: { done: boolean; success: boolean; zipFile: string; errorMessage: string };
        do {
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            status = (await metaClient.checkRetrieveStatus(id, {
                includeZip: true,
            })) as typeof status;
            if (Date.now() - startedAt > TIMEOUT) throw new Error('Retrieve timed out');
        } while (!status.done);

        if (!status.success || !status.zipFile) {
            throw new Error(status.errorMessage || 'Retrieve failed');
        }

        const files = unzipRetrieveZip(status.zipFile);
        let agentSource = '';
        let bundleMeta: string | null = null;
        const decoder = new TextDecoder();
        for (const [path, bytes] of Object.entries(files)) {
            if (path.endsWith('.agent')) agentSource = decoder.decode(bytes as Uint8Array);
            if (path.endsWith('.bundle-meta.xml')) bundleMeta = decoder.decode(bytes as Uint8Array);
        }

        return { fullName, agentSource, bundleMeta };
    }
);

export const fetchTopics = createAsyncThunk(
    'agentforce/fetchTopics',
    async ({
        connector,
        agentId,
        apiMode = 'tooling',
    }: {
        connector: ConnectorLike;
        agentId: string;
        apiMode?: ApiMode;
    }) => {
        try {
            return await soqlQuery<GenAiPlugin>(
                connector,
                `SELECT Id, MasterLabel, DeveloperName, Description, GenAiPlannerId FROM GenAiPlugin WHERE GenAiPlannerId = '${agentId}'`,
                apiMode
            );
        } catch {
            return [];
        }
    }
);

export const fetchActions = createAsyncThunk(
    'agentforce/fetchActions',
    async ({
        connector,
        topicId,
        apiMode = 'tooling',
    }: {
        connector: ConnectorLike;
        topicId: string;
        apiMode?: ApiMode;
    }) => {
        try {
            return await soqlQuery<GenAiFunction>(
                connector,
                `SELECT Id, MasterLabel, DeveloperName, ActionType, FlowDefinitionId, GenAiPluginId FROM GenAiFunction WHERE GenAiPluginId = '${topicId}'`,
                apiMode
            );
        } catch {
            return [];
        }
    }
);

export const fetchPromptTemplates = createAsyncThunk(
    'agentforce/fetchPromptTemplates',
    async ({ connector, apiMode = 'tooling' }: { connector: ConnectorLike; apiMode?: ApiMode }) => {
        try {
            return await soqlQuery<GenAiPromptTemplate>(
                connector,
                'SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPromptTemplate ORDER BY MasterLabel',
                apiMode
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
        apiMode = 'tooling',
    }: {
        connector: ConnectorLike;
        actions: GenAiFunction[];
        apiMode?: ApiMode;
    }): Promise<AgentforceDependencies> => {
        const flows: FlowRef[] = [];
        const apexClasses: ApexRef[] = [];

        const flowActions = actions.filter(a => a.FlowDefinitionId);
        if (flowActions.length > 0) {
            const flowIds = flowActions.map(a => `'${a.FlowDefinitionId}'`).join(',');
            const flowRecords = await soqlQuery<{
                Id: string;
                MasterLabel: string;
                ActiveVersionId: string;
            }>(
                connector,
                `SELECT Id, MasterLabel, ActiveVersionId FROM FlowDefinition WHERE Id IN (${flowIds})`,
                apiMode
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
            state.selectedScriptContent = null;
        },
        selectTopic: (state, action: { payload: { topicId: string } }) => {
            state.selectedTopicId = action.payload.topicId;
            state.actions = [];
            state.selectedScriptContent = null;
        },
        clearSelection: state => {
            state.selectedAgentId = null;
            state.selectedTopicId = null;
            state.topics = [];
            state.actions = [];
        },
        setApiMode: (state, action: { payload: ApiMode }) => {
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
            })
            .addCase(fetchAgentScripts.fulfilled, (state, action) => {
                state.agentScripts = action.payload;
            })
            .addCase(fetchAgentScripts.rejected, (state, action) => {
                state.agentScripts = [];
                state.error = errorMessage(action.error?.message);
            })
            .addCase(fetchAgentScriptContent.pending, state => {
                state.scriptContentLoading = true;
                state.error = null;
            })
            .addCase(fetchAgentScriptContent.fulfilled, (state, action) => {
                state.scriptContentLoading = false;
                state.selectedScriptContent = action.payload;
            })
            .addCase(fetchAgentScriptContent.rejected, (state, action) => {
                state.scriptContentLoading = false;
                state.error = errorMessage(action.error?.message);
            });
    },
});

export const reduxSlice = agentforceSlice;

injectReducer('agentforce', agentforceSlice.reducer);
