/**
 * Sequential API-request runner ("chain"). Pure & side-effect-free — the
 * caller passes an executor so the same module drives the app runner, the
 * agent tool, and the CLI.
 */

import type { ExecuteApiResult, ExecuteApiInput } from './api';

export type ChainAssertion =
    | { status: number | number[] }
    | { jsonPath: string; equals: unknown }
    | { jsonPath: string; exists: true }
    | { contains: string }
    | { headerPresent: string };

export type ChainExtraction = {
    /** JSONPath-ish expression on the response body (`$.foo.bar[0]`). */
    from: string;
    /** Name of the variable to write the extracted value into. */
    as: string;
};

export type ChainStep = {
    id: string;
    name?: string;
    /** Same shape as {@link ExecuteApiInput} minus the runtime bits. */
    request: Pick<ExecuteApiInput, 'method' | 'url' | 'headers' | 'body'>;
    extract?: ChainExtraction[];
    assert?: ChainAssertion[];
    /** If true, a previous-step failure stops the run. Default: true. */
    bailOnFailure?: boolean;
};

export type ChainStepResult = {
    stepId: string;
    status: 'pass' | 'fail' | 'skipped' | 'error';
    response?: ExecuteApiResult;
    assertions: Array<{ assertion: ChainAssertion; ok: boolean; reason?: string }>;
    extractedVariables: Record<string, unknown>;
    error?: string;
};

export type ChainRunResult = {
    steps: ChainStepResult[];
    variables: Record<string, unknown>;
    startedAt: number;
    finishedAt: number;
    ok: boolean;
};

export type ChainExecutor = (
    input: ExecuteApiInput,
    variables: Record<string, unknown>
) => Promise<ExecuteApiResult>;

/* -------------------------------------------------------------------------- */
/*  Minimal JSONPath (subset of RFC 9535)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Supports `$`, `.foo`, `['foo bar']`, `[N]` including negative indices.
 * Deliberately *not* a full JSONPath implementation — just enough for the
 * common extraction cases seen in API flows.
 */
export const resolveJsonPath = (root: unknown, path: string): unknown => {
    if (!path || path === '$') return root;
    let cursor: unknown = root;
    let i = path.startsWith('$') ? 1 : 0;
    while (i < path.length) {
        const ch = path[i];
        if (ch === '.') {
            i++;
            let end = i;
            while (end < path.length && path[end] !== '.' && path[end] !== '[') end++;
            const key = path.slice(i, end);
            if (cursor == null || typeof cursor !== 'object')
                return undefined;
            cursor = (cursor as Record<string, unknown>)[key];
            i = end;
        } else if (ch === '[') {
            const close = path.indexOf(']', i);
            if (close < 0) return undefined;
            const token = path.slice(i + 1, close).trim();
            let key: string | number;
            if (
                (token.startsWith("'") && token.endsWith("'")) ||
                (token.startsWith('"') && token.endsWith('"'))
            ) {
                key = token.slice(1, -1);
            } else {
                key = Number(token);
                if (Number.isNaN(key)) return undefined;
            }
            if (cursor == null) return undefined;
            if (Array.isArray(cursor)) {
                const idx = typeof key === 'number' && key < 0 ? cursor.length + key : Number(key);
                cursor = cursor[idx];
            } else if (typeof cursor === 'object') {
                cursor = (cursor as Record<string, unknown>)[String(key)];
            } else {
                return undefined;
            }
            i = close + 1;
        } else {
            i++;
        }
    }
    return cursor;
};

/* -------------------------------------------------------------------------- */
/*  Assertion evaluator                                                        */
/* -------------------------------------------------------------------------- */

const evalAssertion = (
    assertion: ChainAssertion,
    response: ExecuteApiResult
): { ok: boolean; reason?: string } => {
    if ('status' in assertion) {
        const ok = Array.isArray(assertion.status)
            ? assertion.status.includes(response.statusCode)
            : assertion.status === response.statusCode;
        return ok ? { ok } : { ok, reason: `expected status ${assertion.status}, got ${response.statusCode}` };
    }
    if ('jsonPath' in assertion && 'equals' in assertion) {
        const actual = resolveJsonPath(response.content, assertion.jsonPath);
        const ok = deepEqual(actual, assertion.equals);
        return ok
            ? { ok }
            : { ok, reason: `${assertion.jsonPath}: expected ${JSON.stringify(assertion.equals)}, got ${JSON.stringify(actual)}` };
    }
    if ('jsonPath' in assertion && 'exists' in assertion) {
        const actual = resolveJsonPath(response.content, assertion.jsonPath);
        const ok = actual !== undefined;
        return ok ? { ok } : { ok, reason: `${assertion.jsonPath} not found` };
    }
    if ('contains' in assertion) {
        const haystack =
            typeof response.content === 'string'
                ? response.content
                : response.contentRaw || JSON.stringify(response.content);
        const ok = haystack.includes(assertion.contains);
        return ok ? { ok } : { ok, reason: `response did not contain "${assertion.contains}"` };
    }
    if ('headerPresent' in assertion) {
        const target = assertion.headerPresent.toLowerCase();
        const ok = response.contentHeaders.some(h => h.key.toLowerCase() === target);
        return ok ? { ok } : { ok, reason: `missing header ${assertion.headerPresent}` };
    }
    return { ok: false, reason: 'unknown assertion shape' };
};

const deepEqual = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
    ));
};

/* -------------------------------------------------------------------------- */
/*  Runner                                                                     */
/* -------------------------------------------------------------------------- */

export const runChain = async (
    steps: ChainStep[],
    executor: ChainExecutor,
    initialVariables: Record<string, unknown> = {}
): Promise<ChainRunResult> => {
    const startedAt = Date.now();
    const variables: Record<string, unknown> = { ...initialVariables };
    const results: ChainStepResult[] = [];
    let bailed = false;

    for (const step of steps) {
        if (bailed) {
            results.push({
                stepId: step.id,
                status: 'skipped',
                assertions: [],
                extractedVariables: {},
            });
            continue;
        }

        let response: ExecuteApiResult | undefined;
        try {
            response = await executor(
                {
                    method: step.request.method,
                    url: step.request.url,
                    headers: step.request.headers,
                    body: step.request.body,
                },
                variables
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            results.push({
                stepId: step.id,
                status: 'error',
                assertions: [],
                extractedVariables: {},
                error: message,
            });
            if (step.bailOnFailure !== false) bailed = true;
            continue;
        }

        // Extractions
        const extractedVariables: Record<string, unknown> = {};
        for (const ex of step.extract || []) {
            const value = resolveJsonPath(response.content, ex.from);
            extractedVariables[ex.as] = value;
            variables[ex.as] = value;
        }

        // Assertions
        const assertionResults = (step.assert || []).map(a => ({
            assertion: a,
            ...evalAssertion(a, response!),
        }));
        const allPass = assertionResults.every(r => r.ok);
        const status: ChainStepResult['status'] = allPass ? 'pass' : 'fail';

        results.push({
            stepId: step.id,
            status,
            response,
            assertions: assertionResults,
            extractedVariables,
        });

        if (!allPass && step.bailOnFailure !== false) bailed = true;
    }

    return {
        steps: results,
        variables,
        startedAt,
        finishedAt: Date.now(),
        ok: results.every(r => r.status === 'pass' || r.status === 'skipped'),
    };
};
