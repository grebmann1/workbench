export type JsCommandResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};

export type JsCodeLoadContext = {
    cwd: string;
    stdin?: string;
    fs: {
        resolvePath: (cwd: string, path: string) => string;
        readFile: (path: string, encoding?: string) => Promise<string>;
    };
};

export type JsArgsParseResult =
    | { timeoutMs: number | undefined; argsWithoutFlags: string[]; error: null }
    | { timeoutMs: undefined; argsWithoutFlags: []; error: JsCommandResult };

export type JsCodeLoadResult =
    | { code: string; error: null }
    | { code: null; error: JsCommandResult };

export function parseJsArgs(argv: string[]): JsArgsParseResult {
    let timeoutMs: number | undefined;
    const argsWithoutFlags: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--timeout' && i + 1 < argv.length) {
            timeoutMs = parseInt(argv[i + 1], 10);
            if (Number.isNaN(timeoutMs)) {
                return {
                    timeoutMs: undefined,
                    argsWithoutFlags: [],
                    error: {
                        stdout: '',
                        stderr: 'Error: --timeout requires a numeric value\n',
                        exitCode: 1,
                    },
                };
            }
            i += 1;
            continue;
        }
        argsWithoutFlags.push(argv[i]);
    }

    return { timeoutMs, argsWithoutFlags, error: null };
}

export async function loadJsCode(
    argsWithoutFlags: string[],
    ctx: JsCodeLoadContext
): Promise<JsCodeLoadResult> {
    const inlineIndex = argsWithoutFlags.indexOf('-e');
    if (inlineIndex !== -1) {
        const inlineCode = argsWithoutFlags.slice(inlineIndex + 1).join(' ');
        const code = inlineCode || ctx.stdin || '';
        if (!code) {
            return {
                code: null,
                error: { stdout: '', stderr: "Usage: js -e '<code>'\n", exitCode: 1 },
            };
        }
        return { code, error: null };
    }

    const file = argsWithoutFlags[0];
    if (!file) {
        const stdinCode = ctx.stdin || '';
        if (stdinCode.trim()) {
            return { code: stdinCode, error: null };
        }
        return {
            code: null,
            error: {
                stdout: '',
                stderr:
                    "Usage: js -e '<code>' or js <file> or js <<'EOF'\n" +
                    'Run js --help for full documentation.\n',
                exitCode: 1,
            },
        };
    }

    const resolvedPath = ctx.fs.resolvePath(ctx.cwd, file);
    try {
        const code = await ctx.fs.readFile(resolvedPath, 'utf-8');
        return { code, error: null };
    } catch {
        return {
            code: null,
            error: {
                stdout: '',
                stderr: `Error: Cannot read file: ${resolvedPath}\n`,
                exitCode: 1,
            },
        };
    }
}
