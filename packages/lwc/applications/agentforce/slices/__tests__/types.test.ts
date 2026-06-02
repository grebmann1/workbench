/**
 * Type-contract tests for the agentforce app store shape.
 *
 * These are intentionally light: they assert the structural contract that
 * components rely on (the destructuring shape consumed in every storeChange
 * callback) and pin the discriminated tree-node union. Slice behavioral tests
 * belong with the slices themselves (N15).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
    AgentforceStoreShape,
    AgentforceState,
    DebuggerState,
    TreeNode,
    AgentTreeNode,
    TopicTreeNode,
    ActionTreeNode,
    LlmStepInput,
    LlmStepOutput,
} from '../types.ts';

// ---------------------------------------------------------------------------
// Compile-time assertions: the store shape is what components destructure.
// If these were ever broken (renamed slice key, dropped property), the file
// would fail to type-check and the test runner would surface it.
// ---------------------------------------------------------------------------

function expectType<T>(_value: T): void {
    /* compile-time only */
}

test('AgentforceStoreShape: required slice keys exist', () => {
    const sample: AgentforceStoreShape = {
        agentforce: {
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
        },
        agentforceDebugger: {
            interactions: [],
            selectedInteractionId: null,
            steps: [],
            loading: false,
            error: null,
            currentStepIndex: -1,
            playbackActive: false,
            playbackSpeed: 1500,
            filters: {},
            searchQuery: '',
        },
        application: {
            currentApplication: null,
            connector: null,
        },
    };

    expectType<AgentforceState>(sample.agentforce);
    expectType<DebuggerState>(sample.agentforceDebugger);
    expectType<string | null>(sample.application.currentApplication);

    // Runtime sanity: a store snapshot is a plain object with the three slices
    // we subscribe to. The shape must be JSON-serializable for round-tripping
    // via redux devtools / persisted state.
    const json = JSON.stringify(sample);
    const restored = JSON.parse(json);
    assert.ok('agentforce' in restored);
    assert.ok('agentforceDebugger' in restored);
    assert.ok('application' in restored);
    assert.equal(restored.application.currentApplication, null);
});

test('TreeNode: discriminated union narrows by type', () => {
    const agent: AgentTreeNode = {
        id: 'a1',
        label: 'Agent',
        type: 'agent',
        isExpanded: false,
        isSelected: false,
        nodeClass: 'tree-node',
        hasChildren: true,
        children: [],
    };
    const topic: TopicTreeNode = {
        id: 't1',
        label: 'Topic',
        type: 'topic',
        isExpanded: false,
        isSelected: false,
        nodeClass: 'tree-node',
        hasChildren: false,
        children: [],
    };
    const action: ActionTreeNode = {
        id: 'x1',
        label: 'Action',
        type: 'action',
        isExpanded: false,
        isSelected: false,
        nodeClass: 'tree-node',
        hasChildren: false,
        children: [],
    };

    const nodes: TreeNode[] = [agent, topic, action];

    // Discriminator narrowing — exhaustive match exercised at runtime.
    for (const node of nodes) {
        switch (node.type) {
            case 'agent':
                assert.equal(node.children.length, 0);
                break;
            case 'topic':
                assert.equal(node.children.length, 0);
                break;
            case 'action':
                assert.equal(node.children.length, 0);
                break;
            default: {
                const _exhaustive: never = node;
                throw new Error(`Unhandled tree node: ${JSON.stringify(_exhaustive)}`);
            }
        }
    }

    assert.equal(nodes.length, 3);
});

test('LlmStepInput / LlmStepOutput: optional fields tolerate sparse payloads', () => {
    // The LLM step JSON payloads from Salesforce are not schema-stable; the
    // typed shapes intentionally make every field optional so the parser
    // never throws on missing keys.
    const empty: LlmStepInput = {};
    const partial: LlmStepInput = { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] };
    const out: LlmStepOutput = {
        finishReason: 'stop',
        tokensUsed: { total: 42 },
        toolCalls: [{ name: 'lookup', arguments: { q: 'x' } }],
    };

    assert.equal(Object.keys(empty).length, 0);
    assert.equal(partial.messages?.[0]?.role, 'user');
    assert.equal(out.tokensUsed?.total, 42);
    assert.equal(out.toolCalls?.[0]?.name, 'lookup');
});
