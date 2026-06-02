/**
 * Regression tests for the agent-tools surface in `agentforceTools.ts`.
 *
 * Covers:
 * - F1: imports come from `host-api/store` and `host-api/connector` (the
 *   mock hook intercepts both, so the source module's import paths are
 *   exercised directly).
 * - N1a: each agent-listing / describe SOQL targets the renamed parent
 *   entity `BotDefinition` (not the legacy `GenAiPlanner`).
 * - N17: the source file contains zero raw `GenAiPlanner` entity references;
 *   the only surviving substring is the FK column `GenAiPlannerId` on
 *   `GenAiPlugin`, which Salesforce did NOT rename and which the migrated
 *   slice (`applications/agentforce/slices/agents.ts:303`) still uses.
 *
 * The mocking strategy mirrors the original test file: a Node loader hook
 * (`./agentforceTools.hooks.mjs`) intercepts `core/store`, `host-api/store`,
 * `shared/logger`, `core/connector`, and `host-api/connector` with light
 * stubs so we can import the source module without dragging in the full
 * LWC runtime. The hook is registered programmatically here (rather than
 * via the global `tools/testing/register.mjs`) so other tests are
 * unaffected.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach, before } from 'node:test';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

// Register the mock hook BEFORE any source-module imports run.
// `register()` only affects subsequent `import()` calls, so the source
// module is loaded via `await import()` inside `before()`.
register('./agentforceTools.hooks.mjs', import.meta.url);

// Type alias for the mock store module — keeps the dynamic `import()`
// types tight without leaking `any`.
type MockStoreModule = {
    __setMockState(state: unknown): void;
};

type MockCommandsModule = {
    __setRegisteredCommands(ids: string[]): void;
    __getInvokeCalls(): Array<{ id: string; payload: unknown }>;
    __resetInvokeCalls(): void;
};

type ToolModule = typeof import('../agentforceTools.ts');

let mockStore: MockStoreModule;
let mockCommands: MockCommandsModule;
let tools: ToolModule;

before(async () => {
    mockStore = (await import('host-api/store')) as unknown as MockStoreModule;
    mockCommands = (await import('host-api/commands')) as unknown as MockCommandsModule;
    tools = (await import('../agentforceTools.ts')) as unknown as ToolModule;
});

function createMockConnector(queryFn: (soql: string) => unknown) {
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

function setConnected(queryFn: (soql: string) => unknown) {
    mockStore.__setMockState({ application: { connector: createMockConnector(queryFn) } });
}

function setDisconnected() {
    mockStore.__setMockState({ application: { connector: null } });
}

beforeEach(() => {
    setDisconnected();
    mockCommands.__setRegisteredCommands([]);
    mockCommands.__resetInvokeCalls();
});

describe('agentforceTools array', () => {
    it('exports exactly 6 tools', () => {
        assert.equal(tools.agentforceTools.length, 6);
    });

    it('contains all expected tool names', () => {
        const names = tools.agentforceTools.map(t => t.name);
        assert.deepEqual(names, [
            'agentforce_list_agents',
            'agentforce_describe_agent',
            'agentforce_list_topics',
            'agentforce_list_actions',
            'agentforce_get_interaction_steps',
            'agentforce_open_in_explorer',
        ]);
    });
});

describe('agentforce_list_agents (N1a: SOQL targets BotDefinition; N1b: paged + filterable)', () => {
    it('SOQL contains FROM BotDefinition (not GenAiPlanner)', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceListAgentsTool.execute();
        assert.match(capturedSoql, /FROM\s+BotDefinition/);
        assert.doesNotMatch(capturedSoql, /FROM\s+GenAiPlanner\b/);
    });

    it('returns formatted agent list when connected (truncated:false on small page)', async () => {
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

        const result = await tools.agentforceListAgentsTool.execute();
        assert.deepEqual(result, { agents, truncated: false });
    });

    it('returns error message when not connected', async () => {
        setDisconnected();

        const result = await tools.agentforceListAgentsTool.execute();
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('handles empty results gracefully', async () => {
        setConnected(() => []);

        const result = await tools.agentforceListAgentsTool.execute();
        assert.deepEqual(result, { agents: [], truncated: false });
    });

    it('returns error when tooling query throws', async () => {
        setConnected(() => {
            throw new Error('INVALID_SESSION_ID');
        });

        const result = await tools.agentforceListAgentsTool.execute();
        assert.deepEqual(result, { error: 'INVALID_SESSION_ID' });
    });

    it('returns error when connector has no tooling API', async () => {
        mockStore.__setMockState({
            application: { connector: { conn: {}, configuration: {} } },
        });

        const result = (await tools.agentforceListAgentsTool.execute()) as { error: string };
        assert.ok(result.error.includes('Tooling API is not available'));
    });

    it('default limit is 50: SOQL has no WHERE and uses LIMIT 51 (limit+1 truncation probe)', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceListAgentsTool.execute({});
        assert.doesNotMatch(capturedSoql, /\bWHERE\b/);
        assert.match(capturedSoql, /LIMIT\s+51\b/);
    });

    it('with query filter: SOQL contains WHERE clause with escaped query against MasterLabel + DeveloperName', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceListAgentsTool.execute({ query: 'sales' });
        assert.match(capturedSoql, /\bWHERE\b/);
        assert.ok(capturedSoql.includes(`MasterLabel LIKE '%sales%'`));
        assert.ok(capturedSoql.includes(`DeveloperName LIKE '%sales%'`));
    });

    it('SOQLi attempt: single-quote in query is neutralized via escapeSoqlLiteral', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceListAgentsTool.execute({ query: "' OR Name LIKE '" });
        // The escape sequence \' must appear inside the literal, and the
        // LIKE bookends remain intact (no literal-break injection).
        assert.match(capturedSoql, /MasterLabel LIKE '%\\' OR Name LIKE \\'%'/);
    });

    it('truncation: 51 mocked rows (limit=50) → truncated:true and exactly 50 agents returned', async () => {
        const rows = Array.from({ length: 51 }, (_, i) => ({
            Id: `0Xx${i}`,
            MasterLabel: `Agent ${i}`,
            DeveloperName: `Agent_${i}`,
            Description: null,
        }));
        setConnected(() => rows);

        const result = (await tools.agentforceListAgentsTool.execute({})) as {
            agents: unknown[];
            truncated: boolean;
        };
        assert.equal(result.truncated, true);
        assert.equal(result.agents.length, 50);
    });
});

describe('agentforce_describe_agent (N1a: SOQL targets BotDefinition)', () => {
    // Valid 15-char IDs used throughout — N2 enforces SalesforceId branding.
    const AGENT_ID = '0XxAA0000004CA1';
    const TOPIC_1_ID = '0XpAA0000004CA1';
    const TOPIC_2_ID = '0XpAA0000004CA2';
    const FLOW_1_ID = '301AA0000004CA1';

    it('initial agent SOQL contains FROM BotDefinition (not GenAiPlanner)', async () => {
        const seen: string[] = [];
        setConnected((soql: string) => {
            seen.push(soql);
            // Return [] for the first lookup so we exit early without firing
            // the topic/action follow-up queries.
            return [];
        });

        await tools.agentforceDescribeAgentTool.execute({ agentId: AGENT_ID });
        assert.ok(seen.length >= 1);
        assert.match(seen[0], /FROM\s+BotDefinition/);
        assert.doesNotMatch(seen[0], /FROM\s+GenAiPlanner\b/);
    });

    it('returns full config with topics and actions', async () => {
        const agent = {
            Id: AGENT_ID,
            MasterLabel: 'Sales Agent',
            DeveloperName: 'Sales_Agent',
            Description: 'desc',
        };
        const topic1 = {
            Id: TOPIC_1_ID,
            MasterLabel: 'Leads',
            DeveloperName: 'Leads',
            Description: 'Lead handling',
        };
        const topic2 = {
            Id: TOPIC_2_ID,
            MasterLabel: 'Opps',
            DeveloperName: 'Opps',
            Description: 'Opp handling',
        };
        const action1 = {
            Id: '0XfAA0000004CA1',
            MasterLabel: 'Create Lead',
            DeveloperName: 'Create_Lead',
            ActionType: 'Flow',
            FlowDefinitionId: FLOW_1_ID,
        };
        const action2 = {
            Id: '0XfAA0000004CA2',
            MasterLabel: 'Update Opp',
            DeveloperName: 'Update_Opp',
            ActionType: 'Apex',
            FlowDefinitionId: null,
        };

        setConnected((soql: string) => {
            if (soql.includes('FROM BotDefinition')) return [agent];
            if (soql.includes('FROM GenAiPlugin')) return [topic1, topic2];
            if (soql.includes('FROM GenAiFunction') && soql.includes(`'${TOPIC_1_ID}'`))
                return [action1];
            if (soql.includes('FROM GenAiFunction') && soql.includes(`'${TOPIC_2_ID}'`))
                return [action2];
            return [];
        });

        const result = await tools.agentforceDescribeAgentTool.execute({ agentId: AGENT_ID });
        assert.deepEqual(result, {
            agent,
            topics: [
                { ...topic1, actions: [action1] },
                { ...topic2, actions: [action2] },
            ],
        });
    });

    it('returns error for invalid/missing agentId (fails SalesforceId validation)', async () => {
        setConnected(() => []);

        const result = (await tools.agentforceDescribeAgentTool.execute({
            agentId: 'nonexistent',
        })) as { error: string };
        // N2: malformed IDs trip the SalesforceId brand at the boundary.
        assert.ok(result.error.includes('Invalid Salesforce Id'));
    });

    it('returns error when not connected', async () => {
        setDisconnected();

        const result = await tools.agentforceDescribeAgentTool.execute({ agentId: AGENT_ID });
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('handles agent with no topics', async () => {
        const agent = {
            Id: AGENT_ID,
            MasterLabel: 'Empty Agent',
            DeveloperName: 'Empty',
            Description: null,
        };
        setConnected((soql: string) => {
            if (soql.includes('FROM BotDefinition')) return [agent];
            if (soql.includes('FROM GenAiPlugin')) return [];
            return [];
        });

        const result = await tools.agentforceDescribeAgentTool.execute({ agentId: AGENT_ID });
        assert.deepEqual(result, { agent, topics: [] });
    });
});

describe('agentforce_list_topics', () => {
    const AGENT_ID = '0XxAA0000004CA1';

    it('returns topics for valid agent', async () => {
        const topics = [
            {
                Id: '0XpAA0000004CA1',
                MasterLabel: 'Topic A',
                DeveloperName: 'Topic_A',
                Description: 'First',
            },
            {
                Id: '0XpAA0000004CA2',
                MasterLabel: 'Topic B',
                DeveloperName: 'Topic_B',
                Description: 'Second',
            },
        ];
        setConnected(() => topics);

        const result = await tools.agentforceListTopicsTool.execute({ agentId: AGENT_ID });
        assert.deepEqual(result, { topics, count: 2 });
    });

    it('returns error when not connected', async () => {
        setDisconnected();

        const result = await tools.agentforceListTopicsTool.execute({ agentId: AGENT_ID });
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('returns empty list when agent has no topics', async () => {
        setConnected(() => []);

        const result = await tools.agentforceListTopicsTool.execute({ agentId: AGENT_ID });
        assert.deepEqual(result, { topics: [], count: 0 });
    });

    it('queries GenAiPlugin scoped by GenAiPlannerId FK (column was NOT renamed)', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceListTopicsTool.execute({ agentId: AGENT_ID });
        // The parent entity was renamed (GenAiPlanner → BotDefinition) but the
        // FK column on GenAiPlugin stayed `GenAiPlannerId` — mirror the slice.
        assert.match(capturedSoql, /FROM\s+GenAiPlugin/);
        assert.ok(capturedSoql.includes(`GenAiPlannerId = '${AGENT_ID}'`));
    });
});

describe('agentforce_list_actions', () => {
    const TOPIC_ID = '0XpAA0000004CA1';

    it('returns actions for valid topic', async () => {
        const actions = [
            {
                Id: '0XfAA0000004CA1',
                MasterLabel: 'Action 1',
                DeveloperName: 'Action_1',
                ActionType: 'Flow',
                FlowDefinitionId: '301AA0000004CA1',
            },
            {
                Id: '0XfAA0000004CA2',
                MasterLabel: 'Action 2',
                DeveloperName: 'Action_2',
                ActionType: 'Apex',
                FlowDefinitionId: null,
            },
        ];
        setConnected(() => actions);

        const result = await tools.agentforceListActionsTool.execute({ topicId: TOPIC_ID });
        assert.deepEqual(result, { actions, count: 2 });
    });

    it('returns error when not connected', async () => {
        setDisconnected();

        const result = await tools.agentforceListActionsTool.execute({ topicId: TOPIC_ID });
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });

    it('returns empty list when topic has no actions', async () => {
        setConnected(() => []);

        const result = await tools.agentforceListActionsTool.execute({ topicId: TOPIC_ID });
        assert.deepEqual(result, { actions: [], count: 0 });
    });

    it('queries GenAiFunction with the topicId in SOQL', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceListActionsTool.execute({ topicId: TOPIC_ID });
        assert.match(capturedSoql, /FROM\s+GenAiFunction/);
        assert.ok(capturedSoql.includes(`GenAiPluginId = '${TOPIC_ID}'`));
    });
});

describe('zod parameter schemas', () => {
    it('agentforce_list_agents accepts empty input', () => {
        const parsed = tools.agentforceListAgentsTool.parameters.safeParse({});
        assert.equal(parsed.success, true);
    });

    it('agentforce_list_agents accepts query + limit', () => {
        const parsed = tools.agentforceListAgentsTool.parameters.safeParse({
            query: 'sales',
            limit: 25,
        });
        assert.equal(parsed.success, true);
    });

    it('agentforce_list_agents rejects limit > 200 hard cap', () => {
        const parsed = tools.agentforceListAgentsTool.parameters.safeParse({ limit: 500 });
        assert.equal(parsed.success, false);
    });

    it('agentforce_describe_agent accepts a string agentId', () => {
        const parsed = tools.agentforceDescribeAgentTool.parameters.safeParse({
            agentId: '0XxAA0000004CAA0AM',
        });
        assert.equal(parsed.success, true);
    });

    it('agentforce_list_topics accepts a string agentId', () => {
        const parsed = tools.agentforceListTopicsTool.parameters.safeParse({
            agentId: '0XxAA0000004CAA0AM',
        });
        assert.equal(parsed.success, true);
    });

    it('agentforce_list_actions accepts a string topicId', () => {
        const parsed = tools.agentforceListActionsTool.parameters.safeParse({
            topicId: '0XxAA0000004CAA0AM',
        });
        assert.equal(parsed.success, true);
    });

    it('rejects missing required fields', () => {
        assert.equal(tools.agentforceDescribeAgentTool.parameters.safeParse({}).success, false);
        assert.equal(tools.agentforceListTopicsTool.parameters.safeParse({}).success, false);
        assert.equal(tools.agentforceListActionsTool.parameters.safeParse({}).success, false);
    });

    // NOTE: The schemas currently accept any non-empty string for IDs.
    // Tightening to a branded `SalesforceId` belongs to N1b — out of scope here.
});

describe('agentforce_get_interaction_steps (N1b)', () => {
    const INTERACTION_ID_15 = '0XfAA0000004CA1';
    const INTERACTION_ID_18 = '0XfAA0000004CA1AAA';

    it('valid 15-char ID + small limit → SOQL has correct WHERE and LIMIT 11', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceGetInteractionStepsTool.execute({
            interactionId: INTERACTION_ID_15,
            limit: 10,
        });
        assert.match(capturedSoql, /FROM\s+GenAiInteractionStep/);
        assert.ok(capturedSoql.includes(`WHERE GenAiInteractionId = '${INTERACTION_ID_15}'`));
        assert.match(capturedSoql, /LIMIT\s+11\b/);
    });

    it('valid 18-char ID is also accepted', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        const result = (await tools.agentforceGetInteractionStepsTool.execute({
            interactionId: INTERACTION_ID_18,
            limit: 5,
        })) as { steps: unknown[]; truncated: boolean };
        assert.ok(capturedSoql.includes(`'${INTERACTION_ID_18}'`));
        assert.equal(result.truncated, false);
    });

    it('invalid ID shape ("foo") → zod rejects', () => {
        const parsed = tools.agentforceGetInteractionStepsTool.parameters.safeParse({
            interactionId: 'foo',
        });
        assert.equal(parsed.success, false);
    });

    it('SOQL does NOT contain StepInput or StepOutput (context-window protection)', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceGetInteractionStepsTool.execute({
            interactionId: INTERACTION_ID_15,
        });
        assert.doesNotMatch(capturedSoql, /\bStepInput\b/);
        assert.doesNotMatch(capturedSoql, /\bStepOutput\b/);
    });

    it('truncation: limit+1 mocked rows → truncated:true and exactly limit rows returned', async () => {
        const rows = Array.from({ length: 6 }, (_, i) => ({
            Id: `0XF${i}`,
            GenAiInteractionId: INTERACTION_ID_15,
            StepType: 'LLM',
            Status: 'OK',
            StepOrder: i + 1,
            Duration: 100,
            TokenCount: 50,
        }));
        setConnected(() => rows);

        const result = (await tools.agentforceGetInteractionStepsTool.execute({
            interactionId: INTERACTION_ID_15,
            limit: 5,
        })) as { steps: unknown[]; truncated: boolean };
        assert.equal(result.truncated, true);
        assert.equal(result.steps.length, 5);
    });

    it('default limit is 200: LIMIT 201 in SOQL', async () => {
        let capturedSoql = '';
        setConnected((soql: string) => {
            capturedSoql = soql;
            return [];
        });

        await tools.agentforceGetInteractionStepsTool.execute({
            interactionId: INTERACTION_ID_15,
        });
        assert.match(capturedSoql, /LIMIT\s+201\b/);
    });

    it('returns error when not connected (no throw)', async () => {
        setDisconnected();

        const result = await tools.agentforceGetInteractionStepsTool.execute({
            interactionId: INTERACTION_ID_15,
        });
        assert.deepEqual(result, {
            error: 'Not connected to a Salesforce org. Please connect first.',
        });
    });
});

describe('agentforce_open_in_explorer (N1b)', () => {
    const AGENT_ID = '0XxAA0000004CA1';
    const CONVERSATION_ID = '0YjAA0000004CA1';

    it('with conversationId → checks hasCommand("agentforce.openTrace") then invokes it', async () => {
        mockCommands.__setRegisteredCommands(['agentforce.openTrace']);

        const result = await tools.agentforceOpenInExplorerTool.execute({
            conversationId: CONVERSATION_ID,
        });
        assert.deepEqual(result, { ok: true, opened: 'trace' });
        const calls = mockCommands.__getInvokeCalls();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].id, 'agentforce.openTrace');
        assert.deepEqual(calls[0].payload, { conversationId: CONVERSATION_ID });
    });

    it('with agentId → checks hasCommand("agentforce.openAgent") then invokes it', async () => {
        mockCommands.__setRegisteredCommands(['agentforce.openAgent']);

        const result = await tools.agentforceOpenInExplorerTool.execute({
            agentId: AGENT_ID,
            tab: 'debugger',
        });
        assert.deepEqual(result, { ok: true, opened: 'agent' });
        const calls = mockCommands.__getInvokeCalls();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].id, 'agentforce.openAgent');
        assert.deepEqual(calls[0].payload, {
            agentId: AGENT_ID,
            name: undefined,
            tab: 'debugger',
        });
    });

    it('with name only → invokes openAgent with name passthrough', async () => {
        mockCommands.__setRegisteredCommands(['agentforce.openAgent']);

        const result = await tools.agentforceOpenInExplorerTool.execute({ name: 'Sales Agent' });
        assert.deepEqual(result, { ok: true, opened: 'agent' });
    });

    it('command not registered for trace → returns structured error, does NOT throw', async () => {
        mockCommands.__setRegisteredCommands([]); // nothing registered

        const result = await tools.agentforceOpenInExplorerTool.execute({
            conversationId: CONVERSATION_ID,
        });
        assert.deepEqual(result, {
            error: 'Agentforce app not loaded — cannot open trace',
        });
        assert.equal(mockCommands.__getInvokeCalls().length, 0);
    });

    it('command not registered for agent → returns structured error, does NOT throw', async () => {
        mockCommands.__setRegisteredCommands([]);

        const result = await tools.agentforceOpenInExplorerTool.execute({ agentId: AGENT_ID });
        assert.deepEqual(result, {
            error: 'Agentforce app not loaded — cannot open agent',
        });
        assert.equal(mockCommands.__getInvokeCalls().length, 0);
    });

    it('neither agentId nor name nor conversationId → returns structured error', async () => {
        mockCommands.__setRegisteredCommands(['agentforce.openAgent', 'agentforce.openTrace']);

        const result = await tools.agentforceOpenInExplorerTool.execute({});
        assert.deepEqual(result, {
            error: 'Must provide agentId, name, or conversationId',
        });
        assert.equal(mockCommands.__getInvokeCalls().length, 0);
    });

    it('zod rejects malformed agentId', () => {
        const parsed = tools.agentforceOpenInExplorerTool.parameters.safeParse({
            agentId: 'foo',
        });
        assert.equal(parsed.success, false);
    });

    it('zod rejects unknown tab value', () => {
        const parsed = tools.agentforceOpenInExplorerTool.parameters.safeParse({
            agentId: AGENT_ID,
            tab: 'hacker',
        });
        assert.equal(parsed.success, false);
    });
});

describe('N17 sweep: source file has zero legacy GenAiPlanner entity refs', () => {
    it('only the FK column GenAiPlannerId remains; no bare GenAiPlanner entity references', () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(resolvePath(here, '../agentforceTools.ts'), 'utf8');
        // `GenAiPlanner` NOT followed by a word char — catches the entity
        // name but allows the FK column `GenAiPlannerId` (which Salesforce
        // did NOT rename).
        const bareEntityRefs = src.match(/GenAiPlanner(?!\w)/g) || [];
        assert.equal(
            bareEntityRefs.length,
            0,
            `Found ${bareEntityRefs.length} legacy GenAiPlanner entity references; sweep them to BotDefinition.`
        );
    });
});
