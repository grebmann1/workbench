"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_test_1 = __importDefault(require("node:test"));
const desktopCli_1 = require("./desktopCli");
(0, node_test_1.default)('parseCliArgs returns the app intent by default', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)([]), {
        command: { v: 2, type: 'openApp' },
        options: {
            apiUrl: 'http://127.0.0.1:12346',
            json: false,
            timeoutMs: 30000,
            wait: true,
        },
    });
});
(0, node_test_1.default)('parseCliArgs returns an org intent when --org is provided', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)(['--org', 'demo-org']), {
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
(0, node_test_1.default)('parseCliArgs supports opening SOQL with a query', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)([
        'open',
        'soql',
        '--target-org',
        'demo-org',
        '--query',
        'SELECT Id FROM Account',
    ]).command, {
        v: 2,
        type: 'openPage',
        org: { kind: 'alias', alias: 'demo-org' },
        route: {
            applicationName: 'soql',
            state: { query: 'SELECT Id FROM Account' },
        },
    });
});
(0, node_test_1.default)('parseCliArgs does not let --org compatibility mode swallow subcommands', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)(['open', 'soql', '--org', 'demo-org', '--query', 'SELECT Id FROM Account'])
        .command, {
        v: 2,
        type: 'openPage',
        org: { kind: 'alias', alias: 'demo-org' },
        route: {
            applicationName: 'soql',
            state: { query: 'SELECT Id FROM Account' },
        },
    });
});
(0, node_test_1.default)('parseCliArgs supports sf data query commands', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)([
        'sf',
        'data',
        'query',
        '--target-org',
        'demo-org',
        '--query',
        'SELECT Id FROM User LIMIT 1',
        '--json',
    ]), {
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
    });
});
(0, node_test_1.default)('parseCliArgs supports sf navigate commands', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)(['sf', 'navigate', '--target-org', 'demo-org', '--app', 'soql']).command, {
        v: 2,
        type: 'openPage',
        org: { kind: 'alias', alias: 'demo-org' },
        route: {
            applicationName: 'soql',
        },
    });
});
(0, node_test_1.default)('parseCliArgs supports sf api request commands', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)([
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
    ]).command, {
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
    });
});
(0, node_test_1.default)('parseCliArgs supports sfdx auth URLs from files', () => {
    strict_1.default.deepEqual((0, desktopCli_1.parseCliArgs)(['open', 'org', '--alias', 'demo-org', '--sfdx-url-file', '/tmp/org-url'])
        .command, {
        v: 2,
        type: 'openOrg',
        org: {
            kind: 'sfdxAuthUrlFile',
            alias: 'demo-org',
            path: '/tmp/org-url',
        },
    });
});
(0, node_test_1.default)('resolveElectronBinary prefers the package-local Electron install', () => {
    const appPath = '/workspace/packages/desktop';
    const originalExistsSync = node_fs_1.default.existsSync;
    node_fs_1.default.existsSync = pathToCheck => pathToCheck === '/workspace/packages/desktop/node_modules/.bin/electron';
    try {
        strict_1.default.equal((0, desktopCli_1.resolveElectronBinary)(appPath), '/workspace/packages/desktop/node_modules/.bin/electron');
    }
    finally {
        node_fs_1.default.existsSync = originalExistsSync;
    }
});
(0, node_test_1.default)('resolveElectronBinary falls back to the repo-root Electron install', () => {
    const appPath = '/workspace/packages/desktop';
    const originalExistsSync = node_fs_1.default.existsSync;
    node_fs_1.default.existsSync = pathToCheck => pathToCheck === '/workspace/node_modules/.bin/electron';
    try {
        strict_1.default.equal((0, desktopCli_1.resolveElectronBinary)(appPath), '/workspace/node_modules/.bin/electron');
    }
    finally {
        node_fs_1.default.existsSync = originalExistsSync;
    }
});
