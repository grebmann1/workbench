import type { DesktopCommand, DesktopOrgSource } from '../main/desktopCommand';

type SalesforceCliOptions = {
    json: boolean;
    org: DesktopOrgSource;
};

function readFlag(argv: string[], ...names: string[]): string | null {
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

function hasFlag(argv: string[], ...names: string[]): boolean {
    return names.some(name => argv.includes(name));
}

export function compileSalesforceCliCommand(
    argv: string[],
    { json, org }: SalesforceCliOptions
): DesktopCommand {
    const [group, action, ...rest] = argv;

    if (group === 'data' && action === 'query') {
        const query = readFlag(rest, '--query', '-q');
        if (!query) {
            throw new Error('Missing SOQL query. Use --query "<soql>".');
        }

        return {
            v: 2,
            type: 'execute',
            org,
            action: {
                kind: 'soqlQuery',
                query,
                includeDeletedRecords: hasFlag(rest, '--all-rows'),
                useToolingApi: hasFlag(rest, '--tooling'),
            },
            output: json ? 'json' : 'text',
        };
    }

    if (group === 'navigate') {
        const applicationName =
            readFlag([action, ...rest].filter(Boolean), '--app', '-a') || action;
        if (!applicationName) {
            throw new Error('Missing app name. Use sf navigate --app <app>.');
        }

        return {
            v: 2,
            type: 'openPage',
            org,
            route: {
                applicationName,
            },
        };
    }

    if (group === 'apex' && action === 'run') {
        const apexCode = readFlag(rest, '--apex-code', '-c');
        if (!apexCode) {
            throw new Error('Missing Apex code. Use --apex-code "<code>".');
        }

        return {
            v: 2,
            type: 'execute',
            org,
            action: {
                kind: 'apexRun',
                apexCode,
                shouldOpenUi: !hasFlag(rest, '--no-ui'),
            },
            output: json ? 'json' : 'text',
        };
    }

    if (group === 'api' && action === 'request') {
        const endpoint = readFlag(rest, '--url', '-u');
        if (!endpoint) {
            throw new Error('Missing API endpoint. Use --url "<endpoint>".');
        }

        return {
            v: 2,
            type: 'execute',
            org,
            action: {
                kind: 'apiRequest',
                body: readFlag(rest, '--body') || undefined,
                endpoint,
                headerText: rest
                    .map((part, index) =>
                        ['--header', '-H'].includes(part) ? rest[index + 1] : null
                    )
                    .filter((part): part is string => Boolean(part))
                    .join('\n'),
                method: readFlag(rest, '--method', '-X') || 'GET',
            },
            output: json ? 'json' : 'text',
        };
    }

    throw new Error(`Unsupported sf command: ${argv.join(' ')}`);
}
