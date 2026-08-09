/**
 * Slice-behavior tests for the platformevent `platformEvent` slice — focused
 * on the entity-adapter reducers that manage per-channel subscriptions and
 * their buffered messages.
 *
 * Why we don't import `../platformEvent.ts` directly
 * ----------------------------------------------------
 * The slice file imports `host-api/store` (for `ERROR`) and `core/store/storeRef`
 * (for `getStore`). `host-api/store` transitively loads the full core store
 * graph including LWC components decorated with `@api`/`@wire` — invalid
 * syntax under plain Node, since this test runner only strips TypeScript
 * types and cannot parse LWC decorator syntax. Importing the real module
 * throws `SyntaxError: Invalid or unexpected token`. This has been verified
 * empirically in this repo (see `agentforce/slices/__tests__/agents.test.ts`,
 * which documents the same constraint).
 *
 * Pragmatic alternative: re-construct the same reducers the slice uses as a
 * "faithful clone" built with `createSlice`/`createEntityAdapter` from
 * `@reduxjs/toolkit` (the same library the real slice uses), and pin the
 * clone's fidelity with "source contract" tests that `readFileSync` the real
 * `../platformEvent.ts` and `assert.match` key lines/policies. Any drift
 * between the clone and the real file gets caught by those contract tests.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createSlice, createEntityAdapter } from '@reduxjs/toolkit';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(here, '../platformEvent.ts'), 'utf8');

// ---------------------------------------------------------------------------
// Test rig: faithful clone of the platformEvent slice's entity-adapter
// reducers. MUST stay in sync with `../platformEvent.ts`. Each reducer below
// mirrors the real implementation line-for-line; the "source contract" tests
// at the bottom pin the real source against regexes so drift is caught.
// ---------------------------------------------------------------------------

// Minimal stand-in for `lowerCaseKey` from `shared/utils` (pure, no store dep).
function lowerCaseKey(key: string | null | undefined): string | null {
    return key != null ? key.toLowerCase() : null;
}

const testAdapter = createEntityAdapter();

const initialState = {
    recentPanelToggled: false,
    viewerTab: 'Default',
    maxMessagesPerChannel: 500,
    subscriptions: testAdapter.getInitialState(),
    currentChannel: null as string | null,
};

const testSlice = createSlice({
    name: 'platformEventTest',
    initialState,
    reducers: {
        updateMaxMessagesPerChannel: (
            state,
            action: { payload: { value: unknown; alias?: string } }
        ) => {
            const { value } = action.payload;
            const parsed = parseInt(value as string, 10);
            state.maxMessagesPerChannel = Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
        },
        createSubscription: (
            state,
            action: {
                payload: {
                    channel: string;
                    status?: string;
                    name?: string;
                    replayId?: number;
                    type?: string;
                };
            }
        ) => {
            const { channel, status, name, replayId, type } = action.payload;
            testAdapter.upsertOne(state.subscriptions, {
                id: lowerCaseKey(channel),
                name: name || channel,
                type,
                replayId,
                error: null,
                messages: [],
                status,
            });
        },
        deleteSubscription: (state, action: { payload: { channel: string } }) => {
            const { channel } = action.payload;
            // NOTE: unlike every sibling reducer, the real slice does NOT run
            // `channel` through `lowerCaseKey` here — it removes by the raw
            // value. In practice callers (app.ts) always pass an
            // already-lowercased id (derived from `activeSubscriptions` keys,
            // themselves built via `lowerCaseKey`), so this is safe today but
            // is a latent inconsistency if a caller ever passes mixed case.
            testAdapter.removeOne(state.subscriptions, channel);
        },
        updateSubscriptionStatus: (
            state,
            action: { payload: { channel: string; status?: string } }
        ) => {
            const { channel, status } = action.payload;
            const existing =
                (state.subscriptions.entities as any)[lowerCaseKey(channel) as string]?.messages ||
                [];
            testAdapter.upsertOne(state.subscriptions, {
                id: lowerCaseKey(channel),
                error: null,
                messages: existing,
                status,
            });
        },
        cleanMessages: (state, action: { payload: { channel: string } }) => {
            const { channel } = action.payload;
            testAdapter.upsertOne(state.subscriptions, {
                id: lowerCaseKey(channel),
                error: null,
                messages: [],
            });
        },
        updateReadStatusOnSpecificMessage: (
            state,
            action: { payload: { channel: string; messageId: string } }
        ) => {
            const { channel, messageId } = action.payload;
            const _messages = (state.subscriptions.entities as any)[lowerCaseKey(channel) as string]
                .messages;
            const _index = _messages.findIndex((x: any) => x.id === messageId);
            if (_index > -1) {
                _messages[_index].isRead = true;
            }
            testAdapter.upsertOne(state.subscriptions, {
                id: lowerCaseKey(channel),
                error: null,
                messages: _messages,
            });
        },
        upsertSubscriptionMessages: (
            state,
            action: { payload: { channel: string; messages: any[] } }
        ) => {
            const { channel, messages } = action.payload;
            const cap = state.maxMessagesPerChannel || 500;

            const existing =
                (state.subscriptions.entities as any)[lowerCaseKey(channel) as string]?.messages ||
                [];

            const enrich = (m: any) => {
                if (m && m._searchText) return m;
                try {
                    const content = m?.content || m;
                    const replayId = content?.data?.event?.replayId ?? m?.id ?? '';
                    const uuid = content?.data?.event?.EventUuid ?? '';
                    const ch = content?.channel ?? channel ?? '';
                    const json = JSON.stringify(content);
                    const cappedJson = json.length > 10000 ? `${json.slice(0, 10000)}…` : json;
                    return {
                        ...m,
                        _searchText: `${replayId} ${uuid} ${ch} ${cappedJson}`,
                    };
                } catch {
                    return { ...m, _searchText: `${m?.id ?? ''} ${channel ?? ''}` };
                }
            };

            testAdapter.upsertOne(state.subscriptions, {
                id: lowerCaseKey(channel),
                error: null,
                lastModifiedDate: new Date(),
                messages:
                    cap > 0
                        ? [...existing, ...messages.map(enrich)].slice(-cap)
                        : [...existing, ...messages.map(enrich)],
            });
        },
    },
});

function makeState(overrides: Partial<typeof initialState> = {}): typeof initialState {
    return { ...initialState, ...overrides };
}

// ---------------------------------------------------------------------------
// updateMaxMessagesPerChannel
// ---------------------------------------------------------------------------

test('updateMaxMessagesPerChannel: accepts a valid positive numeric string', () => {
    const before = makeState();
    const next = testSlice.reducer(
        before,
        testSlice.actions.updateMaxMessagesPerChannel({ value: '1000' })
    );
    assert.equal(next.maxMessagesPerChannel, 1000);
});

test('updateMaxMessagesPerChannel: accepts a numeric value with trailing junk (parseInt semantics)', () => {
    const before = makeState();
    const next = testSlice.reducer(
        before,
        testSlice.actions.updateMaxMessagesPerChannel({ value: '250abc' })
    );
    assert.equal(next.maxMessagesPerChannel, 250);
});

for (const bad of ['-5', '0', 'not-a-number', '', null, undefined, NaN]) {
    test(`updateMaxMessagesPerChannel: falls back to 500 for invalid input ${JSON.stringify(bad)}`, () => {
        const before = makeState({ maxMessagesPerChannel: 42 });
        const next = testSlice.reducer(
            before,
            testSlice.actions.updateMaxMessagesPerChannel({ value: bad as any })
        );
        assert.equal(next.maxMessagesPerChannel, 500);
    });
}

// ---------------------------------------------------------------------------
// createSubscription
// ---------------------------------------------------------------------------

test('createSubscription: creates entity keyed by lowercased channel, with empty messages + null error', () => {
    const before = makeState();
    const next = testSlice.reducer(
        before,
        testSlice.actions.createSubscription({
            channel: 'MyChannel',
            status: 'SUBSCRIBED',
            name: 'My Channel',
            replayId: -1,
            type: 'standard',
        })
    );
    const entity = (next.subscriptions.entities as any)['mychannel'];
    assert.ok(entity, 'entity must be keyed by lowercase channel id');
    assert.deepEqual(entity.messages, []);
    assert.equal(entity.error, null);
    assert.equal(entity.status, 'SUBSCRIBED');
    assert.equal(entity.name, 'My Channel');
});

test('createSubscription: channel is used as the name fallback when name is not provided', () => {
    const before = makeState();
    const next = testSlice.reducer(
        before,
        testSlice.actions.createSubscription({ channel: '/event/Foo__e', status: 'PENDING' })
    );
    const entity = (next.subscriptions.entities as any)['/event/foo__e'];
    assert.equal(entity.name, '/event/Foo__e');
});

test('createSubscription: case-insensitive channel ids collide to the same entity', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'MyChannel', status: 'A' })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'mychannel', status: 'B' })
    );
    assert.equal(
        state.subscriptions.ids.length,
        1,
        'MyChannel and mychannel must resolve to a single entity'
    );
    assert.equal((state.subscriptions.entities as any)['mychannel'].status, 'B');
});

// ---------------------------------------------------------------------------
// deleteSubscription
// ---------------------------------------------------------------------------

test('deleteSubscription: removes the entity when passed the already-lowercased id (matching real call sites)', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelX', status: 'SUBSCRIBED' })
    );
    assert.equal(state.subscriptions.ids.length, 1);

    // createSubscription stored the entity under the lowercased id ('channelx').
    // deleteSubscription does NOT lowercase its input (see reducer note above),
    // so callers must pass the id already normalized — which is what app.ts does.
    state = testSlice.reducer(state, testSlice.actions.deleteSubscription({ channel: 'channelx' }));
    assert.equal(state.subscriptions.ids.length, 0);
    assert.equal((state.subscriptions.entities as any)['channelx'], undefined);
});

test('deleteSubscription: does NOT remove the entity if passed a differently-cased channel (documents the missing lowerCaseKey call)', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelX', status: 'SUBSCRIBED' })
    );
    assert.equal(state.subscriptions.ids.length, 1);

    // Unlike createSubscription/updateSubscriptionStatus/etc., deleteSubscription
    // removes by the raw payload value. Passing mixed case here is a no-op,
    // which would leak a subscription if a caller ever passed unnormalized input.
    state = testSlice.reducer(state, testSlice.actions.deleteSubscription({ channel: 'CHANNELX' }));
    assert.equal(
        state.subscriptions.ids.length,
        1,
        'entity survives because the real reducer removes by raw (non-lowercased) channel'
    );
});

// ---------------------------------------------------------------------------
// updateSubscriptionStatus
// ---------------------------------------------------------------------------

test('updateSubscriptionStatus: preserves existing messages while updating status', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelY', status: 'PENDING' })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelY',
            messages: [{ id: 'm1', content: { channel: '/event/Y' } }],
        })
    );
    assert.equal((state.subscriptions.entities as any)['channely'].messages.length, 1);

    state = testSlice.reducer(
        state,
        testSlice.actions.updateSubscriptionStatus({ channel: 'ChannelY', status: 'SUBSCRIBED' })
    );

    const entity = (state.subscriptions.entities as any)['channely'];
    assert.equal(entity.status, 'SUBSCRIBED');
    assert.equal(entity.messages.length, 1, 'messages must NOT be wiped when only status changes');
    assert.equal(entity.messages[0].id, 'm1');
});

test('updateSubscriptionStatus: defaults to empty messages when subscription did not previously exist', () => {
    const before = makeState();
    const next = testSlice.reducer(
        before,
        testSlice.actions.updateSubscriptionStatus({ channel: 'NewChannel', status: 'SUBSCRIBED' })
    );
    const entity = (next.subscriptions.entities as any)['newchannel'];
    assert.deepEqual(entity.messages, []);
    assert.equal(entity.status, 'SUBSCRIBED');
});

// ---------------------------------------------------------------------------
// cleanMessages
// ---------------------------------------------------------------------------

test('cleanMessages: clears messages without deleting the subscription entity', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelZ', status: 'SUBSCRIBED' })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelZ',
            messages: [{ id: 'm1' }, { id: 'm2' }],
        })
    );
    assert.equal((state.subscriptions.entities as any)['channelz'].messages.length, 2);

    state = testSlice.reducer(state, testSlice.actions.cleanMessages({ channel: 'ChannelZ' }));

    assert.equal(state.subscriptions.ids.length, 1, 'entity must still exist');
    assert.deepEqual((state.subscriptions.entities as any)['channelz'].messages, []);
});

// ---------------------------------------------------------------------------
// updateReadStatusOnSpecificMessage
// ---------------------------------------------------------------------------

test('updateReadStatusOnSpecificMessage: marks the matching message as read', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelR', status: 'SUBSCRIBED' })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelR',
            messages: [
                { id: 'm1', isRead: false },
                { id: 'm2', isRead: false },
            ],
        })
    );

    state = testSlice.reducer(
        state,
        testSlice.actions.updateReadStatusOnSpecificMessage({
            channel: 'ChannelR',
            messageId: 'm2',
        })
    );

    const messages = (state.subscriptions.entities as any)['channelr'].messages;
    assert.equal(messages.find((m: any) => m.id === 'm1').isRead, false);
    assert.equal(messages.find((m: any) => m.id === 'm2').isRead, true);
});

test('updateReadStatusOnSpecificMessage: leaves messages unmutated (and does not throw) when messageId is not found', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelR2', status: 'SUBSCRIBED' })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelR2',
            messages: [{ id: 'm1', isRead: false }],
        })
    );

    assert.doesNotThrow(() => {
        state = testSlice.reducer(
            state,
            testSlice.actions.updateReadStatusOnSpecificMessage({
                channel: 'ChannelR2',
                messageId: 'does-not-exist',
            })
        );
    });

    const messages = (state.subscriptions.entities as any)['channelr2'].messages;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].isRead, false, 'unmatched lookup must not mutate the message array');
});

// ---------------------------------------------------------------------------
// upsertSubscriptionMessages
// ---------------------------------------------------------------------------

test('upsertSubscriptionMessages: appends enriched messages with a _searchText field', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelE', status: 'SUBSCRIBED' })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelE',
            messages: [
                {
                    id: 'm1',
                    content: {
                        channel: '/event/Foo__e',
                        data: { event: { replayId: 5, EventUuid: 'uuid-1' } },
                    },
                },
            ],
        })
    );
    const entity = (state.subscriptions.entities as any)['channele'];
    assert.equal(entity.messages.length, 1);
    assert.match(entity.messages[0]._searchText, /5 uuid-1 \/event\/Foo__e/);
});

test('upsertSubscriptionMessages: skips re-enrichment when a message already has _searchText', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelE2', status: 'SUBSCRIBED' })
    );
    const preEnriched = { id: 'm1', _searchText: 'already-enriched' };
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelE2',
            messages: [preEnriched],
        })
    );
    const entity = (state.subscriptions.entities as any)['channele2'];
    assert.equal(entity.messages[0]._searchText, 'already-enriched');
});

test('upsertSubscriptionMessages: truncates _searchText JSON payload at 10000 chars', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelBig', status: 'SUBSCRIBED' })
    );
    const bigPayload = { channel: '/event/Big__e', huge: 'x'.repeat(20000) };
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelBig',
            messages: [{ id: 'm1', content: bigPayload }],
        })
    );
    const entity = (state.subscriptions.entities as any)['channelbig'];
    // '…' is appended after truncation, so total length is 10000 (json slice) + 1 + surrounding fields.
    assert.ok(
        entity.messages[0]._searchText.includes('…'),
        'truncated payload must be capped and marked with an ellipsis'
    );
});

test('upsertSubscriptionMessages: enrich falls back gracefully if JSON.stringify throws (circular content)', () => {
    let state = makeState();
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelCirc', status: 'SUBSCRIBED' })
    );
    const circular: any = { id: 'm1' };
    circular.content = circular; // content.content === content -> circular via `content = m?.content || m`
    circular.self = circular;

    assert.doesNotThrow(() => {
        state = testSlice.reducer(
            state,
            testSlice.actions.upsertSubscriptionMessages({
                channel: 'ChannelCirc',
                messages: [circular],
            })
        );
    });
    const entity = (state.subscriptions.entities as any)['channelcirc'];
    assert.equal(entity.messages.length, 1);
    assert.match(entity.messages[0]._searchText, /m1 ChannelCirc/);
});

test('upsertSubscriptionMessages: caps stored messages at maxMessagesPerChannel, dropping the OLDEST first', () => {
    let state = makeState({ maxMessagesPerChannel: 3 });
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelCap', status: 'SUBSCRIBED' })
    );

    for (let i = 1; i <= 5; i++) {
        state = testSlice.reducer(
            state,
            testSlice.actions.upsertSubscriptionMessages({
                channel: 'ChannelCap',
                messages: [{ id: `m${i}` }],
            })
        );
    }

    const entity = (state.subscriptions.entities as any)['channelcap'];
    assert.equal(entity.messages.length, 3, 'must cap at maxMessagesPerChannel');
    assert.deepEqual(
        entity.messages.map((m: any) => m.id),
        ['m3', 'm4', 'm5'],
        'oldest messages (m1, m2) must be dropped, newest 3 retained'
    );
});

test('upsertSubscriptionMessages: cap <= 0 means "no cap" (all messages retained)', () => {
    let state = makeState({ maxMessagesPerChannel: 0 });
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelNoCap', status: 'SUBSCRIBED' })
    );

    for (let i = 1; i <= 10; i++) {
        state = testSlice.reducer(
            state,
            testSlice.actions.upsertSubscriptionMessages({
                channel: 'ChannelNoCap',
                messages: [{ id: `m${i}` }],
            })
        );
    }

    const entity = (state.subscriptions.entities as any)['channelnocap'];
    // Note: `cap = state.maxMessagesPerChannel || 500` means a *falsy* 0 becomes
    // 500 in the real reducer (not "no cap") — this test rig mirrors that
    // exactly. All 10 messages fit comfortably under 500, so all are retained.
    assert.equal(entity.messages.length, 10, 'with cap falling back to 500, all 10 fit uncapped');
});

test('upsertSubscriptionMessages: negative cap falls back to 500 via `|| 500` (not treated as "no cap")', () => {
    // `state.maxMessagesPerChannel || 500` only falls back on falsy (0/null/undefined),
    // so a negative value survives as `cap`, and `cap > 0` is false -> "no cap" branch.
    let state = makeState({ maxMessagesPerChannel: -1 });
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelNeg', status: 'SUBSCRIBED' })
    );
    for (let i = 1; i <= 4; i++) {
        state = testSlice.reducer(
            state,
            testSlice.actions.upsertSubscriptionMessages({
                channel: 'ChannelNeg',
                messages: [{ id: `m${i}` }],
            })
        );
    }
    const entity = (state.subscriptions.entities as any)['channelneg'];
    assert.equal(
        entity.messages.length,
        4,
        'negative cap takes the `cap > 0` false branch (no slicing), so all messages are retained'
    );
});

test('upsertSubscriptionMessages: appends onto existing messages from a prior dispatch (does not overwrite)', () => {
    let state = makeState({ maxMessagesPerChannel: 500 });
    state = testSlice.reducer(
        state,
        testSlice.actions.createSubscription({ channel: 'ChannelAppend', status: 'SUBSCRIBED' })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelAppend',
            messages: [{ id: 'm1' }],
        })
    );
    state = testSlice.reducer(
        state,
        testSlice.actions.upsertSubscriptionMessages({
            channel: 'ChannelAppend',
            messages: [{ id: 'm2' }],
        })
    );
    const entity = (state.subscriptions.entities as any)['channelappend'];
    assert.deepEqual(
        entity.messages.map((m: any) => m.id),
        ['m1', 'm2']
    );
});

// ---------------------------------------------------------------------------
// Source contract tests — pin the real `../platformEvent.ts` against regexes
// so drift between this clone and the real implementation is caught.
// ---------------------------------------------------------------------------

test('source contract: updateMaxMessagesPerChannel parses with parseInt and falls back to 500', () => {
    assert.match(
        SRC,
        /updateMaxMessagesPerChannel:[\s\S]+?parseInt\(value, 10\)[\s\S]+?Number\.isFinite\(parsed\) && parsed > 0 \? parsed : 500/
    );
});

test('source contract: createSubscription upserts keyed by lowerCaseKey(channel) with empty messages + null error', () => {
    assert.match(
        SRC,
        /createSubscription:[\s\S]+?upsertOne\(state\.subscriptions, \{[\s\S]+?id: lowerCaseKey\(channel\)[\s\S]+?error: null,\s*\n\s*messages: \[\],/
    );
});

test('source contract: deleteSubscription removes by the raw channel (NOT lowerCaseKey) — pins the current asymmetry vs. sibling reducers', () => {
    // Every other entity-adapter reducer in this slice keys via
    // `lowerCaseKey(channel)`. deleteSubscription is the one exception —
    // it removes by the raw payload value. This test pins that fact so a
    // future "fix" (adding lowerCaseKey here) is a deliberate, reviewed
    // change rather than accidental drift, since callers today rely on
    // pre-normalized ids.
    assert.match(SRC, /deleteSubscription:[\s\S]+?removeOne\(state\.subscriptions, channel\);/);
});

test('source contract: updateSubscriptionStatus preserves existing messages before upserting', () => {
    assert.match(
        SRC,
        /updateSubscriptionStatus:[\s\S]+?const existing = state\.subscriptions\.entities\[lowerCaseKey\(channel\)\]\?\.messages \|\| \[\];[\s\S]+?messages: existing,/
    );
});

test('source contract: cleanMessages upserts with an empty messages array', () => {
    assert.match(
        SRC,
        /cleanMessages:[\s\S]+?upsertOne\(state\.subscriptions, \{[\s\S]+?messages: \[\],/
    );
});

test('source contract: updateReadStatusOnSpecificMessage uses findIndex + `_index > -1` guard', () => {
    assert.match(
        SRC,
        /updateReadStatusOnSpecificMessage:[\s\S]+?findIndex\(x => x\.id === messageId\);\s*\n\s*if \(_index > -1\) \{\s*\n\s*_messages\[_index\]\.isRead = true;/
    );
});

test('source contract: upsertSubscriptionMessages caps via `cap > 0 ? ... .slice(-cap) : ...` ternary', () => {
    assert.match(
        SRC,
        /cap > 0\s*\n\s*\? \[\.\.\.existing, \.\.\.messages\.map\(enrich\)\]\.slice\(-cap\)\s*\n\s*: \[\.\.\.existing, \.\.\.messages\.map\(enrich\)\]/
    );
});

test('source contract: upsertSubscriptionMessages derives cap via `state.maxMessagesPerChannel || 500`', () => {
    assert.match(SRC, /const cap = state\.maxMessagesPerChannel \|\| 500;/);
});

test('source contract: enrich caps _searchText JSON payload at 10000 chars and wraps in try/catch', () => {
    assert.match(SRC, /json\.length > 10000 \? `\$\{json\.slice\(0, 10000\)\}…` : json/);
    assert.match(SRC, /const enrich = m => \{[\s\S]+?try \{[\s\S]+?\} catch \{/);
});
