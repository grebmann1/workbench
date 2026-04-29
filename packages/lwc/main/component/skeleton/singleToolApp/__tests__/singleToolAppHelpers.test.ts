import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    DEFAULT_TOOL_PATH,
    ALLOWED_SINGLE_TOOL_PATHS,
    normalizeSingleToolPath,
    getRequestedPathFromPage,
    resolveSingleToolConfig,
    buildPageRefForPath,
} from '../singleToolAppHelpers.ts';

test('constants: DEFAULT_TOOL_PATH is "api" and is in the allowlist', () => {
    assert.equal(DEFAULT_TOOL_PATH, 'api');
    assert.ok(ALLOWED_SINGLE_TOOL_PATHS.has('api'));
});

test('normalizeSingleToolPath: trims + lowercases; empty → default', () => {
    assert.equal(normalizeSingleToolPath('  API  '), 'api');
    assert.equal(normalizeSingleToolPath(''), 'api');
    assert.equal(normalizeSingleToolPath(null), 'api');
    assert.equal(normalizeSingleToolPath(undefined), 'api');
});

test('getRequestedPathFromPage: pulls applicationName from pageRef', () => {
    assert.equal(getRequestedPathFromPage({ state: { applicationName: 'API' } }), 'api');
    assert.equal(getRequestedPathFromPage({}), 'api');
    assert.equal(getRequestedPathFromPage(undefined), 'api');
});

test('resolveSingleToolConfig: returns matching app when path is allowed', () => {
    const appList = [
        { path: 'api', name: 'API' },
        { path: 'soql', name: 'SOQL' },
    ];
    const out = resolveSingleToolConfig('api', appList);
    assert.equal(out?.name, 'API');
});

test('resolveSingleToolConfig: returns null for path not in allowlist', () => {
    const appList = [{ path: 'soql', name: 'SOQL' }];
    assert.equal(resolveSingleToolConfig('soql', appList), null);
});

test('resolveSingleToolConfig: returns null if app missing from appList', () => {
    assert.equal(resolveSingleToolConfig('api', []), null);
});

test('buildPageRefForPath: wraps path in standard pageRef shape', () => {
    assert.deepEqual(buildPageRefForPath('API'), {
        type: 'application',
        state: { applicationName: 'api' },
    });
});
