/**
 * Pure helpers extracted from the GraphQL Explorer app shell so they can
 * be unit-tested without a host Redux store or DOM.
 */

export function formatResponse(
    data: unknown,
    errors: Array<{ message: string; path?: string[] }> | null | undefined
): string {
    const hasData = data !== null && data !== undefined;
    const hasErrors = Array.isArray(errors) && errors.length > 0;
    if (!hasData && !hasErrors) return '';
    const payload: Record<string, unknown> = {};
    if (hasData) payload.data = data;
    if (hasErrors) payload.errors = errors;
    try {
        return JSON.stringify(payload, null, 2);
    } catch {
        return '';
    }
}

export function validateVariablesJson(
    raw: string | undefined | null
): { ok: true } | { ok: false; error: string } {
    if (!raw || !raw.trim()) return { ok: true };
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Invalid JSON' };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'Variables must be a JSON object (e.g. {})' };
    }
    return { ok: true };
}

const TAB_NAME_MAX = 24;

/**
 * Derive a tab label from the query body:
 *  - named operation:  `query FooBar { ... }` → "FooBar"
 *  - anonymous query:  `{ account { ... } }` → "account"
 *  - empty / unparseable → "Query N"
 * Keeps the label short so the tabset stays readable.
 */
export function deriveTabName(body: string | undefined | null, index: number): string {
    const fallback = `Query ${index + 1}`;
    if (!body || typeof body !== 'string') return fallback;
    const stripped = stripComments(body).trim();
    if (!stripped) return fallback;

    const named = stripped.match(/^(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (named) return truncate(named[1]);

    // Anonymous query — find the first field inside the outermost braces.
    const braceIdx = stripped.indexOf('{');
    if (braceIdx === -1) return fallback;
    const body2 = stripped.slice(braceIdx + 1).trim();
    const firstField = body2.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (firstField) return truncate(firstField[1]);

    return fallback;
}

function stripComments(s: string): string {
    return s.replace(/#[^\n]*/g, '');
}

function truncate(s: string): string {
    return s.length > TAB_NAME_MAX ? `${s.slice(0, TAB_NAME_MAX - 1)}…` : s;
}

/**
 * Count total fields (i.e. leaf + intermediate selection-set names) in a
 * GraphQL query body. Purely lexical — we count all identifiers that
 * appear inside a `{ … }` block and that don't look like keywords /
 * directives. Good enough for a signal in the meta footer; not a real
 * AST parse.
 */
const GQL_NON_FIELDS = new Set([
    'query',
    'mutation',
    'subscription',
    'fragment',
    'on',
    'true',
    'false',
    'null',
]);
export function countQueryFields(body: string | undefined | null): number {
    if (!body || typeof body !== 'string') return 0;
    const stripped = stripComments(body);
    // Only look at content inside braces.
    let depth = 0;
    let inside = '';
    for (const ch of stripped) {
        if (ch === '{') {
            depth++;
            continue;
        }
        if (ch === '}') {
            depth--;
            continue;
        }
        if (depth > 0) inside += ch;
    }
    // Strip parentheses (arguments), strings, variables, directives.
    const cleaned = inside
        .replace(/"""[\s\S]*?"""/g, ' ')
        .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
        .replace(/\([^()]*\)/g, ' ')
        .replace(/@[A-Za-z_][A-Za-z0-9_]*/g, ' ')
        .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, ' ');
    const tokens = cleaned.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    let n = 0;
    for (const tok of tokens) {
        if (!GQL_NON_FIELDS.has(tok)) n++;
    }
    return n;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Detect common GraphQL error location spans from a list of error objects
 * produced by Salesforce's /graphql endpoint. Returns an array of
 * Monaco-ready marker specs: { line, column, message }.
 */
export function extractErrorMarkers(
    errors:
        | Array<{ message: string; locations?: Array<{ line: number; column: number }> }>
        | null
        | undefined
): Array<{ line: number; column: number; message: string }> {
    if (!Array.isArray(errors)) return [];
    const out: Array<{ line: number; column: number; message: string }> = [];
    for (const err of errors) {
        if (!err || typeof err.message !== 'string') continue;
        const locs = Array.isArray(err.locations) ? err.locations : [];
        if (locs.length === 0) continue;
        for (const loc of locs) {
            if (
                loc &&
                Number.isFinite(loc.line) &&
                Number.isFinite(loc.column) &&
                loc.line > 0 &&
                loc.column > 0
            ) {
                out.push({ line: loc.line, column: loc.column, message: err.message });
            }
        }
    }
    return out;
}

export function isMacPlatform(): boolean {
    try {
        const p = (navigator as any)?.userAgentData?.platform || navigator?.platform || '';
        return /mac/i.test(String(p));
    } catch {
        return false;
    }
}

export function runShortcutLabel(isMac: boolean): string {
    return isMac ? '⌘↵' : 'Ctrl+Enter';
}
