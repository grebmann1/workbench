import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseCliArgs, resolveElectronBinary } from './desktopCli';

test('parseCliArgs returns the app intent by default', () => {
    assert.deepEqual(parseCliArgs([]), {
        command: { v: 2, type: 'openApp' },
        options: {
            apiUrl: 'http://127.0.0.1:12346',
            json: false,
            timeoutMs: 30000,
            wait: true,
        },
    });
});

test('parseCliArgs returns an org intent when --org is provided', () => {
    assert.deepEqual(parseCliArgs(['--org', 'demo-org']), {
        command: {
            v: 2,
            type: 'openOrg',
            org: { kind: 'alias', alias: 'demo-org' },
        },
        options: {
            apiUrl: 'http://127.0.0.1:12346',
            json: false,
            timeoutMs: 30000,
            wait: true,
        },
    });
});

test('parseCliArgs supports opening SOQL with a query', () => {
    assert.deepEqual(
        parseCliArgs([
            'open',
            'soql',
            '--target-org',
            'demo-org',
            '--query',
            'SELECT Id FROM Account',
        ]).command,
        {
            v: 2,
            type: 'openPage',
            org: { kind: 'alias', alias: 'demo-org' },
            route: {
                applicationName: 'soql',
                state: { query: 'SELECT Id FROM Account' },
            },
        }
    );
});

test('parseCliArgs does not let --org compatibility mode swallow subcommands', () => {
    assert.deepEqual(
        parseCliArgs(['open', 'soql', '--org', 'demo-org', '--query', 'SELECT Id FROM Account'])
            .command,
        {
            v: 2,
            type: 'openPage',
            org: { kind: 'alias', alias: 'demo-org' },
            route: {
                applicationName: 'soql',
                state: { query: 'SELECT Id FROM Account' },
            },
        }
    );
});

test('parseCliArgs supports sf data query commands', () => {
    assert.deepEqual(
        parseCliArgs([
            'sf',
            'data',
            'query',
            '--target-org',
            'demo-org',
            '--query',
            'SELECT Id FROM User LIMIT 1',
            '--json',
        ]),
        {
            command: {
                v: 2,
                type: 'execute',
                org: { kind: 'alias', alias: 'demo-org' },
                action: {
                    kind: 'soqlQuery',
                    query: 'SELECT Id FROM User LIMIT 1',
                    includeDeletedRecords: false,
                    useToolingApi: false,
                },
                output: 'json',
            },
            options: {
                apiUrl: 'http://127.0.0.1:12346',
                json: true,
                timeoutMs: 30000,
                wait: true,
            },
        }
    );
});

test('parseCliArgs supports sf navigate commands', () => {
    assert.deepEqual(
        parseCliArgs(['sf', 'navigate', '--target-org', 'demo-org', '--app', 'soql']).command,
        {
            v: 2,
            type: 'openPage',
            org: { kind: 'alias', alias: 'demo-org' },
            route: {
                applicationName: 'soql',
            },
        }
    );
});

test('parseCliArgs supports sf api request commands', () => {
    assert.deepEqual(
        parseCliArgs([
            'sf',
            'api',
            'request',
            '--target-org',
            'demo-org',
            '--method',
            'POST',
            '--url',
            '/services/data/',
            '--body',
            '{"ok":true}',
            '--header',
            'Content-Type: application/json',
        ]).command,
        {
            v: 2,
            type: 'execute',
            org: { kind: 'alias', alias: 'demo-org' },
            action: {
                kind: 'apiRequest',
                body: '{"ok":true}',
                endpoint: '/services/data/',
                headerText: 'Content-Type: application/json',
                method: 'POST',
            },
            output: 'text',
        }
    );
});

test('parseCliArgs supports sfdx auth URLs from files', () => {
    assert.deepEqual(
        parseCliArgs(['open', 'org', '--alias', 'demo-org', '--sfdx-url-file', '/tmp/org-url'])
            .command,
        {
            v: 2,
            type: 'openOrg',
            org: {
                kind: 'sfdxAuthUrlFile',
                alias: 'demo-org',
                path: '/tmp/org-url',
            },
        }
    );
});

test('resolveElectronBinary prefers the package-local Electron install', () => {
    const appPath = '/workspace/packages/desktop';
    const originalExistsSync = fs.existsSync;

    fs.existsSync = pathToCheck =>
        pathToCheck === '/workspace/packages/desktop/node_modules/.bin/electron';

    try {
        assert.equal(
            resolveElectronBinary(appPath),
            '/workspace/packages/desktop/node_modules/.bin/electron'
        );
    } finally {
        fs.existsSync = originalExistsSync;
    }
});

test('resolveElectronBinary falls back to the repo-root Electron install', () => {
    const appPath = '/workspace/packages/desktop';
    const originalExistsSync = fs.existsSync;

    fs.existsSync = pathToCheck => pathToCheck === '/workspace/node_modules/.bin/electron';

    try {
        assert.equal(resolveElectronBinary(appPath), '/workspace/node_modules/.bin/electron');
    } finally {
        fs.existsSync = originalExistsSync;
    }
});
