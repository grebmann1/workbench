// pageReference.test.ts
// Module: shared/pageReference/pageReference
// Runner: node:test + node:assert/strict via `node --experimental-strip-types --test`

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    readAppState,
    buildPageRef,
    pageRefStateEquals,
    type WorkbenchPageRef,
} from '../pageReference.ts';

/* -------------------------------------------------------------------------- */
/*  readAppState                                                              */
/* -------------------------------------------------------------------------- */

test('readAppState: undefined pageRef returns null', () => {
    assert.equal(readAppState(undefined, 'agentforce'), null);
});

test('readAppState: null pageRef returns null', () => {
    assert.equal(readAppState(null, 'agentforce'), null);
});

test('readAppState: wrong app returns null', () => {
    const pageRef: WorkbenchPageRef = {
        type: 'application',
        state: { applicationName: 'soql' },
    };
    assert.equal(readAppState(pageRef, 'agentforce'), null);
});

test('readAppState: matching app returns state without applicationName', () => {
    const pageRef: WorkbenchPageRef = {
        type: 'application',
        state: { applicationName: 'agentforce', tab: 'inspector' },
    };
    assert.deepEqual(readAppState(pageRef, 'agentforce'), { tab: 'inspector' });
});

test('readAppState: filters out applicationName key from result', () => {
    const pageRef: WorkbenchPageRef = {
        type: 'application',
        state: {
            applicationName: 'agentforce',
            tab: 'debugger',
            agentId: '001AB000001abcDEEAA',
        },
    };
    const result = readAppState(pageRef, 'agentforce');
    assert.ok(result);
    assert.equal('applicationName' in result, false);
    assert.deepEqual(result, { tab: 'debugger', agentId: '001AB000001abcDEEAA' });
});

test('readAppState: filters out undefined values', () => {
    const pageRef: WorkbenchPageRef = {
        type: 'application',
        state: {
            applicationName: 'agentforce',
            tab: 'inspector',
            agentId: undefined,
            conversationId: undefined,
        },
    };
    const result = readAppState(pageRef, 'agentforce');
    assert.deepEqual(result, { tab: 'inspector' });
});

test('readAppState: app match is case-insensitive', () => {
    const pageRef: WorkbenchPageRef = {
        type: 'application',
        state: { applicationName: 'AgentForce', tab: 'inspector' },
    };
    assert.deepEqual(readAppState(pageRef, 'agentforce'), { tab: 'inspector' });
});

test('readAppState: type-narrowed keys (compile-time)', () => {
    const pageRef: WorkbenchPageRef = {
        type: 'application',
        state: { applicationName: 'agentforce', tab: 'inspector', agentId: 'x' },
    };
    const result = readAppState<'tab' | 'agentId'>(pageRef, 'agentforce');
    assert.ok(result);
    // Type-level: result is Partial<Record<'tab' | 'agentId', string>>.
    // Runtime: keys still flow through verbatim.
    const tab: string | undefined = result.tab;
    const agentId: string | undefined = result.agentId;
    assert.equal(tab, 'inspector');
    assert.equal(agentId, 'x');
});

/* -------------------------------------------------------------------------- */
/*  buildPageRef                                                              */
/* -------------------------------------------------------------------------- */

test('buildPageRef: builds expected shape', () => {
    const ref = buildPageRef('agentforce', {
        tab: 'debugger',
        agentId: '001AB000001abcDEEAA',
    });
    assert.deepEqual(ref, {
        type: 'application',
        state: {
            applicationName: 'agentforce',
            tab: 'debugger',
            agentId: '001AB000001abcDEEAA',
        },
    });
});

test('buildPageRef: filters out undefined values', () => {
    const ref = buildPageRef('agentforce', {
        tab: 'inspector',
        agentId: undefined,
        conversationId: undefined,
    });
    assert.deepEqual(ref, {
        type: 'application',
        state: { applicationName: 'agentforce', tab: 'inspector' },
    });
    assert.equal('agentId' in ref.state, false);
    assert.equal('conversationId' in ref.state, false);
});

test('buildPageRef: caller-supplied applicationName cannot override app param', () => {
    const ref = buildPageRef('agentforce', {
        applicationName: 'soql',
        tab: 'inspector',
    });
    assert.equal(ref.state.applicationName, 'agentforce');
    assert.equal(ref.state.tab, 'inspector');
});

/* -------------------------------------------------------------------------- */
/*  pageRefStateEquals                                                        */
/* -------------------------------------------------------------------------- */

test('pageRefStateEquals: same app + same state → true', () => {
    const a = buildPageRef('agentforce', { tab: 'inspector', agentId: 'x' });
    const b = buildPageRef('agentforce', { tab: 'inspector', agentId: 'x' });
    assert.equal(pageRefStateEquals(a, b), true);
});

test('pageRefStateEquals: same app + different state → false', () => {
    const a = buildPageRef('agentforce', { tab: 'inspector' });
    const b = buildPageRef('agentforce', { tab: 'debugger' });
    assert.equal(pageRefStateEquals(a, b), false);
});

test('pageRefStateEquals: different app → false', () => {
    const a = buildPageRef('agentforce', { tab: 'inspector' });
    const b = buildPageRef('soql', { tab: 'inspector' });
    assert.equal(pageRefStateEquals(a, b), false);
});

test('pageRefStateEquals: null/undefined cases handled gracefully', () => {
    const ref = buildPageRef('agentforce', { tab: 'inspector' });
    assert.equal(pageRefStateEquals(null, null), true);
    assert.equal(pageRefStateEquals(undefined, undefined), true);
    assert.equal(pageRefStateEquals(null, undefined), true);
    assert.equal(pageRefStateEquals(ref, null), false);
    assert.equal(pageRefStateEquals(null, ref), false);
});

test('pageRefStateEquals: extra undefined entries are ignored', () => {
    const a: WorkbenchPageRef = {
        type: 'application',
        state: { applicationName: 'agentforce', tab: 'inspector', agentId: undefined },
    };
    const b: WorkbenchPageRef = {
        type: 'application',
        state: { applicationName: 'agentforce', tab: 'inspector' },
    };
    assert.equal(pageRefStateEquals(a, b), true);
});
