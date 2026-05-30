import { hasCommand, invokeCommand } from 'host-api/commands';
import type { AgentforceTab } from 'host-api/commands';
import type { ConnectorLike } from 'host-api/connector';
import { store } from 'host-api/store';
import LOGGER from 'shared/logger';
import { runSoqlQuery, asSalesforceId, escapeSoqlLiteral } from 'shared/soqlQuery/soqlQuery';
import { z } from 'zod';

/**
 * Step row returned by `agentforce_get_interaction_steps`.
 *
 * Mirrors the shape declared in
 * `applications/agentforce/slices/debugger.ts` but intentionally OMITS
 * `StepInput` / `StepOutput`: those fields are large JSON blobs and would
 * blow the AI context window. The agent UI lazy-loads them per step
 * (X3a perf item); this tool returns metadata only.
 */
export interface GenAiInteractionStepSummary {
    Id: string;
    GenAiInteractionId: string;
    StepType: string;
    Status: string;
    StepOrder: number;
    Duration: number;
    TokenCount: number | null;
}

/** N1b consensus cap — never let the AI tool response exceed 200 rows. */
const STEP_LIST_HARD_CAP = 200;
const AGENT_LIST_HARD_CAP = 200;
const AGENT_LIST_DEFAULT_LIMIT = 50;
const STEP_LIST_DEFAULT_LIMIT = 200;

const SF_ID_REGEX = /^[a-zA-Z0-9]{15,18}$/;
const SF_ID_MESSAGE = 'Must be a 15- or 18-char Salesforce ID';

function getConnector(): ConnectorLike | null {
    const state = store.getState();
    return state.application?.connector || null;
}

async function toolingQuery<T = Record<string, unknown>>(soql: string): Promise<T[]> {
    const connector = getConnector();
    if (!connector) {
        throw new Error('No active org connection.');
    }
    return runSoqlQuery<T>(connector, soql);
}

const listAgentsParams = z.object({
    query: z
        .string()
        .optional()
        .describe(
            'Optional case-insensitive substring filter applied to MasterLabel and DeveloperName.'
        ),
    limit: z
        .number()
        .int()
        .positive()
        .max(AGENT_LIST_HARD_CAP)
        .optional()
        .describe(
            `Max rows to return. Default ${AGENT_LIST_DEFAULT_LIMIT}, hard cap ${AGENT_LIST_HARD_CAP}.`
        ),
});

export const agentforceListAgentsTool = {
    name: 'agentforce_list_agents',
    description:
        'List Agentforce agents (BotDefinition) in the connected org. Supports optional substring filtering and pagination; returns at most 200 rows with a truncated flag when more match.',
    parameters: listAgentsParams,
    execute: async (
        args: { query?: string; limit?: number } = {}
    ): Promise<
        { agents: Array<Record<string, unknown>>; truncated: boolean } | { error: string }
    > => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            const limit = args.limit ?? AGENT_LIST_DEFAULT_LIMIT;
            let where = '';
            if (typeof args.query === 'string' && args.query.trim() !== '') {
                const escaped = escapeSoqlLiteral(args.query.trim());
                where = ` WHERE MasterLabel LIKE '%${escaped}%' OR DeveloperName LIKE '%${escaped}%'`;
            }
            const soql = `SELECT Id, MasterLabel, DeveloperName, Description FROM BotDefinition${where} ORDER BY MasterLabel LIMIT ${limit + 1}`;
            const records = await runSoqlQuery<Record<string, unknown>>(connector, soql, {
                mode: 'tooling',
                paging: { mode: 'first-page', cap: limit + 1 },
            });
            const truncated = records.length > limit;
            return {
                agents: truncated ? records.slice(0, limit) : records,
                truncated,
            };
        } catch (err) {
            LOGGER.error('[agentforce_list_agents] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

export const agentforceDescribeAgentTool = {
    name: 'agentforce_describe_agent',
    description:
        'Get full configuration of a specific Agentforce agent including its topics and actions',
    parameters: z.object({
        agentId: z.string().describe('The Id of the Agentforce agent (BotDefinition) to describe'),
    }),
    execute: async ({ agentId }: { agentId: string }) => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            const safeAgentId = asSalesforceId(agentId);
            const agents = await toolingQuery<{ Id: string }>(
                `SELECT Id, MasterLabel, DeveloperName, Description FROM BotDefinition WHERE Id = '${safeAgentId}'`
            );
            if (agents.length === 0) {
                return { error: `No agent found with Id: ${agentId}` };
            }
            const agent = agents[0];

            const topics = await toolingQuery<{ Id: string }>(
                `SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPlugin WHERE GenAiPlannerId = '${safeAgentId}'`
            );

            const topicsWithActions = await Promise.all(
                topics.map(async topic => {
                    const safeTopicId = asSalesforceId(topic.Id);
                    const actions = await toolingQuery(
                        `SELECT Id, MasterLabel, DeveloperName, ActionType, FlowDefinitionId FROM GenAiFunction WHERE GenAiPluginId = '${safeTopicId}'`
                    );
                    return { ...topic, actions };
                })
            );

            return { agent, topics: topicsWithActions };
        } catch (err) {
            LOGGER.error('[agentforce_describe_agent] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

export const agentforceListTopicsTool = {
    name: 'agentforce_list_topics',
    description: 'List topics (GenAiPlugin) for a specific Agentforce agent',
    parameters: z.object({
        agentId: z.string().describe('The Id of the Agentforce agent (BotDefinition)'),
    }),
    execute: async ({ agentId }: { agentId: string }) => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            const safeAgentId = asSalesforceId(agentId);
            const records = await toolingQuery(
                `SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPlugin WHERE GenAiPlannerId = '${safeAgentId}'`
            );
            return { topics: records, count: records.length };
        } catch (err) {
            LOGGER.error('[agentforce_list_topics] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

export const agentforceListActionsTool = {
    name: 'agentforce_list_actions',
    description: 'List actions (GenAiFunction) for a specific topic',
    parameters: z.object({
        topicId: z.string().describe('The Id of the topic (GenAiPlugin)'),
    }),
    execute: async ({ topicId }: { topicId: string }) => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            const safeTopicId = asSalesforceId(topicId);
            const records = await toolingQuery(
                `SELECT Id, MasterLabel, DeveloperName, ActionType, FlowDefinitionId FROM GenAiFunction WHERE GenAiPluginId = '${safeTopicId}'`
            );
            return { actions: records, count: records.length };
        } catch (err) {
            LOGGER.error('[agentforce_list_actions] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

const getInteractionStepsParams = z.object({
    interactionId: z.string().regex(SF_ID_REGEX, SF_ID_MESSAGE),
    limit: z.number().int().positive().max(STEP_LIST_HARD_CAP).optional(),
});

export const agentforceGetInteractionStepsTool = {
    name: 'agentforce_get_interaction_steps',
    description:
        'Get the ordered step list for a GenAi interaction (conversation). Returns up to 200 step metadata rows (no StepInput/StepOutput); if more exist, truncated:true is set.',
    parameters: getInteractionStepsParams,
    execute: async ({
        interactionId,
        limit = STEP_LIST_DEFAULT_LIMIT,
    }: {
        interactionId: string;
        limit?: number;
    }): Promise<
        { steps: GenAiInteractionStepSummary[]; truncated: boolean } | { error: string }
    > => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            // Defense-in-depth: zod already enforced shape, but `asSalesforceId`
            // gives us the branded type and a second layer of validation.
            const safeId = asSalesforceId(interactionId);
            // NOTE: do NOT include StepInput/StepOutput — they are large JSON
            // blobs that would blow the AI context window. The X3a perf item
            // lazy-loads those in the UI.
            const soql = `SELECT Id, GenAiInteractionId, StepType, Status, StepOrder, Duration, TokenCount FROM GenAiInteractionStep WHERE GenAiInteractionId = '${safeId}' ORDER BY StepOrder ASC LIMIT ${limit + 1}`;
            const records = await runSoqlQuery<GenAiInteractionStepSummary>(connector, soql, {
                mode: 'tooling',
                paging: { mode: 'first-page', cap: limit + 1 },
            });
            const truncated = records.length > limit;
            return {
                steps: truncated ? records.slice(0, limit) : records,
                truncated,
            };
        } catch (err) {
            LOGGER.error('[agentforce_get_interaction_steps] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

const openInExplorerParams = z.object({
    agentId: z.string().regex(SF_ID_REGEX, SF_ID_MESSAGE).optional(),
    name: z.string().optional(),
    conversationId: z.string().regex(SF_ID_REGEX, SF_ID_MESSAGE).optional(),
    tab: z.enum(['inspector', 'debugger', 'dependencies', 'editor']).optional(),
});

export const agentforceOpenInExplorerTool = {
    name: 'agentforce_open_in_explorer',
    description:
        'Open the Agentforce Explorer UI focused on a specific agent or conversation trace. Either agentId/name or conversationId is required.',
    parameters: openInExplorerParams,
    execute: async ({
        agentId,
        name,
        conversationId,
        tab,
    }: {
        agentId?: string;
        name?: string;
        conversationId?: string;
        tab?: AgentforceTab;
    }): Promise<{ ok: true; opened: 'trace' | 'agent' } | { error: string }> => {
        try {
            if (conversationId) {
                if (!hasCommand('agentforce.openTrace')) {
                    return { error: 'Agentforce app not loaded — cannot open trace' };
                }
                await invokeCommand('agentforce.openTrace', { conversationId });
                return { ok: true, opened: 'trace' };
            }
            if (agentId || name) {
                if (!hasCommand('agentforce.openAgent')) {
                    return { error: 'Agentforce app not loaded — cannot open agent' };
                }
                await invokeCommand('agentforce.openAgent', { agentId, name, tab });
                return { ok: true, opened: 'agent' };
            }
            return { error: 'Must provide agentId, name, or conversationId' };
        } catch (err) {
            LOGGER.error('[agentforce_open_in_explorer] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

export const agentforceTools = [
    agentforceListAgentsTool,
    agentforceDescribeAgentTool,
    agentforceListTopicsTool,
    agentforceListActionsTool,
    agentforceGetInteractionStepsTool,
    agentforceOpenInExplorerTool,
];
