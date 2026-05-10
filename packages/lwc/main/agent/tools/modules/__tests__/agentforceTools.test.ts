import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { __setMockState } from 'core/store';
import {
    agentforceListAgentsTool,
    agentforceDescribeAgentTool,
    agentforceListTopicsTool,
    agentforceListActionsTool,
    agentforceTools,
} from '../agentforceTools.ts';

function createMockConnector(queryFn: (soql: string) => any) {
    return {
        conn: {
            tooling: {
                query: (soql: string) => ({
                    run: async () => queryFn(soql),
                }),
            },
        },
        configuration: {},
    };
}

function setConnected(queryFn: (soql: string) => any) {
    __setMockState({ application: { connector: createMockConnector(queryFn) } });
}

function setDisconnected() {
    __setMockState({ application: { connector: null } });
}

beforeEach(() => {
    setDisconnected();
});

describe('agentforceTools array', () => {
    it('exports exactly 4 tools', () => {
        assert.equal(agentforceTools.length, 4);
    });

    it('contains all expected tool names', () => {
        const names = agentforceTools.map(t => t.name);
        assert.deepEqual(names, [
            'agentforce_list_agents',
            'agentforce_describe_agent',
            'agentforce_list_topics',
            'agentforce_list_actions',
        ]);
    });
});

describe('agentforce_list_agents', () => {
    it('returns formatted agent list when connected', async () => {
        const agents = [
            {
                Id: '0Xx1',
                MasterLabel: 'Sales Agent',
                DeveloperName: 'Sales_Agent',
                Description: 'Helps with sales',
            },
            {
                Id: '0Xx2',
                MasterLabel: 'Service Agent',
                DeveloperName: 'Service_Agent',
                Description: null,
            },
        ];
        setConnected(() => agents);

        const result = await agentforceListAgentsTool.execute();
        assert.deepEqual(result, { agents, count: 2 });
    });

    it('returns error message when not connected', async () => {
        setDisconnected();

        const result = await agentforceListAgentsTool.execute();
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('handles empty results gracefully', async () => {
        setConnected(() => []);

        const result = await agentforceListAgentsTool.execute();
        assert.deepEqual(result, { agents: [], count: 0 });
    });

    it('returns error when tooling query throws', async () => {
        setConnected(() => {
            throw new Error('INVALID_SESSION_ID');
        });

        const result = await agentforceListAgentsTool.execute();
        assert.deepEqual(result, { error: 'INVALID_SESSION_ID' });
    });

    it('returns error when connector has no tooling API', async () => {
        __setMockState({ application: { connector: { conn: {}, configuration: {} } } });

        const result = await agentforceListAgentsTool.execute();
        assert.ok((result as any).error.includes('Tooling API unavailable'));
    });
});

describe('agentforce_describe_agent', () => {
    it('returns full config with topics and actions', async () => {
        const agent = {
            Id: '0Xx1',
            MasterLabel: 'Sales Agent',
            DeveloperName: 'Sales_Agent',
            Description: 'desc',
        };
        const topic1 = {
            Id: '0Xp1',
            MasterLabel: 'Leads',
            DeveloperName: 'Leads',
            Description: 'Lead handling',
        };
        const topic2 = {
            Id: '0Xp2',
            MasterLabel: 'Opps',
            DeveloperName: 'Opps',
            Description: 'Opp handling',
        };
        const action1 = {
            Id: '0Xf1',
            MasterLabel: 'Create Lead',
            DeveloperName: 'Create_Lead',
            ActionType: 'Flow',
            FlowDefinitionId: 'flow1',
        };
        const action2 = {
            Id: '0Xf2',
            MasterLabel: 'Update Opp',
            DeveloperName: 'Update_Opp',
            ActionType: 'Apex',
            FlowDefinitionId: null,
        };

        setConnected((soql: string) => {
            if (soql.includes('FROM GenAiPlanner')) return [agent];
            if (soql.includes('FROM GenAiPlugin')) return [topic1, topic2];
            if (soql.includes('FROM GenAiFunction') && soql.includes("'0Xp1'")) return [action1];
            if (soql.includes('FROM GenAiFunction') && soql.includes("'0Xp2'")) return [action2];
            return [];
        });

        const result = await agentforceDescribeAgentTool.execute({ agentId: '0Xx1' });
        assert.deepEqual(result, {
            agent,
            topics: [
                { ...topic1, actions: [action1] },
                { ...topic2, actions: [action2] },
            ],
        });
    });

    it('returns error for invalid/missing agentId', async () => {
        setConnected((soql: string) => {
            if (soql.includes('FROM GenAiPlanner')) return [];
            return [];
        });

        const result = await agentforceDescribeAgentTool.execute({ agentId: 'nonexistent' });
        assert.deepEqual(result, { error: 'No agent found with Id: nonexistent' });
    });

    it('returns error when not connected', async () => {
        setDisconnected();

        const result = await agentforceDescribeAgentTool.execute({ agentId: '0Xx1' });
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('handles agent with no topics', async () => {
        const agent = {
            Id: '0Xx1',
            MasterLabel: 'Empty Agent',
            DeveloperName: 'Empty',
            Description: null,
        };
        setConnected((soql: string) => {
            if (soql.includes('FROM GenAiPlanner')) return [agent];
            if (soql.includes('FROM GenAiPlugin')) return [];
            return [];
        });

        const result = await agentforceDescribeAgentTool.execute({ agentId: '0Xx1' });
        assert.deepEqual(result, { agent, topics: [] });
    });
});

describe('agentforce_list_topics', () => {
    it('returns topics for valid agent', async () => {
        const topics = [
            { Id: '0Xp1', MasterLabel: 'Topic A', DeveloperName: 'Topic_A', Description: 'First' },
            { Id: '0Xp2', MasterLabel: 'Topic B', DeveloperName: 'Topic_B', Description: 'Second' },
        ];
        setConnected(() => topics);

        const result = await agentforceListTopicsTool.execute({ agentId: '0Xx1' });
        assert.deepEqual(result, { topics, count: 2 });
    });

    it('returns error when not connected', async () => {
        setDisconnected();

        const result = await agentforceListTopicsTool.execute({ agentId: '0Xx1' });
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('returns empty list when agent has no topics', async () => {
        setConnected(() => []);

        const result = await agentforceListTopicsTool.execute({ agentId: '0Xx1' });
        assert.deepEqual(result, { topics: [], count: 0 });
    });

    it('queries with correct agentId in SOQL', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await agentforceListTopicsTool.execute({ agentId: '0XxABC123' });
        assert.ok(capturedSoql.includes("GenAiPlannerId = '0XxABC123'"));
    });
});

describe('agentforce_list_actions', () => {
    it('returns actions for valid topic', async () => {
        const actions = [
            {
                Id: '0Xf1',
                MasterLabel: 'Action 1',
                DeveloperName: 'Action_1',
                ActionType: 'Flow',
                FlowDefinitionId: 'flow1',
            },
            {
                Id: '0Xf2',
                MasterLabel: 'Action 2',
                DeveloperName: 'Action_2',
                ActionType: 'Apex',
                FlowDefinitionId: null,
            },
        ];
        setConnected(() => actions);

        const result = await agentforceListActionsTool.execute({ topicId: '0Xp1' });
        assert.deepEqual(result, { actions, count: 2 });
    });

    it('returns error when not connected', async () => {
        setDisconnected();

        const result = await agentforceListActionsTool.execute({ topicId: '0Xp1' });
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('returns empty list when topic has no actions', async () => {
        setConnected(() => []);

        const result = await agentforceListActionsTool.execute({ topicId: '0Xp1' });
        assert.deepEqual(result, { actions: [], count: 0 });
    });

    it('queries with correct topicId in SOQL', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await agentforceListActionsTool.execute({ topicId: '0XpDEF456' });
        assert.ok(capturedSoql.includes("GenAiPluginId = '0XpDEF456'"));
    });
});
