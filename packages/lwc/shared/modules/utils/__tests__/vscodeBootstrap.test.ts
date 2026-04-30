import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    normalizeVscodeBootstrapSeed,
    hasVscodeSessionBootstrap,
    hasVscodeAliasBootstrap,
    hasVscodeExplicitBootstrap,
    hasVscodeBootstrapEntrySeed,
    parseVscodeBootstrapSeed,
    buildVscodeEditorUrl,
} from '../vscodeBootstrap.ts';

test('normalizeVscodeBootstrapSeed: trims values and nulls empty strings', () => {
    const out = normalizeVscodeBootstrapSeed({
        alias: '  my-alias  ',
        sessionId: '',
        serverUrl: '',
        redirectUrl: '  /back  ',
        sourceTabId: null,
    });
    assert.equal(out.alias, 'my-alias');
    assert.equal(out.sessionId, null);
    assert.equal(out.serverUrl, null);
    assert.equal(out.redirectUrl, '/back');
    assert.equal(out.sourceTabId, null);
});

test('normalizeVscodeBootstrapSeed: sessionId only keeps both if serverUrl also present', () => {
    const onlySession = normalizeVscodeBootstrapSeed({ sessionId: 'sid' });
    assert.equal(onlySession.sessionId, null);
    assert.equal(onlySession.serverUrl, null);

    const both = normalizeVscodeBootstrapSeed({ sessionId: 'sid', serverUrl: 'https://s' });
    assert.equal(both.sessionId, 'sid');
    assert.equal(both.serverUrl, 'https://s');
});

test('hasVscodeSessionBootstrap: true only when both sessionId + serverUrl present', () => {
    assert.equal(hasVscodeSessionBootstrap({ sessionId: 'a', serverUrl: 'b' }), true);
    assert.equal(hasVscodeSessionBootstrap({ sessionId: 'a' }), false);
    assert.equal(hasVscodeSessionBootstrap({}), false);
});

test('hasVscodeAliasBootstrap: true when alias non-empty after trim', () => {
    assert.equal(hasVscodeAliasBootstrap({ alias: 'foo' }), true);
    assert.equal(hasVscodeAliasBootstrap({ alias: '   ' }), false);
    assert.equal(hasVscodeAliasBootstrap({}), false);
});

test('hasVscodeExplicitBootstrap: either alias OR (sessionId + serverUrl)', () => {
    assert.equal(hasVscodeExplicitBootstrap({ alias: 'a' }), true);
    assert.equal(hasVscodeExplicitBootstrap({ sessionId: 'x', serverUrl: 'y' }), true);
    assert.equal(hasVscodeExplicitBootstrap({ sourceTabId: 'tab' }), false);
});

test('hasVscodeBootstrapEntrySeed: includes sourceTabId-only case', () => {
    assert.equal(hasVscodeBootstrapEntrySeed({ sourceTabId: 'tab' }), true);
    assert.equal(hasVscodeBootstrapEntrySeed({ alias: 'a' }), true);
    assert.equal(hasVscodeBootstrapEntrySeed({}), false);
});

test('parseVscodeBootstrapSeed: from ?-prefixed string', () => {
    const seed = parseVscodeBootstrapSeed('?alias=foo&sessionId=sid&serverUrl=https%3A%2F%2Fs');
    assert.equal(seed.alias, 'foo');
    assert.equal(seed.sessionId, 'sid');
    assert.equal(seed.serverUrl, 'https://s');
});

test('parseVscodeBootstrapSeed: from URLSearchParams instance', () => {
    const params = new URLSearchParams({
        alias: 'bar',
        metadataType: 'ApexClass',
        memberName: 'X',
    });
    const seed = parseVscodeBootstrapSeed(params);
    assert.equal(seed.alias, 'bar');
    assert.equal(seed.metadataType, 'ApexClass');
    assert.equal(seed.memberName, 'X');
});

test('buildVscodeEditorUrl: returns null when no explicit bootstrap', () => {
    const url = buildVscodeEditorUrl({
        baseUrl: '/vscode',
        seed: { sourceTabId: 'only-tab' },
    });
    assert.equal(url, null);
});

test('buildVscodeEditorUrl: builds URL with session params', () => {
    const url = buildVscodeEditorUrl({
        baseUrl: '/vscode',
        seed: { sessionId: 'sid', serverUrl: 'https://s', alias: 'A', sourceTabId: '7' },
    });
    assert.ok(url);
    const parsed = new URL(url!);
    assert.equal(parsed.searchParams.get('sessionId'), 'sid');
    assert.equal(parsed.searchParams.get('serverUrl'), 'https://s');
    assert.equal(parsed.searchParams.get('alias'), 'A');
    assert.equal(parsed.searchParams.get('sourceTabId'), '7');
});

test('buildVscodeEditorUrl: alias-only seed produces URL with alias param', () => {
    const url = buildVscodeEditorUrl({ baseUrl: '/vscode', seed: { alias: 'my' } });
    assert.ok(url);
    const parsed = new URL(url!);
    assert.equal(parsed.searchParams.get('alias'), 'my');
    assert.equal(parsed.searchParams.get('sessionId'), null);
});
