import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'out');

function isoStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

export function createJsonlReporter(mode) {
    mkdirSync(OUT_DIR, { recursive: true });
    const suffix = mode ? `-${mode}` : '';
    const path = join(OUT_DIR, `${isoStamp()}${suffix}.jsonl`);
    const stream = createWriteStream(path, { flags: 'a' });

    const write = row => stream.write(JSON.stringify(row) + '\n');

    return {
        path,
        recordChunk(scenario, chunkIndex, elapsedMs, chunk) {
            const scrubbed = scrubSensitive(chunk);
            write({
                kind: 'chunk',
                scenario,
                chunkIndex,
                elapsedMs,
                type: chunk?.type ?? 'unknown',
                payload: safeJson(scrubbed),
            });
        },
        recordSummary(scenario, summary) {
            const scrubbed = scrubSensitive(summary) ?? summary;
            write({
                kind: 'summary',
                scenario,
                ...scrubbed,
            });
        },
        recordError(scenario, error) {
            write({
                kind: 'error',
                scenario,
                error: serializeError(error),
            });
        },
        async close() {
            await new Promise(resolve => stream.end(resolve));
        },
    };
}

const SCRUB_PATTERNS = [
    [/"authorization"\s*:\s*"[^"]*"/gi, '"authorization":"***REDACTED***"'],
    [/sk-[A-Za-z0-9_\-]{8,}/g, '***REDACTED***'],
    [/([?&](?:api[_-]?key|access[_-]?token|key)=)[^&"\s]+/gi, '$1***REDACTED***'],
];

function scrubSensitive(value) {
    const json = JSON.stringify(value);
    if (json == null) return value;
    let scrubbed = json;
    for (const [re, rep] of SCRUB_PATTERNS) scrubbed = scrubbed.replace(re, rep);
    return scrubbed === json ? value : JSON.parse(scrubbed);
}

// Exported for tests only. Do not import from production code.
export const __scrubSensitiveForTests = scrubSensitive;

function safeJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return { _unserializable: String(value) };
    }
}

function serializeError(error) {
    if (!error) return { message: 'unknown error' };
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack,
            cause: error.cause ? serializeError(error.cause) : undefined,
        };
    }
    return { message: String(error) };
}
