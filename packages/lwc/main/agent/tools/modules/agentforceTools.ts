import type { ConnectorLike } from 'core/connector';
import { store } from 'core/store';
import LOGGER from 'shared/logger';
import { z } from 'zod';

function getConnector(): ConnectorLike | null {
    const state = store.getState();
    return state.application?.connector || null;
}

async function toolingQuery<T = Record<string, unknown>>(soql: string): Promise<T[]> {
    const connector = getConnector();
    if (!connector?.conn?.tooling?.query) {
        throw new Error('No active org connection or Tooling API unavailable.');
    }
    const queryExecution = connector.conn.tooling.query<T>(soql);
    const records = await queryExecution.run({
        responseTarget: 'Records',
        autoFetch: true,
        maxFetch: 100000,
    });
    return records || [];
}

export const agentforceListAgentsTool = {
    name: 'agentforce_list_agents',
    description: 'List all Agentforce agents (GenAiPlanner) in the connected org',
    parameters: z.object({}),
    execute: async () => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            const records = await toolingQuery(
                'SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPlanner ORDER BY MasterLabel'
            );
            return { agents: records, count: records.length };
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
        agentId: z.string().describe('The Id of the Agentforce agent (GenAiPlanner) to describe'),
    }),
    execute: async ({ agentId }: { agentId: string }) => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            const agents = await toolingQuery(
                `SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPlanner WHERE Id = '${agentId}'`
            );
            if (agents.length === 0) {
                return { error: `No agent found with Id: ${agentId}` };
            }
            const agent = agents[0];

            const topics = await toolingQuery(
                `SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPlugin WHERE GenAiPlannerId = '${agentId}'`
            );

            const topicsWithActions = await Promise.all(
                topics.map(async (topic: any) => {
                    const actions = await toolingQuery(
                        `SELECT Id, MasterLabel, DeveloperName, ActionType, FlowDefinitionId FROM GenAiFunction WHERE GenAiPluginId = '${topic.Id}'`
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
        agentId: z.string().describe('The Id of the Agentforce agent (GenAiPlanner)'),
    }),
    execute: async ({ agentId }: { agentId: string }) => {
        try {
            const connector = getConnector();
            if (!connector) {
                return { error: 'Not connected to a Salesforce org. Please connect first.' };
            }
            const records = await toolingQuery(
                `SELECT Id, MasterLabel, DeveloperName, Description FROM GenAiPlugin WHERE GenAiPlannerId = '${agentId}'`
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
            const records = await toolingQuery(
                `SELECT Id, MasterLabel, DeveloperName, ActionType, FlowDefinitionId FROM GenAiFunction WHERE GenAiPluginId = '${topicId}'`
            );
            return { actions: records, count: records.length };
        } catch (err) {
            LOGGER.error('[agentforce_list_actions] Error:', err);
            return { error: err instanceof Error ? err.message : String(err) };
        }
    },
};

export const agentforceTools = [
    agentforceListAgentsTool,
    agentforceDescribeAgentTool,
    agentforceListTopicsTool,
    agentforceListActionsTool,
];
