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
        // Accept either `--url <endpoint>` (legacy style) or `<METHOD> <URL>`
        // as the first two positional args (Postman/curl-like). Headers are
        // specified via repeated `-H key:value` / `--header key:value`.
        let method = readFlag(rest, '--method', '-X') || 'GET';
        let endpoint = readFlag(rest, '--url', '-u');
        if (!endpoint) {
            // Positional parse: drop recognised flag pairs, keep the rest.
            const knownFlags = new Set([
                '--method',
                '-X',
                '--url',
                '-u',
                '--body',
                '--header',
                '-H',
                '--target-org',
                '--org',
                '-o',
                '-u',
                '--json',
                '--no-wait',
            ]);
            const positionals: string[] = [];
            for (let i = 0; i < rest.length; i++) {
                const token = rest[i];
                if (token.startsWith('--') || /^-[A-Za-z]$/.test(token)) {
                    // consume this flag + its value when it looks like a value-bearing flag
                    if (knownFlags.has(token) && i + 1 < rest.length) i++;
                    continue;
                }
                positionals.push(token);
            }
            if (positionals.length >= 2) {
                method = positionals[0].toUpperCase();
                endpoint = positionals[1];
            } else if (positionals.length === 1) {
                endpoint = positionals[0];
            }
        }
        if (!endpoint) {
            throw new Error(
                'Missing API endpoint. Use --url "<endpoint>" or positional "<METHOD> <URL>".'
            );
        }

        let body = readFlag(rest, '--body');
        // Support `--body @file` — read the file content.
        if (body && body.startsWith('@')) {
            try {
                // Lazy require to keep this module usable in Node with fs and in ts-only contexts.
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const fs = require('node:fs');
                body = fs.readFileSync(body.slice(1), 'utf8');
            } catch (err) {
                throw new Error(
                    `Could not read --body file: ${(err as Error).message}`
                );
            }
        }

        return {
            v: 2,
            type: 'execute',
            org,
            action: {
                kind: 'apiRequest',
                body: body || undefined,
                endpoint,
                headerText: rest
                    .map((part, index) =>
                        ['--header', '-H'].includes(part) ? rest[index + 1] : null
                    )
                    .filter((part): part is string => Boolean(part))
                    .join('\n'),
                method,
            },
            output: json ? 'json' : 'text',
        };
    }

    throw new Error(`Unsupported sf command: ${argv.join(' ')}`);
}
