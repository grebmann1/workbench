/**
 * Pure helper for stripping full-line comments out of a SOQL query just before
 * it is sent to Salesforce.
 *
 * Kept free of the `host-api/store` barrel (like `queryPagination.ts`) so it can
 * be unit-tested in isolation — the slice itself pulls in Redux + core wiring
 * the node test runner can't cheaply load.
 *
 * Contract (deliberately conservative):
 *   - A line is a comment ONLY when its first non-whitespace characters are
 *     `#` or `--`. Such lines are blanked (replaced with an empty string) so the
 *     overall line count — and therefore any line numbers Salesforce reports in
 *     an error — is preserved.
 *   - A `#` or `--` that appears AFTER other tokens on a line, or INSIDE a
 *     quoted string literal, is left untouched. Because SOQL string literals
 *     cannot span newlines, a marker inside a literal always shares its line
 *     with the surrounding query text, so the "first non-whitespace" rule never
 *     misfires on it (e.g. `WHERE Name = 'a -- not a comment'`).
 *
 * The raw text (with comments) is what the caller keeps in the editor, drafts,
 * saved files and history; only the value returned here reaches the wire.
 */

/** True when `line`'s first non-whitespace characters are a `#` or `--` marker. */
export function isSoqlCommentLine(line: string): boolean {
    return /^\s*(#|--)/.test(line);
}

/**
 * Return `soql` with every full-line comment blanked out. Preserves line count
 * and line endings semantics (splits on `\r?\n`, rejoins with `\n`). Returns the
 * input unchanged (aside from newline normalisation) when it holds no comments.
 * Nullish input is returned as-is.
 */
export function stripSoqlComments(soql: string): string {
    if (!soql) return soql;
    return soql
        .split(/\r?\n/)
        .map(line => (isSoqlCommentLine(line) ? '' : line))
        .join('\n');
}
