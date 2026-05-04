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
            write({
                kind: 'chunk',
                scenario,
                chunkIndex,
                elapsedMs,
                type: chunk?.type ?? 'unknown',
                payload: safeJson(chunk),
            });
        },
        recordSummary(scenario, summary) {
            write({
                kind: 'summary',
                scenario,
                ...summary,
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
