import assert from 'node:assert/strict';
import { test } from 'node:test';

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

test('agent: initial state is not hydrated and has an empty default conversation', async () => {
    installStorage();
    try {
        const { reduxSlice } = await import('../agent.ts');
        const s = reduxSlice.reducer(undefined, { type: '@@INIT' } as any);
        assert.equal(s.hasHydrated, false);
        assert.equal(s.conversations.length, 1);
        assert.equal(s.conversations[0].title, 'Conversation 1');
        assert.deepEqual(s.conversations[0].streamHistory, []);
        assert.deepEqual(s.messagesById, {});
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
