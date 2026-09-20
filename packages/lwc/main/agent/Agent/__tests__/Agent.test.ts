import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approveToolCall } from '../../tools/modules/toolPolicy';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import { StepCheckpoint } from '../../runController/stepCheckpoint';
import { createRunStatistics } from '../../runController/runStatistics';
import { createStreamMessageBuilder } from '../../streamBuilder/streamBuilder';

function harness(streamText) {
    const noop = () => {};
    const executed: string[] = [];
    const actions = {
        addMessages: payload => ({ type: 'messages', payload }),
        setContextMessages: payload => ({ type: 'context', payload }),
    };
    const { Agent } = loadTypeScriptModule(new URL('../Agent.ts', import.meta.url), {
        'agent/cdpHandler': {
            clearCdpHandlerForConversation: noop,
            ensureCdpHandlerInitialized: async () => ({}),
        },
        'agent/compaction': {
            estimateConversationTokens: () => 10,
            relaxCompactionSettings: x => x,
        },
        'agent/runtimeDeps': { getOrCreateBashInstanceForConversation: () => ({}) },
        'agent/streamBuilder': { createStreamMessageBuilder },
        '../runController/stepCheckpoint': { StepCheckpoint },
        '../runController/runStatistics': { createRunStatistics },
        '../tools/modules/toolPolicy': { approveToolCall },
        'agent/tools': {
            filterToolsByModel: tools => tools,
            createBashTools: () => [{ name: 'bash', execute: () => executed.push('bash') }],
        },
        'agent/utils': {
            createProviderInstance: () => ({}),
            getSummaryModelForAgentProvider: () => 'fake',
            getReasoningConfigFromSelection: () => ({}),
            normalizeToolInputSchema: x => x,
            discoverSkills: async () => [],
            formatSkillsForPrompt: () => '',
            resolveProviderModelInstance: () => ({}),
            resolveProviderOptions: () => ({}),
            isContextOverflowError: error => /context overflow/.test(error.message),
            extractNestedErrorMessage: error => error.message,
        },
        ai: { streamText, stepCountIs: () => ({}), tool: x => x },
        'core/fs': { getIndexedDbFileSystem: () => ({}) },
        'core/store': { AGENT: { reduxSlice: { actions } } },
        'shared/llm': {
            normalizeLlmProvider: x => x,
            getMaxOutputTokensForModel: () => 1000,
            getContextWindowForModel: () => 128000,
        },
        'shared/logger': { default: { debug: noop, warn: noop, error: noop }, __esModule: true },
        'shared/utils': {},
        zod: {},
        '../mcp/mcpManager': {
            createMcpToolset: async () => ({
                tools: { mcp__fixture__write: { execute: () => executed.push('mcp') } },
                errors: [],
                close: async () => {},
            }),
        },
    });
    const persisted: unknown[] = [];
    const agent = new Agent({
        conversationId: 'test',
        messages: [],
        model: 'fake',
        provider: 'fake',
        modelContextWindow: 128000,
        systemPrompt: '',
        tools: {},
        isStoreEnabled: true,
        store: { dispatch: action => persisted.push(action) },
    });
    agent.getCompactionSettings = () => ({});
    agent.compactForContext = async () => false;
    return { agent, persisted, Agent, executed };
}

test('cancel after two SDK steps keeps each completed exchange exactly once', async () => {
    let agent;
    const first = { role: 'assistant', content: [{ type: 'text', text: 'First' }] };
    const second = { role: 'assistant', content: [{ type: 'text', text: 'Second' }] };
    ({ agent } = harness(options => ({
        // The SDK can complete steps without emitting a user-visible chunk.
        // eslint-disable-next-line require-yield
        fullStream: (async function* () {
            options.onStepFinish({ response: { messages: [first] } });
            options.onStepFinish({ response: { messages: [first, second] } });
            agent.abort();
        })(),
    })));
    for await (const _ of agent.processMessage([{ role: 'user', content: 'Work' }])) {
    }
    assert.equal(agent.getMessages().length, 3);
    assert.equal(agent.runStatistics.steps, 2);
    assert.equal(agent.runStatistics.cancelled, true);
});

test('overflow after tool execution preserves completed work and never restarts the request', async () => {
    let requests = 0;
    const first = { role: 'assistant', content: [{ type: 'text', text: 'Created a record' }] };
    const { agent } = harness(options => {
        requests++;
        return {
            fullStream: (async function* () {
                yield { type: 'tool-call', toolCallId: 'one', toolName: 'create', input: {} };
                options.onStepFinish({ response: { messages: [first] } });
                throw new Error('context overflow');
            })(),
        };
    });
    const errors: string[] = [];
    for await (const chunk of agent.processMessage([{ role: 'user', content: 'Work' }])) {
        if (chunk.type === 'error') errors.push(chunk.content);
    }
    assert.equal(requests, 1);
    assert.equal(agent.getMessages().length, 2);
    assert.match(errors[0], /Completed work was saved/);
});

test('overflow before any work has a single safe recovery attempt', async () => {
    let requests = 0;
    const { agent } = harness(() => {
        requests++;
        return {
            // eslint-disable-next-line require-yield
            fullStream: (async function* () {
                throw new Error('context overflow');
            })(),
        };
    });
    for await (const _ of agent.processMessage([{ role: 'user', content: 'Work' }])) {
    }
    assert.equal(requests, 2);
});

test('final cumulative response does not duplicate checkpointed messages', async () => {
    const reply = { role: 'assistant', content: [{ type: 'text', text: 'Done' }] };
    const { agent } = harness(options => ({
        // eslint-disable-next-line require-yield
        fullStream: (async function* () {
            options.onStepFinish({ response: { messages: [reply] } });
        })(),
        response: Promise.resolve({ messages: [reply] }),
    }));
    for await (const _ of agent.processMessage([{ role: 'user', content: 'Work' }])) {
    }
    assert.equal(agent.getMessages().length, 2);
});

test('Agent.create passes YOLO to both Bash/browser and MCP wrappers without auto-answering questions', async () => {
    const { Agent, executed } = harness(() => ({}));
    const controller = new AbortController();
    let answered = false;
    const instance = await Agent.create({
        conversationId: 'yolo-runtime',
        settings: {
            approvalMode: 'yolo',
            signal: controller.signal,
            store: { dispatch() {} },
            extraTools: [
                { name: 'browser_click', execute: () => executed.push('browser') },
                {
                    name: 'ask_user',
                    execute: () => {
                        answered = true;
                        return 'A real question';
                    },
                },
            ],
        },
    });
    await instance.tools.bash.execute({}, {});
    await instance.tools.browser_click.execute({}, {});
    await instance.tools.mcp__fixture__write.execute({}, {});
    assert.equal(await instance.tools.ask_user.execute({}, {}), 'A real question');
    assert.equal(answered, true);
    assert.deepEqual(executed, ['bash', 'browser', 'mcp']);
    controller.abort();
    await assert.rejects(instance.tools.bash.execute({}, {}));
    await assert.rejects(instance.tools.mcp__fixture__write.execute({}, {}));
    assert.deepEqual(executed, ['bash', 'browser', 'mcp']);
});

test('Agent.create keeps the original approval requirement when no mode is supplied', async () => {
    const { Agent, executed } = harness(() => ({}));
    const instance = await Agent.create({
        conversationId: 'normal-runtime',
        settings: { store: { dispatch() {} } },
    });
    await assert.rejects(
        instance.tools.bash.execute({ approvalMode: 'yolo' }, {}),
        /requires an open chat/
    );
    await assert.rejects(
        instance.tools.mcp__fixture__write.execute({}, {}),
        /requires an open chat/
    );
    assert.deepEqual(executed, []);
});
