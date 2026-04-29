function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object';
}

export function extractNestedErrorMessage(errorLike: unknown): string {
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
