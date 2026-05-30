/**
 * Type-aware tests for `host-api/commands`. The `.js` sibling test file
 * already covers the runtime behaviour of `registerCommand` /
 * `invokeCommand`; this file exists to lock the **compile-time** treaty
 * for `CommandPayloads`. The runtime smoke checks below are deliberately
 * minimal — they exist so the type assertions actually run during
 * `npm run test`, not as a second source of behavioural coverage.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    registerCommand,
    invokeCommand,
    hasCommand,
    __resetCommandsForTests,
    // The explicit `.ts` extension is required at runtime by node's
    // `--experimental-strip-types` loader (the `.js` sibling test uses the
    // same convention). `tsc` rejects this without
    // `allowImportingTsExtensions`, so we suppress the diagnostic on the
    // two import lines below — the runtime contract wins over the
    // project-wide module-resolution flag.
    // @ts-expect-error TS5097: extension required at runtime.
} from '../commands.ts';
// Type-only import — erased at runtime — so TS doesn't surface TS5097 here.
import type { CommandPayloads } from '../commands.ts';

test('hasCommand returns false for an unregistered command', () => {
    __resetCommandsForTests();
    assert.equal(hasCommand('agentforce.open'), false);
});

test('hasCommand returns true after registerCommand', () => {
    __resetCommandsForTests();
    registerCommand('agentforce.open', () => undefined);
    assert.equal(hasCommand('agentforce.open'), true);
});

test('invokeCommand resolves to the handler return value', async () => {
    __resetCommandsForTests();
    registerCommand('agentforce.openAgent', payload => {
        // Type assertion: payload is narrowed to { agentId; tab? }.
        const agentId: string = payload.agentId;
        const tab: 'inspector' | 'debugger' | 'dependencies' | 'editor' | undefined = payload.tab;
        return { received: { agentId, tab } };
    });
    const out = (await invokeCommand('agentforce.openAgent', {
        agentId: '0XxXX0000000001',
        tab: 'debugger',
    })) as { received: { agentId: string; tab: string | undefined } };
    assert.deepEqual(out, { received: { agentId: '0XxXX0000000001', tab: 'debugger' } });
});

test('invokeCommand on an unregistered id resolves to undefined', async () => {
    __resetCommandsForTests();
    // Untyped fallback overload — string id, opaque payload.
    const result = await invokeCommand('not.registered', { whatever: true });
    assert.equal(result, undefined);
});

test('void commands can be invoked without a payload', async () => {
    __resetCommandsForTests();
    let called = false;
    registerCommand('agentforce.open', () => {
        called = true;
    });
    await invokeCommand('agentforce.open');
    assert.equal(called, true);
});

// ─── Compile-time tests ────────────────────────────────────────────────
//
// These don't assert anything at runtime — they exist so that running
// `tsc --noEmit` over this file proves the typed overloads catch the
// errors we care about. If any of the `@ts-expect-error` lines stop
// being errors, the type contract has regressed and the build fails
// (because `@ts-expect-error` errors when the next line type-checks).

test('compile-time: invokeCommand rejects wrong payload shape', () => {
    __resetCommandsForTests();
    registerCommand('agentforce.openAgent', () => undefined);

    // @ts-expect-error — `wrongField` is not part of agentforce.openAgent's payload.
    void invokeCommand('agentforce.openAgent', { wrongField: true });

    // Empty object IS valid now — N10 allows the slash-command form to
    // omit both `agentId` and `name` (handler short-circuits on missing
    // input). Type contract is "either id OR name OR neither".
    void invokeCommand('agentforce.openAgent', {});

    // @ts-expect-error — `agentId` must be a string, not a number.
    void invokeCommand('agentforce.openAgent', { agentId: 42 });

    // Valid calls — must compile cleanly. (No expect-error directive.)
    void invokeCommand('agentforce.openAgent', { agentId: 'abc', tab: 'inspector' });
    void invokeCommand('agentforce.openAgent', { name: 'Service Agent' });
});

test('compile-time: void commands accept no payload, reject any payload', () => {
    __resetCommandsForTests();
    registerCommand('agentforce.open', () => undefined);

    // Valid — no payload required.
    void invokeCommand('agentforce.open');

    // Also valid — explicit `undefined`.
    void invokeCommand('agentforce.open', undefined);

    // @ts-expect-error — `agentforce.open` takes no payload.
    void invokeCommand('agentforce.open', { extra: true });
});

test('compile-time: typed registerCommand validates handler payload type', () => {
    __resetCommandsForTests();

    // Valid — payload type matches.
    registerCommand('soql.selectTab', (payload: { tabId: string }) => payload.tabId);

    // @ts-expect-error — handler claims a payload field that doesn't exist
    // in `soql.selectTab`'s payload type. (`wrong` is not on { tabId }.)
    registerCommand('soql.selectTab', (payload: { wrong: number }) => payload.wrong);
});

test('compile-time: untyped fallback still accepts arbitrary string ids', () => {
    __resetCommandsForTests();

    // The fallback overload accepts any string id with `unknown` payload —
    // this is the backward-compat lifeline for legacy call sites that
    // haven't been migrated to typed ids yet. Must compile.
    void invokeCommand('legacy.untyped.command', { anything: 1 });

    // hasCommand must also work for arbitrary strings.
    void hasCommand('legacy.untyped.command');
});

test('CommandPayloads contains the canonical agentforce keys', () => {
    // Pure type-level assertion: `CommandPayloads` must include the keys
    // the consensus plan declared as the contract. The `assignableTo`
    // dance below fails to compile if any of these keys are dropped.
    type RequiredKeys =
        | 'agentforce.open'
        | 'agentforce.openAgent'
        | 'agentforce.openTrace'
        | 'soql.open'
        | 'soql.executeQueryIncognito'
        | 'api.executeRequest'
        | 'anonymousApex.executeApex'
        | 'anonymousApex.executeApexIncognito'
        | 'recordviewer.open';
    type AssertSubset<A extends keyof CommandPayloads> = A;
    type _check = AssertSubset<RequiredKeys>;
    // Runtime no-op — the build either compiled or it didn't.
    assert.ok(true);
});
