import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureStore } from '@reduxjs/toolkit';
import { modelMessageSchema } from 'ai';
import type { AgentState } from '../agent';

function installStorage() {
    const local: Record<string, string> = {};
    const localStorage = {
        getItem: (k: string) => (k in local ? local[k] : null),
        setItem: (k: string, v: string) => {
            local[k] = String(v);
        },
        removeItem: (k: string) => {
            delete local[k];
        },
    };
    const sessionStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    };
    (globalThis as any).window = { localStorage, sessionStorage };
    (globalThis as any).localStorage = localStorage;
    (globalThis as any).sessionStorage = sessionStorage;
    return { local };
}

function removeStorage() {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).sessionStorage;
    delete (globalThis as any).window;
}

function readCachedConversationData(local: Record<string, string>) {
    const raw = local.einstein_agent_conversation_data;
    return raw ? JSON.parse(raw) : null;
}

async function flushPromises() {
    await new Promise(resolve => setTimeout(resolve, 0));
}

const HISTORY_MESSAGE = { role: 'user', content: 'hello from cache' };
const LIVE_MESSAGE = { role: 'user', content: 'typed after load' };

test('agent: clearing a hydrated conversation removes its persisted model context', async () => {
    const { local } = installStorage();
    try {
        const { reduxSlice, loadCacheSettingsAsync } = await import('../agent');
        const reduce = reduxSlice.reducer;
        let state = reduce(undefined, {
            type: loadCacheSettingsAsync.fulfilled.type,
            payload: {
                conversations: [
                    {
                        id: 'context-test',
                        title: 'Context',
                        streamHistory: [HISTORY_MESSAGE],
                        contextMessages: [HISTORY_MESSAGE],
                    },
                ],
                activeConversationId: 'context-test',
            },
        });
        assert.equal(state.contextById['context-test'].length, 1);
        state = reduce(state, reduxSlice.actions.clearMessages({ id: 'context-test' }));
        await flushPromises();
        assert.equal(state.contextById['context-test'], undefined);
        const saved = readCachedConversationData(local);
        assert.equal(saved.schemaVersion, 1);
        assert.equal(saved.conversations[0].contextMessages, undefined);
        assert.deepEqual(saved.conversations[0].streamHistory, []);
    } finally {
        removeStorage();
    }
});

test('agent: pre-hydrate save is a no-op and does not overwrite cached streamHistory', async () => {
    const { local } = installStorage();
    const cachedPayload = {
        conversations: [
            {
                id: 'conv_cached',
                title: 'Cached chat',
                streamHistory: [HISTORY_MESSAGE],
                compactionSummary: [],
            },
        ],
        activeConversationId: 'conv_cached',
        selectedModel: 'gpt-5-mini',
        selectedReasoning: 'none',
    };
    local.einstein_agent_conversation_data = JSON.stringify(cachedPayload);
    try {
        const { reduxSlice } = await import('../agent.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, { type: '@@INIT' } as any);
        s = r(s, reduxSlice.actions.setActiveConversationId({ id: 'default' }));
        s = r(s, reduxSlice.actions.updateSelectedModel({ model: 'gpt-5-mini' }));
        await flushPromises();
        assert.equal(s.hasHydrated, false);
        assert.deepEqual(readCachedConversationData(local), cachedPayload);
    } finally {
        removeStorage();
    }
});

test('agent: post-hydrate save copies messagesById into streamHistory', async () => {
    const { local } = installStorage();
    try {
        const { reduxSlice, loadCacheSettingsAsync } = await import('../agent.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, { type: '@@INIT' } as any);
        s = r(s, {
            type: loadCacheSettingsAsync.fulfilled.type,
            payload: {
                conversations: [
                    {
                        id: 'conv_1',
                        title: 'Conversation 1',
                        streamHistory: [HISTORY_MESSAGE],
                        compactionSummary: [],
                    },
                ],
                activeConversationId: 'conv_1',
            },
        });
        assert.equal(s.hasHydrated, true);
        assert.equal(s.messagesById.conv_1.length, 1);
        assert.equal(s.messagesById.conv_1[0].content, HISTORY_MESSAGE.content);

        s = r(
            s,
            reduxSlice.actions.addMessages({
                id: 'conv_1',
                messages: [LIVE_MESSAGE],
            })
        );
        // Mid-run saves used to persist stale empty streamHistory. Switching
        // conversations must now flush the live thread.
        s = r(s, reduxSlice.actions.setActiveConversationId({ id: 'conv_1' }));
        assert.equal(s.conversations[0].streamHistory.length, 2);
        assert.equal(s.conversations[0].streamHistory[1].content, LIVE_MESSAGE.content);

        await flushPromises();
        const persisted = readCachedConversationData(local);
        assert.equal(persisted.conversations[0].streamHistory.length, 2);
        assert.equal(persisted.conversations[0].streamHistory[1].content, LIVE_MESSAGE.content);
    } finally {
        removeStorage();
    }
});

test('agent: flushConversationCache is a no-op until hydrated', async () => {
    const { local } = installStorage();
    const cachedPayload = {
        conversations: [
            {
                id: 'conv_cached',
                title: 'Cached chat',
                streamHistory: [HISTORY_MESSAGE],
                compactionSummary: [],
            },
        ],
        activeConversationId: 'conv_cached',
    };
    local.einstein_agent_conversation_data = JSON.stringify(cachedPayload);
    try {
        const { reduxSlice } = await import('../agent.ts');
        const r = reduxSlice.reducer;
        let s = r(undefined, { type: '@@INIT' } as any);
        s = r(s, reduxSlice.actions.flushConversationCache());
        await flushPromises();
        assert.equal(s.hasHydrated, false);
        assert.deepEqual(readCachedConversationData(local), cachedPayload);
    } finally {
        removeStorage();
    }
});

test('agent: Chrome cache writes preserve nested tool result arrays outside the reducer', async () => {
    const { local } = installStorage();
    const chromeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
    // Browser storage globals must exist before the cache singleton first loads.
    const { cacheManager } = await import('shared/cacheManager');
    const previousIsChrome = cacheManager.isChrome;
    Object.defineProperty(globalThis, 'chrome', {
        configurable: true,
        value: {
            runtime: {},
            storage: {
                local: {
                    set(items: Record<string, unknown>, callback: () => void) {
                        // A native serialization boundary must never receive draft proxies.
                        // structuredClone rejects them instead of Chrome's silent corruption.
                        for (const [key, value] of Object.entries(items)) {
                            local[key] = JSON.stringify(structuredClone(value));
                        }
                        callback();
                    },
                },
            },
        },
    });
    // Earlier tests may have cached the modules; select the Chrome backend explicitly.
    cacheManager.isChrome = true;
    const history = [
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'read-1',
                    toolName: 'read',
                    output: {
                        type: 'content',
                        value: [{ type: 'text', text: 'Saved result' }],
                    },
                },
                {
                    type: 'tool-result',
                    toolCallId: 'query-1',
                    toolName: 'query',
                    output: { type: 'json', value: { rows: [{ values: [1, 2] }] } },
                },
            ],
        },
    ];
    try {
        const { reduxSlice, loadCacheSettingsAsync } = await import('../agent');
        const state = reduxSlice.reducer(undefined, {
            type: loadCacheSettingsAsync.fulfilled.type,
            payload: {
                conversations: [
                    {
                        id: 'native',
                        title: 'Native cache',
                        streamHistory: history,
                        compactionSummary: history,
                        contextMessages: history,
                    },
                ],
                activeConversationId: 'native',
            },
        });
        reduxSlice.reducer(state, reduxSlice.actions.flushConversationCache());
        await flushPromises();
        const persisted = readCachedConversationData(local);
        assert.deepEqual(persisted.conversations[0].streamHistory, history);
        assert.deepEqual(persisted.conversations[0].compactionSummary, history);
        assert.deepEqual(persisted.conversations[0].contextMessages, history);
        modelMessageSchema.array().parse(persisted.conversations[0].streamHistory);
        assert.deepEqual(JSON.parse(local.einstein_agent_conversations), persisted.conversations);
    } finally {
        cacheManager.isChrome = previousIsChrome;
        if (chromeDescriptor) Object.defineProperty(globalThis, 'chrome', chromeDescriptor);
        else Reflect.deleteProperty(globalThis, 'chrome');
        removeStorage();
    }
});

for (const cacheShape of ['canonical', 'legacy']) {
    test(`agent: ${cacheShape} history migrates through storage, continuation, and reload`, async () => {
        const { local } = installStorage();
        const history = [
            {
                id: 'user-1',
                role: 'user',
                content: [{ type: 'input_text', text: 'Inspect counts' }],
            },
            {
                id: 'reasoning-1',
                role: 'assistant',
                type: 'reasoning',
                content: [{ type: 'summary_text', text: 'Query the records' }],
            },
            {
                type: 'function_call',
                callId: 'query-1',
                name: 'query',
                arguments: '{"limit":5}',
            },
            {
                type: 'function_call_result',
                callId: 'query-1',
                output: { type: 'text', text: 'There are 5 records' },
            },
            { role: 'assistant', content: [{ type: 'output_text', text: 'Found 5 records.' }] },
        ];
        const payload = {
            conversations: [
                {
                    id: 'old',
                    title: 'Old conversation',
                    streamHistory: history,
                    compactionSummary: [],
                    contextMessages: history,
                },
            ],
            activeConversationId: 'old',
        };
        if (cacheShape === 'canonical') {
            local.einstein_agent_conversation_data = JSON.stringify(payload);
        } else {
            local.einstein_agent_conversations = JSON.stringify(payload.conversations);
            local.einstein_agent_conversation_active_id = JSON.stringify('old');
        }
        try {
            // The cache singleton reads browser globals during module evaluation.
            // Install storage before importing it, as in the existing cache tests.
            const {
                reduxSlice,
                loadCacheSettingsAsync,
                loadConversationsFromCache,
                saveConversationsToCache,
            } = await import('../agent');
            const createStore = () => configureStore({ reducer: { agent: reduxSlice.reducer } });
            const store = createStore();
            await store.dispatch(loadCacheSettingsAsync()).unwrap();
            const loadedState: AgentState = store.getState().agent;
            const loaded = loadedState.messagesById.old;
            assert.deepEqual(loadedState.contextById.old, loaded);
            const parsed = modelMessageSchema.array().parse(loaded);
            assert.deepEqual(
                parsed.map(message => message.role),
                ['user', 'assistant', 'assistant', 'tool', 'assistant']
            );
            assert.deepEqual(parsed[2].content, [
                {
                    type: 'tool-call',
                    toolCallId: 'query-1',
                    toolName: 'query',
                    input: { limit: 5 },
                },
            ]);
            assert.deepEqual(parsed[3].content, [
                {
                    type: 'tool-result',
                    toolCallId: 'query-1',
                    toolName: 'query',
                    output: { type: 'text', value: 'There are 5 records' },
                },
            ]);
            store.dispatch(
                reduxSlice.actions.addMessages({
                    id: 'old',
                    messages: [{ role: 'user', content: 'Continue with those records' }],
                })
            );
            await store.dispatch(saveConversationsToCache()).unwrap();
            const saved = readCachedConversationData(local).conversations[0].streamHistory;
            modelMessageSchema.array().parse(saved);
            assert.deepEqual(saved.slice(0, history.length), loaded);
            const reopened = createStore();
            await reopened.dispatch(loadConversationsFromCache()).unwrap();
            const reopenedState: AgentState = reopened.getState().agent;
            const replay = reopenedState.messagesById.old;
            assert.deepEqual(replay, saved);
            assert.deepEqual(reopenedState.contextById.old, loaded);
            assert.equal(replay[replay.length - 1].content, 'Continue with those records');
        } finally {
            removeStorage();
        }
    });
}
