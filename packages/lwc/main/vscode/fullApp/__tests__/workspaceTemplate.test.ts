import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    DEFAULT_SOURCE_API_VERSION,
    PROD_LOGIN_URL,
    SANDBOX_LOGIN_URL,
    WORKSPACE_TEMPLATE_FILES,
    buildSfdxProjectFileContent,
    deriveSfdcLoginUrl,
} from '../workspaceTemplate.ts';

test('deriveSfdcLoginUrl: defaults to prod when nothing passed', () => {
    assert.equal(deriveSfdcLoginUrl(), PROD_LOGIN_URL);
    assert.equal(deriveSfdcLoginUrl({}), PROD_LOGIN_URL);
});

test('deriveSfdcLoginUrl: returns sandbox url when isSandbox=true', () => {
    assert.equal(deriveSfdcLoginUrl({ isSandbox: true }), SANDBOX_LOGIN_URL);
});

test('deriveSfdcLoginUrl: returns sandbox url when isScratch=true', () => {
    assert.equal(deriveSfdcLoginUrl({ isScratch: true }), SANDBOX_LOGIN_URL);
});

test('deriveSfdcLoginUrl: treats null/false as prod', () => {
    assert.equal(deriveSfdcLoginUrl({ isSandbox: false, isScratch: false }), PROD_LOGIN_URL);
    assert.equal(deriveSfdcLoginUrl({ isSandbox: null, isScratch: null }), PROD_LOGIN_URL);
});

test('buildSfdxProjectFileContent: emits valid JSON with defaults', () => {
    const content = buildSfdxProjectFileContent();
    const parsed = JSON.parse(content);
    assert.equal(parsed.name, 'MyProject');
    assert.equal(parsed.namespace, '');
    assert.equal(parsed.sfdcLoginUrl, PROD_LOGIN_URL);
    assert.equal(parsed.sourceApiVersion, DEFAULT_SOURCE_API_VERSION);
    assert.deepEqual(parsed.packageDirectories, [{ path: 'force-app', default: true }]);
});

test('buildSfdxProjectFileContent: honors custom login url + api version', () => {
    const content = buildSfdxProjectFileContent({
        sfdcLoginUrl: SANDBOX_LOGIN_URL,
        sourceApiVersion: '63.0',
    });
    const parsed = JSON.parse(content);
    assert.equal(parsed.sfdcLoginUrl, SANDBOX_LOGIN_URL);
    assert.equal(parsed.sourceApiVersion, '63.0');
});

test('DEFAULT_SOURCE_API_VERSION: matches NN.N format', () => {
    assert.match(DEFAULT_SOURCE_API_VERSION, /^\d+\.\d+$/);
});

test('WORKSPACE_TEMPLATE_FILES: includes the core seeded paths', () => {
    const keys = Object.keys(WORKSPACE_TEMPLATE_FILES);
    for (const expected of [
        '.vscode/extensions.json',
        'sfdx-project.json',
        'README.md',
        'manifest/package.xml',
        'assets/apex/hello.apex',
        'assets/soql/account.soql',
    ]) {
        assert.ok(keys.includes(expected), `missing template file: ${expected}`);
    }
});

test('WORKSPACE_TEMPLATE_FILES: sfdx-project.json uses the default builder output', () => {
    assert.equal(WORKSPACE_TEMPLATE_FILES['sfdx-project.json'], buildSfdxProjectFileContent());
});

test('WORKSPACE_TEMPLATE_FILES: extensions.json parses as valid JSON', () => {
    const parsed = JSON.parse(WORKSPACE_TEMPLATE_FILES['.vscode/extensions.json']);
    assert.deepEqual(parsed.recommendations, []);
    assert.deepEqual(parsed.unwantedRecommendations, []);
});

test('WORKSPACE_TEMPLATE_FILES: package.xml embeds the default api version', () => {
    const xml = WORKSPACE_TEMPLATE_FILES['manifest/package.xml'];
    assert.ok(xml.includes(`<version>${DEFAULT_SOURCE_API_VERSION}</version>`));
    assert.ok(xml.includes('<Package xmlns="http://soap.sforce.com/2006/04/metadata">'));
});

test('WORKSPACE_TEMPLATE_FILES: every value is a non-empty string', () => {
    for (const [path, content] of Object.entries(WORKSPACE_TEMPLATE_FILES)) {
        assert.equal(typeof content, 'string', `${path} should be a string`);
        assert.ok(content.length > 0, `${path} should be non-empty`);
    }
});
