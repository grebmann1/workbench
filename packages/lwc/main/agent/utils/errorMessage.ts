function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object';
}

/** Render a Zod issue path (e.g. [2, 'content', 1, 'text']) as `[2].content[1].text`. */
function formatIssuePath(path: unknown): string {
    if (!Array.isArray(path)) return '';
    return path
        .map(segment => (typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`))
        .join('')
        .replace(/^\./, '');
}

/**
 * Flatten a Zod issue tree into `{ path, message }` leaves. Zod v4 nests the
 * per-branch failures of a union under `issues.errors` (an array of issue
 * arrays), so a bare `.map` over the top-level issues would only report
 * "invalid union" at the message index — we recurse to reach the real field.
 */
function flattenZodIssues(
    issues: unknown,
    basePath: unknown[] = []
): Array<{ path: string; message: string }> {
    if (!Array.isArray(issues)) return [];
    const out: Array<{ path: string; message: string }> = [];
    for (const issue of issues) {
        if (!isRecord(issue)) continue;
        const path = [...basePath, ...(Array.isArray(issue.path) ? issue.path : [])];
        const nested = Array.isArray(issue.errors)
            ? (issue.errors as unknown[])
            : Array.isArray((issue as any).unionErrors)
              ? (issue as any).unionErrors.map((e: any) => e?.issues ?? e)
              : null;
        if (nested) {
            for (const group of nested) {
                out.push(...flattenZodIssues(group, path));
            }
        } else {
            out.push({
                path: formatIssuePath(path),
                message: typeof issue.message === 'string' ? issue.message : 'invalid',
            });
        }
    }
    return out;
}

/**
 * Walk the cause/error chain looking for a Zod validation error (an object
 * carrying an `issues` array) and format its leaves. This is what turns the AI
 * SDK's opaque "The messages do not match the ModelMessage[] schema." into an
 * actionable pointer at the exact message index, part, and field that failed.
 */
function extractZodIssueDetail(errorLike: unknown): string | null {
    const queue: unknown[] = [errorLike];
    const seen = new Set<unknown>();
    while (queue.length > 0) {
        const current = queue.shift();
        if (current == null) continue;
        if (typeof current === 'object') {
            if (seen.has(current)) continue;
            seen.add(current);
        }
        if (!isRecord(current)) continue;
        if (Array.isArray((current as any).issues)) {
            const leaves = flattenZodIssues((current as any).issues);
            const seenLeaves = new Set<string>();
            const formatted: string[] = [];
            for (const leaf of leaves) {
                const key = `${leaf.path}|${leaf.message}`;
                if (seenLeaves.has(key)) continue;
                seenLeaves.add(key);
                formatted.push(leaf.path ? `${leaf.path}: ${leaf.message}` : leaf.message);
            }
            if (formatted.length > 0) {
                const shown = formatted.slice(0, 5).join('; ');
                const extra = formatted.length > 5 ? ` (+${formatted.length - 5} more)` : '';
                return `${shown}${extra}`;
            }
        }
        queue.push((current as any).cause, (current as any).error, (current as any).value);
    }
    return null;
}

function extractPrimaryErrorMessage(errorLike: unknown): string {
    const queue: unknown[] = [errorLike];
    const seen = new Set<unknown>();
    let fallback: string | null = null;

    while (queue.length > 0) {
        const current = queue.shift();
        if (current == null || seen.has(current)) continue;
        if (typeof current === 'object' || typeof current === 'function') {
            seen.add(current);
        }

        if (typeof current === 'string') {
            const text = current.trim();
            if (!text) continue;
            try {
                queue.unshift(JSON.parse(text));
                continue;
            } catch {
                if (!fallback) fallback = text;
                if (text !== 'Bad Request') return text;
                continue;
            }
        }

        if (current instanceof Error) {
            const errorWithExtras = current as Error & {
                cause?: unknown;
                responseBody?: unknown;
                data?: unknown;
            };
            if (errorWithExtras.cause) queue.unshift(errorWithExtras.cause);
            queue.unshift(errorWithExtras.responseBody);
            queue.unshift(errorWithExtras.data);
            if (typeof current.message === 'string' && current.message.trim()) {
                if (!fallback) fallback = current.message.trim();
                if (current.message.trim() !== 'Bad Request') return current.message.trim();
            }
            continue;
        }

        if (isRecord(current)) {
            queue.unshift(current.detail);
            queue.unshift(current.responseBody);
            queue.unshift(current.data);
            queue.unshift(current.body);
            queue.unshift(current.response);
            queue.unshift(current.cause);
            queue.unshift(current.error);
            const message =
                typeof current.message === 'string'
                    ? current.message.trim()
                    : typeof current.error === 'string'
                      ? current.error.trim()
                      : '';
            if (message) {
                if (!fallback) fallback = message;
                if (message !== 'Bad Request') return message;
            }
        }
    }

    if (fallback) return fallback;
    return errorLike instanceof Error ? errorLike.message : String(errorLike);
}

export function extractNestedErrorMessage(errorLike: unknown): string {
    const primary = extractPrimaryErrorMessage(errorLike);
    const zodDetail = extractZodIssueDetail(errorLike);
    if (!zodDetail) return primary;
    if (!primary || primary === '[object Object]' || primary.includes(zodDetail)) {
        return zodDetail;
    }
    return `${primary} (${zodDetail})`;
}
