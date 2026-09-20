/**
 * Validation utilities
 */

export function isUndefinedOrNull(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

export function isNotUndefinedOrNull<T>(value: T): value is NonNullable<T> {
    return value !== null && value !== undefined;
}

export function isEmpty(value?: unknown): boolean {
    if (!value) return true;
    if (typeof value === 'string') return value.length === 0;
    return (
        (typeof value === 'object' || typeof value === 'function') &&
        'length' in value &&
        value.length === 0
    );
}

/** Runtime type guard for plain objects. Narrows `unknown` to `Record<string, unknown>`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
