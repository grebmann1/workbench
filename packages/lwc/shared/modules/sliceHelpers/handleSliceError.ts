/**
 * Shared slice error helper for `createAsyncThunk` thunks.
 *
 * The Agentforce app (and likely future apps) want a single, consistent
 * pattern for surfacing thunk failures:
 *
 *   1. Classify the error (SOQL/JSForce error code → user-friendly bucket).
 *   2. Surface ONE toast / footer entry via the host's `reportError`.
 *   3. Let `createAsyncThunk` reject with a human-readable message so the
 *      slice's `.rejected` reducer can stamp `state.error` for UI use.
 *
 * Layering note
 * -------------
 * This module lives under `packages/lwc/shared/modules/*` which builds with
 * a stricter tsconfig that does NOT see `host-api/store`. To keep that
 * boundary intact while still funneling errors into the host's footer, the
 * helper holds an injectable reporter slot. App-level bootstraps (or each
 * slice file's top-level imports) call `setSliceErrorReporter(reportError)`
 * once. Tests replace it with a spy.
 *
 * Dedupe
 * ------
 * To prevent flapping during interaction-step playback (where the same
 * fetch can transiently fail many times in 250 ms), the helper deduplicates
 * `reportError` calls keyed on `(scope, classifiedMessage)` with a 250 ms
 * TTL. The dedupe table is module-local; tests can reset via
 * `_clearDedupeForTesting`.
 */

export type SliceErrorCode =
    | 'permission_denied'
    | 'entity_unavailable'
    | 'service_error'
    | 'network'
    | 'unknown';

export interface ClassifiedError {
    code: SliceErrorCode;
    message: string;
    raw: unknown;
}

/** Reporter contract — matches `host-api/store#reportError` shape. */
export type SliceErrorReporter = (
    err: unknown,
    options?: { source?: string; details?: string }
) => void;

const DEFAULT_REPORTER: SliceErrorReporter = () => {
    /* no-op until the host wires `reportError` in */
};

let reporter: SliceErrorReporter = DEFAULT_REPORTER;

/**
 * Wire the host's `reportError` into the shared helper. Call once during app
 * bootstrap (or at slice module load time). Idempotent.
 */
export function setSliceErrorReporter(fn: SliceErrorReporter): void {
    reporter = typeof fn === 'function' ? fn : DEFAULT_REPORTER;
}

/* -------------------------------------------------------------------------- */
/*  Classification                                                             */
/* -------------------------------------------------------------------------- */

const PERMISSION_CODES = new Set(['INSUFFICIENT_ACCESS_OR_READONLY', 'INSUFFICIENT_ACCESS']);
const ENTITY_CODES = new Set(['INVALID_TYPE', 'NOT_FOUND', 'INVALID_FIELD']);

function readString(obj: unknown, key: string): string | null {
    if (obj && typeof obj === 'object' && key in (obj as Record<string, unknown>)) {
        const v = (obj as Record<string, unknown>)[key];
        if (typeof v === 'string') return v;
    }
    return null;
}

function readNumber(obj: unknown, key: string): number | null {
    if (obj && typeof obj === 'object' && key in (obj as Record<string, unknown>)) {
        const v = (obj as Record<string, unknown>)[key];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
}

/**
 * Pure helper: classify a SOQL / JSForce / network error into a user-friendly
 * `{ code, message, raw }` triple.
 *
 * Recognised inputs:
 *   - `{ errorCode: 'INSUFFICIENT_ACCESS_OR_READONLY' }`  → permission_denied
 *   - `{ errorCode: 'INVALID_TYPE' }`                     → entity_unavailable
 *   - `{ status: 5xx }`                                   → service_error
 *   - `Error` with status 5xx in `.message`               → service_error
 *   - Anything else                                       → unknown (preserves message)
 */
export function classifyError(err: unknown): ClassifiedError {
    // Nullish / primitive
    if (err == null) {
        return { code: 'unknown', message: 'Unknown error', raw: err };
    }

    if (err instanceof Error) {
        const errorCode = readString(err, 'errorCode');
        const status = readNumber(err, 'status');
        if (errorCode && PERMISSION_CODES.has(errorCode)) {
            return {
                code: 'permission_denied',
                message: 'Permission denied — your user lacks access to this entity or field.',
                raw: err,
            };
        }
        if (errorCode && ENTITY_CODES.has(errorCode)) {
            return {
                code: 'entity_unavailable',
                message: 'This entity is not available in the connected org.',
                raw: err,
            };
        }
        if (status != null && status >= 500 && status < 600) {
            return {
                code: 'service_error',
                message: `Salesforce service error (HTTP ${status}). Please retry shortly.`,
                raw: err,
            };
        }
        return { code: 'unknown', message: err.message || 'Unknown error', raw: err };
    }

    if (typeof err === 'string') {
        return { code: 'unknown', message: err, raw: err };
    }

    if (typeof err === 'object') {
        const errorCode = readString(err, 'errorCode');
        const status = readNumber(err, 'status');
        const message = readString(err, 'message');

        if (errorCode && PERMISSION_CODES.has(errorCode)) {
            return {
                code: 'permission_denied',
                message: 'Permission denied — your user lacks access to this entity or field.',
                raw: err,
            };
        }
        if (errorCode && ENTITY_CODES.has(errorCode)) {
            return {
                code: 'entity_unavailable',
                message: 'This entity is not available in the connected org.',
                raw: err,
            };
        }
        if (status != null && status >= 500 && status < 600) {
            return {
                code: 'service_error',
                message: `Salesforce service error (HTTP ${status}). Please retry shortly.`,
                raw: err,
            };
        }
        return { code: 'unknown', message: message || 'Unknown error', raw: err };
    }

    return { code: 'unknown', message: String(err), raw: err };
}

/* -------------------------------------------------------------------------- */
/*  Dedupe (250 ms TTL, keyed on `scope|message`)                              */
/* -------------------------------------------------------------------------- */

const DEDUPE_TTL_MS = 250;
const dedupe = new Map<string, number>();

function shouldReport(scope: string, message: string, now: number): boolean {
    const key = `${scope}::${message}`;
    const last = dedupe.get(key);
    if (last != null && now - last < DEDUPE_TTL_MS) {
        return false;
    }
    dedupe.set(key, now);
    // Bound the map: prune entries older than the TTL on every check.
    if (dedupe.size > 32) {
        for (const [k, t] of dedupe) {
            if (now - t >= DEDUPE_TTL_MS) dedupe.delete(k);
        }
    }
    return true;
}

/** Test-only: clear the dedupe table between cases. */
export function _clearDedupeForTesting(): void {
    dedupe.clear();
    reporter = DEFAULT_REPORTER;
}

/* -------------------------------------------------------------------------- */
/*  Main entrypoint                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Classify, report (at most once per 250 ms per `scope|message`), and rethrow
 * a thunk error so `createAsyncThunk`'s rejected handler runs with a clean
 * human-readable message in `action.error.message`.
 *
 * @param scope `source` field for the host error footer (e.g. `'agentforce'`).
 * @param err   The original caught error.
 * @returns Never — always throws.
 */
export function handleSliceError(scope: string, err: unknown): never {
    const classified = classifyError(err);
    if (shouldReport(scope, classified.message, Date.now())) {
        reporter(classified.raw, { source: scope });
    }
    // Throw a fresh Error so the thunk's `action.error.message` is the
    // classified text — not the raw SOQL fault string.
    throw new Error(classified.message);
}
