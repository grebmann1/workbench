// soqlQuery.ts
// Module: shared/soqlQuery/soqlQuery
//
// Shared, SOQLi-safe helper around `connector.conn.query` /
// `connector.conn.tooling.query`. Replaces three duplicated copies of the
// same helper that previously lived in:
//   - packages/lwc/applications/agentforce/slices/agents.ts
//   - packages/lwc/applications/agentforce/slices/debugger.ts
//   - packages/lwc/main/agent/tools/modules/agentforceTools.ts
//
// Defaults are intentionally conservative:
//  - `mode` defaults to `'tooling'` (the most common Workbench use today).
//  - `paging` defaults to `{ mode: 'first-page', cap: 200 }`. The historical
//    `auto-fetch maxFetch: 10000` (or 100000) default was a foot-gun: any
//    SOQL without `LIMIT` would silently page the entire org. This helper
//    requires callers to explicitly opt into auto-fetch AND requires the
//    SOQL itself to contain a `LIMIT` token, throwing in dev if it doesn't.
//
// SOQLi safety:
//  - `asSalesforceId` brands a string as a validated 15- or 18-char ID. Use
//    at slice/thunk boundaries on user-supplied or routing-derived ID params.
//  - `escapeSoqlLiteral` escapes single quotes and backslashes and rejects
//    embedded newlines (which jsforce passes straight through to the wire).
//    Use for any non-ID user-supplied string going into a SOQL string literal.

import type {
    ConnectorLike,
    JsforceConnection,
    JsforceQueryExecution,
    JsforceToolingApi,
} from 'shared/types';

/* -------------------------------------------------------------------------- */
/*  Branded SalesforceId                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A 15- or 18-char Salesforce record ID that has passed shape validation.
 *
 * The brand is purely a compile-time marker — at runtime it is a plain string.
 * Construct via {@link asSalesforceId} so the validation actually runs.
 */
export type SalesforceId = string & { __brand: 'SalesforceId' };

const SF_ID_PATTERN = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;

/**
 * Validates and brands a Salesforce ID. Throws if `s` is not a 15- or 18-char
 * alphanumeric value.
 */
export function asSalesforceId(s: string): SalesforceId {
    if (typeof s !== 'string' || !SF_ID_PATTERN.test(s)) {
        throw new Error(`Invalid Salesforce Id: ${JSON.stringify(s)}`);
    }
    return s as SalesforceId;
}

/* -------------------------------------------------------------------------- */
/*  SOQL string-literal escaping                                               */
/* -------------------------------------------------------------------------- */

/**
 * Escapes a value for use inside a SOQL string literal.
 *
 *  - Rejects values containing newlines / carriage returns (jsforce sends the
 *    raw bytes; an embedded `\n` is both a syntax error and a SOQL-injection
 *    vector via comment-style parsers downstream).
 *  - Escapes backslashes as `\\` and single quotes as `\'`. This matches the
 *    SOQL literal escape grammar documented in
 *    `salesforce.com/.../api_chatter/sforce_api_calls_soql_select_chatter.htm`.
 *
 * Returns the escaped value WITHOUT surrounding quotes — callers wrap:
 *   `WHERE Foo = '${escapeSoqlLiteral(value)}'`
 */
export function escapeSoqlLiteral(s: string): string {
    if (typeof s !== 'string') {
        throw new Error(`escapeSoqlLiteral expected a string, got ${typeof s}`);
    }
    if (s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
        throw new Error('escapeSoqlLiteral: value contains a newline; reject upstream.');
    }
    // Escape backslashes first so the subsequent quote-escape doesn't double-escape.
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/* -------------------------------------------------------------------------- */
/*  Paging policy + main entrypoint                                            */
/* -------------------------------------------------------------------------- */

export type Paging = { mode: 'first-page'; cap: number } | { mode: 'auto-fetch'; cap: number };

export interface SoqlOptions {
    /** Defaults to `'tooling'`. */
    mode?: 'tooling' | 'data';
    /** Defaults to `{ mode: 'first-page', cap: 200 }`. */
    paging?: Paging;
    /** Optional id used by SWR-style in-flight dedupe (consumed by F2 later). */
    requestId?: string;
}

const DEFAULT_PAGING: Paging = { mode: 'first-page', cap: 200 };
const LIMIT_TOKEN = /\bLIMIT\b/i;

function isProduction(): boolean {
    // `process` is not always defined in the browser; guard it.
    try {
        return (
            typeof process !== 'undefined' &&
            typeof process.env !== 'undefined' &&
            process.env.NODE_ENV === 'production'
        );
    } catch {
        return false;
    }
}

function getQueryApi(
    connector: ConnectorLike,
    mode: 'tooling' | 'data'
): {
    query: <T>(soql: string) => JsforceQueryExecution<T>;
} {
    if (!connector || typeof connector !== 'object') {
        throw new Error('runSoqlQuery: connector is missing or invalid.');
    }
    const conn = connector.conn as JsforceConnection | null | undefined;
    if (!conn) {
        throw new Error('runSoqlQuery: connector.conn is missing — no active org connection.');
    }
    if (mode === 'tooling') {
        const tooling = conn.tooling as JsforceToolingApi | undefined;
        if (!tooling || typeof tooling.query !== 'function') {
            throw new Error('runSoqlQuery: Tooling API is not available on this connection.');
        }
        return {
            query: <T>(soql: string) =>
                tooling.query<T>(soql) as unknown as JsforceQueryExecution<T>,
        };
    }
    if (typeof conn.query !== 'function') {
        throw new Error('runSoqlQuery: Data API is not available on this connection.');
    }
    return {
        query: <T>(soql: string) =>
            (conn.query as <U>(soql: string) => JsforceQueryExecution<U>)<T>(
                soql
            ) as unknown as JsforceQueryExecution<T>,
    };
}

/**
 * Run a SOQL query with safe defaults.
 *
 * - Default paging is `first-page` with a 200-record cap. Callers must
 *   explicitly opt into `auto-fetch` paging and the SOQL must include a
 *   `LIMIT` clause, otherwise this throws in dev / warns in prod.
 * - Returns the records array. On error, throws — the caller (slice / thunk /
 *   tool) decides whether to swallow into `[]` or surface the error.
 */
export async function runSoqlQuery<T>(
    connector: ConnectorLike,
    soql: string,
    opts?: SoqlOptions
): Promise<T[]> {
    if (typeof soql !== 'string' || soql.trim() === '') {
        throw new Error('runSoqlQuery: soql must be a non-empty string.');
    }
    const mode = opts?.mode ?? 'tooling';
    const paging = opts?.paging ?? DEFAULT_PAGING;

    if (paging.mode === 'auto-fetch' && !LIMIT_TOKEN.test(soql)) {
        const message =
            'runSoqlQuery: auto-fetch paging requires the SOQL to contain a LIMIT clause ' +
            'to avoid unbounded org-wide pagination.';
        if (!isProduction()) {
            throw new Error(message);
        }
        // In production, we degrade to a console warning rather than crashing
        // the user's session — the caller already opted in.
        // eslint-disable-next-line no-console
        console.warn(message, { soql });
    }

    const api = getQueryApi(connector, mode);
    const queryExec = api.query<T>(soql);
    const runOptions = {
        responseTarget: 'Records' as const,
        autoFetch: paging.mode === 'auto-fetch',
        maxFetch: paging.cap,
    };
    const records = await queryExec.run(runOptions);
    return (records as T[] | null) ?? [];
}
