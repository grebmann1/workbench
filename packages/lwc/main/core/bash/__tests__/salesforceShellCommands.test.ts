import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    formatCliOutput,
    parseCliArgs,
    getFlagValue,
    ensureSingleValue,
    collectFlagArray,
    getApexExecutionExitCode,
    detectMetadataType,
    registerSalesforceShellCommands,
} from '../salesforceShellCommands.ts';

test('formatCliOutput: null/undefined → empty', () => {
    assert.equal(formatCliOutput(null), '');
    assert.equal(formatCliOutput(undefined), '');
});

test('formatCliOutput: strings pass through; objects are JSON.stringify pretty-printed', () => {
    assert.equal(formatCliOutput('hello'), 'hello');
    assert.equal(formatCliOutput({ a: 1 }), '{\n  "a": 1\n}');
});

test('parseCliArgs: long flags with inline and trailing value', () => {
    const { flags, positionals } = parseCliArgs(['--query=SELECT Id FROM Account', 'extra']);
    assert.equal(flags.get('query'), 'SELECT Id FROM Account');
    assert.deepEqual(positionals, ['extra']);
});

test('parseCliArgs: long flags consume next arg when expected', () => {
    const { flags } = parseCliArgs(['--query', 'SELECT Id']);
    assert.equal(flags.get('query'), 'SELECT Id');
});

test('parseCliArgs: boolean flags (no value expected) stay truthy', () => {
    const { flags } = parseCliArgs(['--tooling', '--all-rows']);
    assert.equal(flags.get('tooling'), true);
    assert.equal(flags.get('all-rows'), true);
});

test('parseCliArgs: repeated --header collects into array', () => {
    const { flags } = parseCliArgs(['--header', 'A: 1', '--header', 'B: 2']);
    assert.deepEqual(flags.get('header'), ['A: 1', 'B: 2']);
});

test('parseCliArgs: short flag -q with value', () => {
    const { flags } = parseCliArgs(['-q', 'SELECT Id']);
    assert.equal(flags.get('q'), 'SELECT Id');
});

test('parseCliArgs: -- terminator pushes remaining args as positionals', () => {
    const { flags, positionals } = parseCliArgs(['--foo', 'bar', '--', '--baz']);
    // 'foo' isn't in expectValueFlags, so it becomes a boolean and 'bar' is a positional.
    assert.equal(flags.get('foo'), true);
    assert.deepEqual(positionals, ['bar', '--baz']);
});

test('getFlagValue: first matching alias wins', () => {
    const flags = new Map<string, string | boolean | string[]>([
        ['u', 'alias1'],
        ['target-org', 'alias2'],
    ]);
    assert.equal(getFlagValue(flags, 'target-org', 'u'), 'alias2');
    assert.equal(getFlagValue(flags, 'u', 'target-org'), 'alias1');
    assert.equal(getFlagValue(flags, 'x'), undefined);
});

test('ensureSingleValue: returns last element of arrays', () => {
    assert.equal(ensureSingleValue(['a', 'b', 'c']), 'c');
    assert.equal(ensureSingleValue('solo'), 'solo');
    assert.equal(ensureSingleValue(undefined), undefined);
});

test('collectFlagArray: wraps single value; null → []', () => {
    assert.deepEqual(collectFlagArray('x'), ['x']);
    assert.deepEqual(collectFlagArray(['a', 'b']), ['a', 'b']);
    assert.deepEqual(collectFlagArray(undefined), []);
});

test('getApexExecutionExitCode: failure markers map to 1', () => {
    assert.equal(getApexExecutionExitCode({ compileProblem: 'oops' }), 1);
    assert.equal(getApexExecutionExitCode({ exceptionMessage: 'boom' }), 1);
    assert.equal(getApexExecutionExitCode({ compiled: false }), 1);
    assert.equal(getApexExecutionExitCode({ success: false }), 1);
    assert.equal(getApexExecutionExitCode({ error: 'x' }), 1);
});

test('getApexExecutionExitCode: success / non-object → 0', () => {
    assert.equal(getApexExecutionExitCode({ compiled: true, success: true }), 0);
    assert.equal(getApexExecutionExitCode(null), 0);
    assert.equal(getApexExecutionExitCode('string'), 0);
});

test('detectMetadataType: maps known extensions to tooling types', () => {
    assert.deepEqual(detectMetadataType('src/classes/MyClass.cls'), {
        type: 'ApexClass',
        apiName: 'MyClass',
    });
    assert.deepEqual(detectMetadataType('MyTrigger.trigger'), {
        type: 'ApexTrigger',
        apiName: 'MyTrigger',
    });
});

test('detectMetadataType: strips -meta.xml suffix from apiName', () => {
    assert.deepEqual(detectMetadataType('MyClass.cls-meta.xml'), {
        type: null,
        apiName: 'MyClass.cls',
    });
});

test('detectMetadataType: no extension returns type=null', () => {
    assert.deepEqual(detectMetadataType('README'), { type: null, apiName: 'README' });
});

test('parseCliArgs: sf open flags requiring values are consumed', () => {
    const { flags } = parseCliArgs([
        '--object',
        'Account',
        '--id',
        '001000000000001',
        '--filter',
        '__Recent',
        '--node',
        'ManageUsers',
        '--path',
        '/lightning/o/Account/list',
    ]);
    assert.equal(flags.get('object'), 'Account');
    assert.equal(flags.get('id'), '001000000000001');
    assert.equal(flags.get('filter'), '__Recent');
    assert.equal(flags.get('node'), 'ManageUsers');
    assert.equal(flags.get('path'), '/lightning/o/Account/list');
});

test('registerSalesforceShellCommands: sf open record delegates to openSalesforce handler', async () => {
    let sfCommand: any;
    const shell = {
        registerCommand(cmd) {
            if (cmd.name === 'sf') {
                sfCommand = cmd;
            }
        },
    };
    let capturedArgs: any = null;
    const handlers: any = {
        executeApex: async () => ({}),
        executeSoql: async () => ({}),
        executeApi: async () => ({}),
        listOrgs: async () => ({}),
        openOrg: async () => ({}),
        connectOrg: async () => ({}),
        navigate: async () => ({}),
        openSalesforce: async args => {
            capturedArgs = args;
            return { result: 'ok', exitCode: 0 };
        },
        runApexTests: async () => ({}),
        enableDebugLog: async () => ({}),
        listDebugLogs: async () => ({}),
        getDebugLog: async () => ({}),
        displayLimits: async () => ({}),
        describeSObject: async () => ({}),
        deployMetadata: async () => ({}),
        retrieveMetadata: async () => ({}),
        listMetadataTypes: async () => ({}),
        listMetadataRecords: async () => ({}),
    };
    registerSalesforceShellCommands({ shell: shell as any, handlers });
    assert.ok(sfCommand, 'sf command should be registered');
    const result = await sfCommand.execute(
        ['open', 'record', '--object', 'Account', '--id', '001000000000001'],
        {
            cwd: '/workspace',
            fs: {
                resolvePath: (_cwd, path) => path,
                readFile: async () => '',
                exists: async () => true,
            },
        }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(capturedArgs.kind, 'record');
    assert.equal(capturedArgs.object, 'Account');
    assert.equal(capturedArgs.id, '001000000000001');
});

test('registerSalesforceShellCommands: sf open validates missing required args', async () => {
    let sfCommand: any;
    const shell = {
        registerCommand(cmd) {
            if (cmd.name === 'sf') {
                sfCommand = cmd;
            }
        },
    };
    const handlers: any = {
        executeApex: async () => ({}),
        executeSoql: async () => ({}),
        executeApi: async () => ({}),
        listOrgs: async () => ({}),
        openOrg: async () => ({}),
        connectOrg: async () => ({}),
        navigate: async () => ({}),
        openSalesforce: async () => ({ result: 'ok', exitCode: 0 }),
        runApexTests: async () => ({}),
        enableDebugLog: async () => ({}),
        listDebugLogs: async () => ({}),
        getDebugLog: async () => ({}),
        displayLimits: async () => ({}),
        describeSObject: async () => ({}),
        deployMetadata: async () => ({}),
        retrieveMetadata: async () => ({}),
        listMetadataTypes: async () => ({}),
        listMetadataRecords: async () => ({}),
    };
    registerSalesforceShellCommands({ shell: shell as any, handlers });

    const recordMissingId = await sfCommand.execute(['open', 'record', '--object', 'Account'], {
        cwd: '/workspace',
        fs: {
            resolvePath: (_cwd, path) => path,
            readFile: async () => '',
            exists: async () => true,
        },
    });
    assert.equal(recordMissingId.exitCode, 1);
    assert.match(recordMissingId.stderr, /record requires --object and --id/);

    const pageMissingPath = await sfCommand.execute(['open', 'page'], {
        cwd: '/workspace',
        fs: {
            resolvePath: (_cwd, path) => path,
            readFile: async () => '',
            exists: async () => true,
        },
    });
    assert.equal(pageMissingPath.exitCode, 1);
    assert.match(pageMissingPath.stderr, /page requires --path/);
});

test('registerSalesforceShellCommands: sf open rejects unknown subcommand with help text', async () => {
    let sfCommand: any;
    const shell = {
        registerCommand(cmd) {
            if (cmd.name === 'sf') {
                sfCommand = cmd;
            }
        },
    };
    const handlers: any = {
        executeApex: async () => ({}),
        executeSoql: async () => ({}),
        executeApi: async () => ({}),
        listOrgs: async () => ({}),
        openOrg: async () => ({}),
        connectOrg: async () => ({}),
        navigate: async () => ({}),
        openSalesforce: async () => ({ result: 'ok', exitCode: 0 }),
        runApexTests: async () => ({}),
        enableDebugLog: async () => ({}),
        listDebugLogs: async () => ({}),
        getDebugLog: async () => ({}),
        displayLimits: async () => ({}),
        describeSObject: async () => ({}),
        deployMetadata: async () => ({}),
        retrieveMetadata: async () => ({}),
        listMetadataTypes: async () => ({}),
        listMetadataRecords: async () => ({}),
    };
    registerSalesforceShellCommands({ shell: shell as any, handlers });
    const result = await sfCommand.execute(['open', 'unknown-mode'], {
        cwd: '/workspace',
        fs: {
            resolvePath: (_cwd, path) => path,
            readFile: async () => '',
            exists: async () => true,
        },
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Unknown sf open subcommand/);
    assert.match(result.stderr, /sf open record/);
});

test('registerSalesforceShellCommands: sf open passes targetOrg/newTab/url args to handler', async () => {
    let sfCommand: any;
    const shell = {
        registerCommand(cmd) {
            if (cmd.name === 'sf') {
                sfCommand = cmd;
            }
        },
    };
    let capturedArgs: any = null;
    const handlers: any = {
        executeApex: async () => ({}),
        executeSoql: async () => ({}),
        executeApi: async () => ({}),
        listOrgs: async () => ({}),
        openOrg: async () => ({}),
        connectOrg: async () => ({}),
        navigate: async () => ({}),
        openSalesforce: async args => {
            capturedArgs = args;
            return { result: 'ok', exitCode: 0 };
        },
        runApexTests: async () => ({}),
        enableDebugLog: async () => ({}),
        listDebugLogs: async () => ({}),
        getDebugLog: async () => ({}),
        displayLimits: async () => ({}),
        describeSObject: async () => ({}),
        deployMetadata: async () => ({}),
        retrieveMetadata: async () => ({}),
        listMetadataTypes: async () => ({}),
        listMetadataRecords: async () => ({}),
    };
    registerSalesforceShellCommands({ shell: shell as any, handlers });
    const result = await sfCommand.execute(
        [
            'open',
            'url',
            '--url',
            'https://acme.my.salesforce.com/lightning/o/Account/list?filterName=__Recent',
            '--target-org',
            'my-sandbox',
            '--new-tab',
        ],
        {
            cwd: '/workspace',
            fs: {
                resolvePath: (_cwd, path) => path,
                readFile: async () => '',
                exists: async () => true,
            },
        }
    );
    assert.equal(result.exitCode, 0);
    assert.equal(capturedArgs.kind, 'url');
    assert.equal(
        capturedArgs.absoluteUrl,
        'https://acme.my.salesforce.com/lightning/o/Account/list?filterName=__Recent'
    );
    assert.equal(capturedArgs.targetOrg, 'my-sandbox');
    assert.equal(capturedArgs.newTab, true);
});
