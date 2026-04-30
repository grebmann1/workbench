export type ShellCommandResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

export type ShellCommandContext = {
    cwd: string;
    stdin?: string;
    fs: {
        resolvePath: (cwd: string, path: string) => string;
        readFile: (path: string, encoding?: string) => Promise<string>;
        writeFile?: (
            path: string,
            content: string,
            options?: { encoding?: string }
        ) => Promise<void>;
        mkdir?: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
        exists: (path: string) => Promise<boolean>;
    };
};

type ShellLike = {
    registerCommand: (cmd: {
        name: string;
        execute: (argv: string[], ctx: ShellCommandContext) => Promise<ShellCommandResult>;
    }) => void;
};

type SalesforceCommandExecution =
    | unknown
    | {
          result?: unknown;
          exitCode?: number;
      };

type SalesforceShellHandlers = {
    executeApex: (args: {
        apexCode: string;
        shouldOpenUi: boolean;
        sourceFilePath: string | null;
        ctx: ShellCommandContext;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    executeSoql: (args: {
        query: string;
        useToolingApi: boolean;
        includeDeletedRecords: boolean;
        ctx: ShellCommandContext;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    executeApi: (args: {
        method: string;
        endpoint: string;
        body: string;
        headerValues: string[];
        headerText: string;
        bodyFilePath: string | null;
        ctx: ShellCommandContext;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    listOrgs: () => Promise<SalesforceCommandExecution>;
    openOrg: (args: { alias: string }) => Promise<SalesforceCommandExecution>;
    connectOrg: (args: { alias: string }) => Promise<SalesforceCommandExecution>;
    navigate: (args: { app: string }) => Promise<SalesforceCommandExecution>;
    runApexTests: (args: {
        classNames: string[];
        testLevel: string;
        timeoutMs: number;
        ctx: ShellCommandContext;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    enableDebugLog: (args: {
        durationMinutes: number;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    listDebugLogs: (args: {
        limit: number;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    getDebugLog: (args: {
        logId: string;
        outputPath: string | null;
        ctx: ShellCommandContext;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    displayLimits: (args?: { targetOrg?: string }) => Promise<SalesforceCommandExecution>;
    describeSObject: (args: {
        objectName: string;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    deployMetadata: (args: {
        filePath: string;
        metadataType: string | null;
        apiName: string | null;
        ctx: ShellCommandContext;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    retrieveMetadata: (args: {
        metadataType: string;
        apiName: string;
        outputPath: string | null;
        ctx: ShellCommandContext;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
    listMetadataTypes: (args: { targetOrg?: string }) => Promise<SalesforceCommandExecution>;
    listMetadataRecords: (args: {
        metadataType: string;
        targetOrg?: string;
    }) => Promise<SalesforceCommandExecution>;
};

export const APEX_HELP = `Run anonymous Apex (SF CLI shim).

Usage:
  sf apex run --apex-code '<code>'
  sf apex run --file <path>
  sf apex run --apex-code '<code>' --target-org <alias>
  sf apex run --help

Options:
  --apex-code, -c       Inline Apex code (required if --file not given)
  --file, -f            Path to an .apex file in /workspace
  --no-ui               Skip opening the Apex Editor UI
  --target-org, -o, -u  Alias of the org to run against (default: active org)

Notes:
  - Uses the Apex Editor execution path (same as the Apex tools).
  - By default, opens the Anonymous Apex UI. Use --no-ui to skip it.
  - Either --apex-code or --file is required.`;

export const SOQL_HELP = `Run a SOQL query (SF CLI shim).

Usage:
  sf data query --query "<soql>"
  sf data query --query "<soql>" --tooling
  sf data query --query "<soql>" --all-rows
  sf data query --query "<soql>" --target-org <alias>
  sf data query --help

Options:
  --query, -q           SOQL query string (required)
  --tooling             Use Tooling API
  --all-rows            Include soft-deleted records
  --target-org, -o, -u  Alias of the org to query (default: active org)
`;

export const API_HELP = `Send a REST API request (SF CLI shim).

Usage:
  sf api request --method GET --url "<endpoint>"
  sf api request --method POST --url "<endpoint>" --body '<json>'
  sf api request --method POST --url "<endpoint>" --body @<file>
  sf api request --header "Key: Value" --header "Key2: Value2"
  sf api request --method GET --url "<endpoint>" --target-org <alias>
  sf api request --help

Options:
  --method, -X          HTTP method (default: GET)
  --url                 API endpoint, relative or absolute (required)
  --body                Request body JSON or @<file> path
  --header, -H          Request header "Key: Value" (repeatable)
  --target-org, -o      Alias of the org to call (default: active org)

Notes:
  - Endpoint can be relative (e.g. /services/data/vXX.X/...) or absolute.
  - Headers can be repeated.
  - Use --target-org (not -u) in this command; -u is reserved for the URL.`;

export const ORG_HELP = `List, connect, or open Salesforce orgs (SF CLI shim).

Usage:
  sf org list
  sf org connect --target-org <alias>
  sf org open --target-org <alias>
  sf org open -o <alias>
  sf org open -u <alias>
  sf org --help

Subcommands:
  list     List all configured org connections
  connect  Connect to an org (establishes toolkit session / login)
  open     Open an org in the browser via the front door URL

Notes:
  - Use sf org connect to log in or switch the active org.
  - sf org open only opens a browser tab — it does NOT connect to the org.
  - Alias is required for org connect and org open.`;

export const APEX_TEST_HELP = `Run Apex tests (SF CLI shim).

Usage:
  sf apex test run --class-names "MyTestClass,AnotherTest"
  sf apex test run --class-names "MyTestClass" --test-level RunSpecifiedTests
  sf apex test run --test-level RunLocalTests
  sf apex test run --timeout 120000
  sf apex test run --class-names "MyTestClass" --target-org <alias>
  sf apex test run --help

Options:
  --class-names, -n     Comma-separated list of test class names (required unless test-level is RunLocalTests/RunAllTestsInOrg)
  --test-level          RunSpecifiedTests | RunLocalTests | RunAllTestsInOrg (default: RunSpecifiedTests)
  --timeout             Max wait time in ms (default: 60000)
  --target-org, -o, -u  Alias of the org to run tests against (default: active org)`;

export const DEBUG_LOG_HELP = `Manage Salesforce debug logs (SF CLI shim).

Usage:
  sf debug log enable
  sf debug log enable --duration 30
  sf debug log enable --target-org <alias>
  sf debug log list
  sf debug log list --limit 10
  sf debug log list --target-org <alias>
  sf debug log get <id>
  sf debug log get <id> --output /workspace/debug.log
  sf debug log get <id> --target-org <alias>
  sf debug log --help

Subcommands:
  enable    Create or refresh a TraceFlag so debug logs are captured (default: 15 min)
  list      List recent ApexLog records
  get       Download a specific log body by ID

Options (all subcommands):
  --target-org, -o, -u  Alias of the org (default: active org)`;

export const LIMITS_HELP = `Display API limits for the connected org (SF CLI shim).

Usage:
  sf limits display
  sf limits display --target-org <alias>
  sf limits display --help

Options:
  --target-org, -o, -u  Alias of the org (default: active org)`;

export const SOBJECT_HELP = `Describe a Salesforce SObject's fields and metadata (SF CLI shim).

Usage:
  sf sobject describe --object Account
  sf sobject describe --object Contact
  sf sobject describe --object MyCustomObject__c
  sf sobject describe --object Account --target-org <alias>
  sf sobject describe --help

Options:
  --object          SObject API name (required)
  --target-org, -o, -u  Alias of the org (default: active org)`;

export const METADATA_HELP = `Deploy, retrieve, or browse Salesforce metadata (SF CLI shim).

Usage:
  sf metadata list-types
  sf metadata list-types --target-org <alias>
  sf metadata list-records --metadata-type ApexClass
  sf metadata list-records --metadata-type ApexClass --target-org <alias>
  sf metadata deploy --file /workspace/MyClass.cls
  sf metadata deploy --file /workspace/MyTrigger.trigger
  sf metadata deploy --file /workspace/MyPage.page
  sf metadata retrieve --metadata-type ApexClass --api-name MyClass
  sf metadata retrieve --metadata-type ApexClass --api-name MyClass --output /workspace/retrieved
  sf metadata --help

Subcommands:
  list-types    List all available metadata types in the org
  list-records  List all records for a given metadata type
  deploy        Deploy a metadata file to the org
  retrieve      Retrieve a metadata record from the org

Supported Tooling API types for deploy/retrieve:
  ApexClass, ApexTrigger, ApexPage, ApexComponent, StaticResource

Options:
  list-records:
    --metadata-type, -m  Metadata type (required)
  deploy:
    --file, -f           Path to metadata file in /workspace (required)
    --metadata-type      Override auto-detected type
    --api-name           Override auto-detected API name
  retrieve:
    --metadata-type      Metadata type (required)
    --api-name           API name of the record to retrieve (required)
    --output             Output directory (default: /workspace)
  all:
    --target-org, -o, -u  Alias of the org (default: active org)`;

function createCommand(
    name: string,
    execute: (argv: string[], ctx: ShellCommandContext) => Promise<ShellCommandResult>
) {
    return { name, execute };
}

export function formatCliOutput(value: unknown) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function parseCliArgs(argv: string[]) {
    const flags = new Map<string, string | boolean | string[]>();
    const positionals: string[] = [];
    const addFlag = (key: string, value: string | boolean = true) => {
        const existing = flags.get(key);
        if (existing == null) {
            flags.set(key, value);
            return;
        }
        if (Array.isArray(existing)) {
            existing.push(value as string);
            return;
        }
        flags.set(key, [existing as string, value as string]);
    };
    const expectValueFlags = new Set([
        'f',
        'file',
        'c',
        'apex-code',
        'q',
        'query',
        'H',
        'header',
        'X',
        'method',
        'url',
        'endpoint',
        'body',
        'u',
        'target-org',
        'o',
        'n',
        'class-names',
        'test-level',
        'timeout',
        'duration',
        'limit',
        'output',
        'metadata-type',
        'm',
        'api-name',
        'object',
        'app',
        'a',
    ]);
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--') {
            positionals.push(...argv.slice(i + 1));
            break;
        }
        if (arg.startsWith('--')) {
            const [rawKey, inlineValue] = arg.slice(2).split('=');
            if (inlineValue !== undefined) {
                addFlag(rawKey, inlineValue);
                continue;
            }
            const next = argv[i + 1];
            if (next == null || next.startsWith('-') || !expectValueFlags.has(rawKey)) {
                addFlag(rawKey, true);
            } else {
                addFlag(rawKey, next);
                i += 1;
            }
            continue;
        }
        if (arg.startsWith('-') && arg.length > 1) {
            const key = arg.slice(1);
            const next = argv[i + 1];
            if (next == null || next.startsWith('-') || !expectValueFlags.has(key)) {
                addFlag(key, true);
            } else {
                addFlag(key, next);
                i += 1;
            }
            continue;
        }
        positionals.push(arg);
    }
    return { flags, positionals };
}

export function getFlagValue(flags: Map<string, string | boolean | string[]>, ...names: string[]) {
    for (const name of names) {
        if (flags.has(name)) return flags.get(name);
    }
    return undefined;
}

export function ensureSingleValue(value: string | boolean | string[] | undefined) {
    if (Array.isArray(value)) return value[value.length - 1];
    return value;
}

export function collectFlagArray(value: string | boolean | string[] | undefined) {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
}

export async function resolveCliFileContent(filePath: string, ctx: ShellCommandContext) {
    const resolvedPath = ctx.fs.resolvePath(ctx.cwd, filePath);
    try {
        const content = await ctx.fs.readFile(resolvedPath, 'utf-8');
        return { content, resolvedPath };
    } catch {
        return { content: null, resolvedPath };
    }
}

function normalizeHandlerResult(value: SalesforceCommandExecution) {
    if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (Object.prototype.hasOwnProperty.call(value, 'result') ||
            Object.prototype.hasOwnProperty.call(value, 'exitCode'))
    ) {
        const typed = value as { result?: unknown; exitCode?: number };
        return {
            result: typed.result,
            exitCode: Number.isFinite(typed.exitCode) ? Number(typed.exitCode) : 0,
        };
    }
    return { result: value, exitCode: 0 };
}

function commandError(message: string) {
    return {
        stdout: '',
        stderr: `Error: ${message}\n`,
        exitCode: 1,
    };
}

export function getApexExecutionExitCode(result: unknown) {
    if (!result || typeof result !== 'object') return 0;
    const maybe = result as {
        compiled?: boolean;
        success?: boolean;
        compileProblem?: string;
        exceptionMessage?: string;
        error?: unknown;
    };
    if (maybe.compileProblem || maybe.exceptionMessage || maybe.error) return 1;
    if (typeof maybe.compiled === 'boolean' && !maybe.compiled) return 1;
    if (typeof maybe.success === 'boolean' && !maybe.success) return 1;
    return 0;
}

const TOOLING_API_TYPES: Record<string, string> = {
    '.cls': 'ApexClass',
    '.trigger': 'ApexTrigger',
    '.page': 'ApexPage',
    '.component': 'ApexComponent',
    '.resource': 'StaticResource',
};

export const NAVIGATE_HELP = `Navigate the SF Toolkit to a specific application (SF CLI shim).

Usage:
  sf navigate --app soql
  sf navigate --app api
  sf navigate -a metadata
  sf navigate --help

Options:
  --app, -a    Application name (required)

Available apps:
  api, soql, anonymousApex, agent, connections, settings, accessAnalyzer,
  org, code, metadata, object, doc, recordViewer, platformevent, package,
  assistant, release`;

export function detectMetadataType(filePath: string): { type: string | null; apiName: string } {
    const basename = filePath.split('/').pop() || filePath;
    const lastDot = basename.lastIndexOf('.');
    if (lastDot === -1) return { type: null, apiName: basename };
    const ext = basename.slice(lastDot);
    const nameOnly = basename.slice(0, lastDot);
    // Strip -meta.xml suffix if present
    const apiName = nameOnly.endsWith('-meta') ? nameOnly.slice(0, -5) : nameOnly;
    return { type: TOOLING_API_TYPES[ext] ?? null, apiName };
}

export function registerSalesforceShellCommands({
    shell,
    handlers,
}: {
    shell: ShellLike;
    handlers: SalesforceShellHandlers;
}) {
    const runApexCli = async (argv: string[], ctx: ShellCommandContext) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: APEX_HELP, stderr: '', exitCode: 0 };
        }
        const { flags } = parseCliArgs(argv);
        const fileFlag = ensureSingleValue(getFlagValue(flags, 'file', 'f'));
        const codeFlag = ensureSingleValue(getFlagValue(flags, 'apex-code', 'c'));
        const shouldOpenUi = !getFlagValue(flags, 'no-ui');
        const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
            | string
            | undefined;
        let apexCode = typeof codeFlag === 'string' ? codeFlag : '';
        let sourceFilePath: string | null = null;
        if (!apexCode && typeof fileFlag === 'string') {
            const fileResult = await resolveCliFileContent(fileFlag, ctx);
            if (!fileResult.content) {
                return {
                    stdout: '',
                    stderr: `Error: Cannot read file: ${fileResult.resolvedPath}\n`,
                    exitCode: 1,
                };
            }
            apexCode = fileResult.content;
            sourceFilePath = fileResult.resolvedPath;
        }
        if (!apexCode) {
            return {
                stdout: '',
                stderr: `Error: Missing Apex code. Use --apex-code or --file.\n\n${APEX_HELP}\n`,
                exitCode: 1,
            };
        }

        try {
            const handled = normalizeHandlerResult(
                await handlers.executeApex({
                    apexCode,
                    shouldOpenUi,
                    sourceFilePath,
                    ctx,
                    targetOrg,
                })
            );
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runSoqlCli = async (argv: string[], ctx: ShellCommandContext) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: SOQL_HELP, stderr: '', exitCode: 0 };
        }
        const { flags } = parseCliArgs(argv);
        const query = ensureSingleValue(getFlagValue(flags, 'query', 'q'));
        if (!query || typeof query !== 'string') {
            return {
                stdout: '',
                stderr: `Error: Missing SOQL query. Use --query.\n\n${SOQL_HELP}\n`,
                exitCode: 1,
            };
        }
        const useToolingApi = Boolean(getFlagValue(flags, 'tooling'));
        const includeDeletedRecords = Boolean(getFlagValue(flags, 'all-rows'));
        const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
            | string
            | undefined;
        try {
            const handled = normalizeHandlerResult(
                await handlers.executeSoql({
                    query,
                    useToolingApi,
                    includeDeletedRecords,
                    ctx,
                    targetOrg,
                })
            );
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runApiCli = async (argv: string[], ctx: ShellCommandContext) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: API_HELP, stderr: '', exitCode: 0 };
        }
        const { flags } = parseCliArgs(argv);
        const method = String(
            ensureSingleValue(getFlagValue(flags, 'method', 'X')) || 'GET'
        ).toUpperCase();
        const endpoint = ensureSingleValue(getFlagValue(flags, 'url', 'endpoint', 'u')) || '';
        const bodyFlag = ensureSingleValue(getFlagValue(flags, 'body'));
        const headerValues = collectFlagArray(getFlagValue(flags, 'header', 'H'))
            .map(value => String(value))
            .filter(Boolean);

        if (!endpoint || typeof endpoint !== 'string') {
            return {
                stdout: '',
                stderr: `Error: Missing request URL. Use --url.\n\n${API_HELP}\n`,
                exitCode: 1,
            };
        }

        let body = typeof bodyFlag === 'string' ? bodyFlag : '';
        let bodyFilePath: string | null = null;
        if (body && body.startsWith('@')) {
            const fileResult = await resolveCliFileContent(body.slice(1), ctx);
            if (!fileResult.content) {
                return {
                    stdout: '',
                    stderr: `Error: Cannot read file: ${fileResult.resolvedPath}\n`,
                    exitCode: 1,
                };
            }
            body = fileResult.content;
            bodyFilePath = fileResult.resolvedPath;
        }

        const headerText = headerValues.join('\n');
        const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o')) as
            | string
            | undefined;

        try {
            const handled = normalizeHandlerResult(
                await handlers.executeApi({
                    method,
                    endpoint: String(endpoint),
                    body,
                    headerValues,
                    headerText,
                    bodyFilePath,
                    ctx,
                    targetOrg,
                })
            );
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runOrgListCli = async () => {
        try {
            const handled = normalizeHandlerResult(await handlers.listOrgs());
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runOrgOpenCli = async (argv: string[]) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: ORG_HELP, stderr: '', exitCode: 0 };
        }
        const { flags } = parseCliArgs(argv);
        const alias = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u'));
        if (!alias || typeof alias !== 'string') {
            return {
                stdout: '',
                stderr: `Error: Missing org alias. Use --target-org.\n\n${ORG_HELP}\n`,
                exitCode: 1,
            };
        }
        try {
            const handled = normalizeHandlerResult(await handlers.openOrg({ alias }));
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runOrgConnectCli = async (argv: string[]) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: ORG_HELP, stderr: '', exitCode: 0 };
        }
        const { flags } = parseCliArgs(argv);
        const alias = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u'));
        if (!alias || typeof alias !== 'string') {
            return {
                stdout: '',
                stderr: `Error: Missing org alias. Use --target-org.\n\n${ORG_HELP}\n`,
                exitCode: 1,
            };
        }
        try {
            const handled = normalizeHandlerResult(await handlers.connectOrg({ alias }));
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runNavigateCli = async (argv: string[]) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: NAVIGATE_HELP, stderr: '', exitCode: 0 };
        }
        const { flags, positionals } = parseCliArgs(argv);
        const app = String(
            ensureSingleValue(getFlagValue(flags, 'app', 'a')) || positionals[0] || ''
        ).trim();
        if (!app) {
            return {
                stdout: '',
                stderr: `Error: Missing app name. Use --app.\n\n${NAVIGATE_HELP}\n`,
                exitCode: 1,
            };
        }
        try {
            const handled = normalizeHandlerResult(await handlers.navigate({ app }));
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runApexTestCli = async (argv: string[], ctx: ShellCommandContext) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: APEX_TEST_HELP, stderr: '', exitCode: 0 };
        }
        const { flags } = parseCliArgs(argv);
        const classNamesFlag = ensureSingleValue(getFlagValue(flags, 'class-names', 'n'));
        const testLevel = String(
            ensureSingleValue(getFlagValue(flags, 'test-level')) || 'RunSpecifiedTests'
        );
        const timeoutFlag = ensureSingleValue(getFlagValue(flags, 'timeout'));
        const timeoutMs = typeof timeoutFlag === 'string' ? parseInt(timeoutFlag, 10) : 60000;
        const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
            | string
            | undefined;

        const classNames =
            typeof classNamesFlag === 'string'
                ? classNamesFlag
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean)
                : [];

        if (classNames.length === 0 && testLevel === 'RunSpecifiedTests') {
            return {
                stdout: '',
                stderr: `Error: --class-names is required when test-level is RunSpecifiedTests.\n\n${APEX_TEST_HELP}\n`,
                exitCode: 1,
            };
        }
        try {
            const handled = normalizeHandlerResult(
                await handlers.runApexTests({ classNames, testLevel, timeoutMs, ctx, targetOrg })
            );
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runDebugLogCli = async (argv: string[], ctx: ShellCommandContext) => {
        if (!argv?.length || argv.includes('--help') || argv.includes('-h')) {
            return { stdout: DEBUG_LOG_HELP, stderr: '', exitCode: 0 };
        }
        const [subcommand, ...rest] = argv;

        if (subcommand === 'enable') {
            const { flags } = parseCliArgs(rest);
            const durationFlag = ensureSingleValue(getFlagValue(flags, 'duration'));
            const durationMinutes =
                typeof durationFlag === 'string' ? parseInt(durationFlag, 10) : 15;
            const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
                | string
                | undefined;
            try {
                const handled = normalizeHandlerResult(
                    await handlers.enableDebugLog({ durationMinutes, targetOrg })
                );
                return {
                    stdout: formatCliOutput(handled.result),
                    stderr: '',
                    exitCode: handled.exitCode,
                };
            } catch (err) {
                return commandError(err instanceof Error ? err.message : String(err));
            }
        }

        if (subcommand === 'list') {
            const { flags } = parseCliArgs(rest);
            const limitFlag = ensureSingleValue(getFlagValue(flags, 'limit'));
            const limit = typeof limitFlag === 'string' ? parseInt(limitFlag, 10) : 25;
            const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
                | string
                | undefined;
            try {
                const handled = normalizeHandlerResult(
                    await handlers.listDebugLogs({ limit, targetOrg })
                );
                return {
                    stdout: formatCliOutput(handled.result),
                    stderr: '',
                    exitCode: handled.exitCode,
                };
            } catch (err) {
                return commandError(err instanceof Error ? err.message : String(err));
            }
        }

        if (subcommand === 'get') {
            const { flags, positionals } = parseCliArgs(rest);
            const logId =
                positionals[0] || String(ensureSingleValue(getFlagValue(flags, 'id')) || '');
            const outputFlag = ensureSingleValue(getFlagValue(flags, 'output'));
            const outputPath = typeof outputFlag === 'string' ? outputFlag : null;
            const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
                | string
                | undefined;
            if (!logId) {
                return {
                    stdout: '',
                    stderr: `Error: Missing log ID.\nUsage: sf debug log get <id>\n`,
                    exitCode: 1,
                };
            }
            try {
                const handled = normalizeHandlerResult(
                    await handlers.getDebugLog({ logId, outputPath, ctx, targetOrg })
                );
                return {
                    stdout: formatCliOutput(handled.result),
                    stderr: '',
                    exitCode: handled.exitCode,
                };
            } catch (err) {
                return commandError(err instanceof Error ? err.message : String(err));
            }
        }

        return {
            stdout: '',
            stderr: `Error: Unknown debug log subcommand "${subcommand}"\n\n${DEBUG_LOG_HELP}\n`,
            exitCode: 1,
        };
    };

    const runLimitsDisplayCli = async (argv: string[]) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: LIMITS_HELP, stderr: '', exitCode: 0 };
        }
        const { flags } = parseCliArgs(argv);
        const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
            | string
            | undefined;
        try {
            const handled = normalizeHandlerResult(await handlers.displayLimits({ targetOrg }));
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runSObjectDescribeCli = async (argv: string[]) => {
        if (argv.includes('--help') || argv.includes('-h')) {
            return { stdout: SOBJECT_HELP, stderr: '', exitCode: 0 };
        }
        const { flags, positionals } = parseCliArgs(argv);
        const objectName = String(
            ensureSingleValue(getFlagValue(flags, 'object')) || positionals[0] || ''
        ).trim();
        const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
            | string
            | undefined;
        if (!objectName) {
            return {
                stdout: '',
                stderr: `Error: Missing SObject name. Use --object.\n\n${SOBJECT_HELP}\n`,
                exitCode: 1,
            };
        }
        try {
            const handled = normalizeHandlerResult(
                await handlers.describeSObject({ objectName, targetOrg })
            );
            return {
                stdout: formatCliOutput(handled.result),
                stderr: '',
                exitCode: handled.exitCode,
            };
        } catch (err) {
            return commandError(err instanceof Error ? err.message : String(err));
        }
    };

    const runMetadataCli = async (argv: string[], ctx: ShellCommandContext) => {
        if (!argv?.length || argv.includes('--help') || argv.includes('-h')) {
            return { stdout: METADATA_HELP, stderr: '', exitCode: 0 };
        }
        const [subcommand, ...rest] = argv;

        if (subcommand === 'list-types') {
            const { flags } = parseCliArgs(rest);
            const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
                | string
                | undefined;
            try {
                const handled = normalizeHandlerResult(
                    await handlers.listMetadataTypes({ targetOrg })
                );
                return {
                    stdout: formatCliOutput(handled.result),
                    stderr: '',
                    exitCode: handled.exitCode,
                };
            } catch (err) {
                return commandError(err instanceof Error ? err.message : String(err));
            }
        }

        if (subcommand === 'list-records') {
            const { flags } = parseCliArgs(rest);
            const metadataTypeFlag = ensureSingleValue(getFlagValue(flags, 'metadata-type', 'm'));
            const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
                | string
                | undefined;
            if (!metadataTypeFlag || typeof metadataTypeFlag !== 'string') {
                return {
                    stdout: '',
                    stderr: `Error: Missing --metadata-type flag.\n\n${METADATA_HELP}\n`,
                    exitCode: 1,
                };
            }
            try {
                const handled = normalizeHandlerResult(
                    await handlers.listMetadataRecords({
                        metadataType: metadataTypeFlag,
                        targetOrg,
                    })
                );
                return {
                    stdout: formatCliOutput(handled.result),
                    stderr: '',
                    exitCode: handled.exitCode,
                };
            } catch (err) {
                return commandError(err instanceof Error ? err.message : String(err));
            }
        }

        if (subcommand === 'deploy') {
            const { flags } = parseCliArgs(rest);
            const fileFlag = ensureSingleValue(getFlagValue(flags, 'file', 'f'));
            const metadataTypeFlag = ensureSingleValue(getFlagValue(flags, 'metadata-type', 'm'));
            const apiNameFlag = ensureSingleValue(getFlagValue(flags, 'api-name'));
            const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
                | string
                | undefined;
            if (!fileFlag || typeof fileFlag !== 'string') {
                return {
                    stdout: '',
                    stderr: `Error: Missing --file flag.\n\n${METADATA_HELP}\n`,
                    exitCode: 1,
                };
            }
            const metadataType = typeof metadataTypeFlag === 'string' ? metadataTypeFlag : null;
            const apiName = typeof apiNameFlag === 'string' ? apiNameFlag : null;
            try {
                const handled = normalizeHandlerResult(
                    await handlers.deployMetadata({
                        filePath: fileFlag,
                        metadataType,
                        apiName,
                        ctx,
                        targetOrg,
                    })
                );
                return {
                    stdout: formatCliOutput(handled.result),
                    stderr: '',
                    exitCode: handled.exitCode,
                };
            } catch (err) {
                return commandError(err instanceof Error ? err.message : String(err));
            }
        }

        if (subcommand === 'retrieve') {
            const { flags } = parseCliArgs(rest);
            const metadataTypeFlag = ensureSingleValue(getFlagValue(flags, 'metadata-type', 'm'));
            const apiNameFlag = ensureSingleValue(getFlagValue(flags, 'api-name'));
            const outputFlag = ensureSingleValue(getFlagValue(flags, 'output'));
            const targetOrg = ensureSingleValue(getFlagValue(flags, 'target-org', 'o', 'u')) as
                | string
                | undefined;
            if (!metadataTypeFlag || typeof metadataTypeFlag !== 'string') {
                return {
                    stdout: '',
                    stderr: `Error: Missing --metadata-type flag.\n\n${METADATA_HELP}\n`,
                    exitCode: 1,
                };
            }
            if (!apiNameFlag || typeof apiNameFlag !== 'string') {
                return {
                    stdout: '',
                    stderr: `Error: Missing --api-name flag.\n\n${METADATA_HELP}\n`,
                    exitCode: 1,
                };
            }
            const outputPath = typeof outputFlag === 'string' ? outputFlag : null;
            try {
                const handled = normalizeHandlerResult(
                    await handlers.retrieveMetadata({
                        metadataType: metadataTypeFlag,
                        apiName: apiNameFlag,
                        outputPath,
                        ctx,
                        targetOrg,
                    })
                );
                return {
                    stdout: formatCliOutput(handled.result),
                    stderr: '',
                    exitCode: handled.exitCode,
                };
            } catch (err) {
                return commandError(err instanceof Error ? err.message : String(err));
            }
        }

        return {
            stdout: '',
            stderr: `Error: Unknown metadata subcommand "${subcommand}"\n\n${METADATA_HELP}\n`,
            exitCode: 1,
        };
    };

    const sfCommand = createCommand('sf', async (argv, ctx) => {
        if (!argv?.length || argv.includes('--help') || argv.includes('-h')) {
            const help = [
                'SF CLI shims:',
                '',
                '  sf apex run',
                '  sf apex test run',
                '  sf data query',
                '  sf api request',
                '  sf org list',
                '  sf org connect',
                '  sf org open',
                '  sf navigate',
                '  sf debug log enable|list|get',
                '  sf limits display',
                '  sf sobject describe',
                '  sf metadata list-types|list-records|deploy|retrieve',
                '',
                'Most commands accept --target-org <alias> to run against a different org.',
                'Use subcommand --help for details.',
                '',
                APEX_HELP,
                '',
                APEX_TEST_HELP,
                '',
                SOQL_HELP,
                '',
                API_HELP,
                '',
                ORG_HELP,
                '',
                NAVIGATE_HELP,
                '',
                DEBUG_LOG_HELP,
                '',
                LIMITS_HELP,
                '',
                SOBJECT_HELP,
                '',
                METADATA_HELP,
            ].join('\n');
            return { stdout: help, stderr: '', exitCode: 0 };
        }
        const [group, action, ...rest] = argv;
        if (group === 'apex' && action === 'run') {
            return runApexCli(rest, ctx);
        }
        if (group === 'apex' && action === 'test') {
            return runApexTestCli(rest, ctx);
        }
        if (group === 'data' && action === 'query') {
            return runSoqlCli(rest, ctx);
        }
        if (group === 'api' && action === 'request') {
            return runApiCli(rest, ctx);
        }
        if (group === 'org' && action === 'list') {
            return runOrgListCli();
        }
        if (group === 'org' && action === 'connect') {
            return runOrgConnectCli(rest);
        }
        if (group === 'org' && action === 'open') {
            return runOrgOpenCli(rest);
        }
        if (group === 'navigate') {
            return runNavigateCli([action, ...rest].filter(Boolean));
        }
        if (group === 'debug' && action === 'log') {
            return runDebugLogCli(rest, ctx);
        }
        if (group === 'limits' && action === 'display') {
            return runLimitsDisplayCli(rest);
        }
        if (group === 'sobject' && action === 'describe') {
            return runSObjectDescribeCli(rest);
        }
        if (group === 'metadata') {
            return runMetadataCli([action, ...rest].filter(Boolean), ctx);
        }
        return {
            stdout: '',
            stderr: `Error: Unknown sf command "${argv.join(' ')}"\n`,
            exitCode: 1,
        };
    });

    shell.registerCommand(sfCommand);
}
