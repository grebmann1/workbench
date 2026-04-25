#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCliArgs = parseCliArgs;
exports.resolveElectronBinary = resolveElectronBinary;
exports.main = main;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const node_path_1 = __importDefault(require("node:path"));
const launchIntent_1 = require("../main/launchIntent");
const desktopSalesforceCliGrammar_1 = require("./desktopSalesforceCliGrammar");
const DEFAULT_API_URL = 'http://127.0.0.1:12346';
const DEFAULT_TIMEOUT_MS = 30_000;
function printHelp() {
    process.stdout.write(`workbench-desktop\n\n`);
    process.stdout.write(`Usage:\n`);
    process.stdout.write(`  workbench-desktop\n`);
    process.stdout.write(`  workbench-desktop --org <alias>\n`);
    process.stdout.write(`  workbench-desktop open org --target-org <alias>\n`);
    process.stdout.write(`  workbench-desktop open soql --target-org <alias> --query "<soql>"\n`);
    process.stdout.write(`  workbench-desktop sf data query --target-org <alias> --query "<soql>"\n`);
}
function readFlag(argv, ...names) {
    for (const name of names) {
        const inline = argv.find(argument => argument.startsWith(`${name}=`));
        if (inline) {
            return inline.slice(name.length + 1);
        }
        const index = argv.indexOf(name);
        if (index >= 0) {
            return argv[index + 1] || null;
        }
    }
    return null;
}
function hasFlag(argv, ...names) {
    return names.some(name => argv.includes(name));
}
function getOptions(argv) {
    const timeout = Number(readFlag(argv, '--timeout') || DEFAULT_TIMEOUT_MS);
    return {
        apiUrl: readFlag(argv, '--api-url') || process.env.WORKBENCH_DESKTOP_API_URL || DEFAULT_API_URL,
        json: hasFlag(argv, '--json'),
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
        wait: !hasFlag(argv, '--no-wait'),
    };
}
function isFileBackedOrgSource(org) {
    return Boolean(org) && typeof org === 'object' && org.kind === 'sfdxAuthUrlFile';
}
function isStdinBackedOrgSource(org) {
    return Boolean(org) && typeof org === 'object' && org.kind === 'sfdxAuthUrlStdin';
}
function resolveCliOrgSource(org) {
    if (isFileBackedOrgSource(org)) {
        return {
            kind: 'sfdxAuthUrl',
            alias: org.alias,
            sfdxAuthUrl: node_fs_1.default.readFileSync(org.path, 'utf8').trim(),
        };
    }
    if (isStdinBackedOrgSource(org)) {
        return {
            kind: 'sfdxAuthUrl',
            alias: org.alias,
            sfdxAuthUrl: node_fs_1.default.readFileSync(0, 'utf8').trim(),
        };
    }
    return org;
}
function resolveCliCommand(command) {
    if (command.type === 'openApp') {
        return command;
    }
    if (command.type === 'openOrg' || command.type === 'openPage' || command.type === 'execute') {
        return {
            ...command,
            org: resolveCliOrgSource(command.org),
        };
    }
    return command;
}
function getAliasOrgSource(argv) {
    const alias = readFlag(argv, '--target-org', '--org', '-o', '-u');
    if (!alias) {
        throw new Error('Missing target org. Use --target-org <alias>.');
    }
    return { kind: 'alias', alias };
}
function getOpenOrgSource(argv) {
    const sfdxUrlFile = readFlag(argv, '--sfdx-url-file');
    const alias = readFlag(argv, '--alias', '--target-org', '--org', '-o', '-u');
    if (sfdxUrlFile) {
        if (!alias) {
            throw new Error('Missing alias for --sfdx-url-file.');
        }
        return { kind: 'sfdxAuthUrlFile', alias, path: sfdxUrlFile };
    }
    if (hasFlag(argv, '--sfdx-url-stdin')) {
        if (!alias) {
            throw new Error('Missing alias for --sfdx-url-stdin.');
        }
        return { kind: 'sfdxAuthUrlStdin', alias };
    }
    return getAliasOrgSource(argv);
}
function parseCliArgs(argv) {
    if (argv.includes('--help') || argv.includes('-h')) {
        printHelp();
        process.exit(0);
    }
    const orgFlagIndex = argv.indexOf('--org');
    if (orgFlagIndex === 0) {
        const orgAlias = argv[orgFlagIndex + 1];
        if (!orgAlias) {
            process.stderr.write('Missing value for --org\n');
            process.exit(1);
        }
        return {
            command: {
                v: 2,
                type: 'openOrg',
                org: { kind: 'alias', alias: orgAlias },
            },
            options: getOptions(argv),
        };
    }
    const [group, action, ...rest] = argv.filter(argument => !['--json'].includes(argument));
    if (group === 'open') {
        if (!action || action === 'app') {
            return { command: { v: 2, type: 'openApp' }, options: getOptions(argv) };
        }
        if (action === 'org') {
            return {
                command: { v: 2, type: 'openOrg', org: getOpenOrgSource(rest) },
                options: getOptions(argv),
            };
        }
        const org = getAliasOrgSource(rest);
        const query = readFlag(rest, '--query', '-q');
        const state = query ? { query } : undefined;
        return {
            command: {
                v: 2,
                type: 'openPage',
                org,
                route: {
                    applicationName: action,
                    ...(state ? { state } : {}),
                },
            },
            options: getOptions(argv),
        };
    }
    if (group === 'sf' && action === 'data' && rest[0] === 'query') {
        const commandArgs = [action, ...rest];
        return {
            command: (0, desktopSalesforceCliGrammar_1.compileSalesforceCliCommand)(commandArgs, {
                json: hasFlag(argv, '--json'),
                org: getAliasOrgSource(commandArgs),
            }),
            options: getOptions(argv),
        };
    }
    if (group === 'sf') {
        return {
            command: (0, desktopSalesforceCliGrammar_1.compileSalesforceCliCommand)([action, ...rest].filter(Boolean), {
                json: hasFlag(argv, '--json'),
                org: getAliasOrgSource(rest),
            }),
            options: getOptions(argv),
        };
    }
    return { command: { v: 2, type: 'openApp' }, options: getOptions(argv) };
}
function resolveElectronBinary(appPath) {
    const candidatePaths = [
        node_path_1.default.resolve(appPath, 'node_modules/.bin/electron'),
        node_path_1.default.resolve(appPath, '../../node_modules/.bin/electron'),
    ];
    const electronBinary = candidatePaths.find(candidatePath => node_fs_1.default.existsSync(candidatePath));
    if (!electronBinary) {
        throw new Error('Electron was not found. Run `npm --prefix packages/desktop install` or the root install/bootstrap workflow first.');
    }
    return electronBinary;
}
async function postJson(apiUrl, route, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const url = new URL(route, apiUrl);
    const body = payload ? JSON.stringify(payload) : undefined;
    const transport = url.protocol === 'https:' ? node_https_1.default : node_http_1.default;
    return new Promise((resolve, reject) => {
        const request = transport.request(url, {
            headers: {
                ...(body ? { 'Content-Length': Buffer.byteLength(body), 'Content-Type': 'application/json' } : {}),
            },
            method: body ? 'POST' : 'GET',
            timeout: timeoutMs,
        }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(Buffer.from(chunk)));
            response.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                const parsed = raw ? JSON.parse(raw) : {};
                if ((response.statusCode || 500) >= 400) {
                    reject(new Error(String(parsed.message || raw)));
                    return;
                }
                resolve(parsed);
            });
        });
        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy(new Error(`Timed out waiting for ${url.toString()}`));
        });
        if (body) {
            request.write(body);
        }
        request.end();
    });
}
async function isAutomationAvailable(apiUrl, timeoutMs) {
    try {
        const health = (await postJson(apiUrl, '/health', undefined, timeoutMs));
        return health.commandRouter === true;
    }
    catch {
        return false;
    }
}
async function waitForAutomation(apiUrl, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (await isAutomationAvailable(apiUrl, 1_000)) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
}
function printCommandResult(result, json) {
    if (result &&
        typeof result === 'object' &&
        'error' in result &&
        result.error) {
        const error = result.error;
        throw new Error(error?.message || 'Workbench Desktop command failed.');
    }
    if (json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    if (typeof result === 'string') {
        process.stdout.write(`${result}\n`);
        return;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
async function main() {
    const invocation = parseCliArgs(process.argv.slice(2));
    const appPath = node_path_1.default.resolve(__dirname, '../..');
    const electronBinary = resolveElectronBinary(appPath);
    const command = resolveCliCommand(invocation.command);
    const commandContainsSecret = (command.type === 'openOrg' || command.type === 'openPage' || command.type === 'execute') &&
        command.org.kind === 'sfdxAuthUrl';
    if (!(await isAutomationAvailable(invocation.options.apiUrl, 1_000))) {
        if (!invocation.options.wait && commandContainsSecret) {
            throw new Error('--no-wait cannot be used with sfdxAuthUrl input unless Workbench Desktop is already running.');
        }
        const launchCommand = commandContainsSecret
            ? { v: 2, type: 'openApp' }
            : command;
        const child = (0, node_child_process_1.spawn)(electronBinary, [appPath, (0, launchIntent_1.serializeLaunchIntent)(launchCommand)], {
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
    }
    if (!invocation.options.wait) {
        if (await isAutomationAvailable(invocation.options.apiUrl, 1_000)) {
            await postJson(invocation.options.apiUrl, '/command/execute', command, invocation.options.timeoutMs);
        }
        return;
    }
    const isReady = await waitForAutomation(invocation.options.apiUrl, invocation.options.timeoutMs);
    if (!isReady) {
        throw new Error('Workbench Desktop did not become ready before the timeout.');
    }
    const result = await postJson(invocation.options.apiUrl, '/command/execute', command, invocation.options.timeoutMs);
    printCommandResult(result, invocation.options.json);
}
if (require.main === module) {
    void main().catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
