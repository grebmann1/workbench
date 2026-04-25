/**
 * Validation utilities
 */

export function isUndefinedOrNull(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}

export function isNotUndefinedOrNull<T>(value: T): value is NonNullable<T> {
    return value !== null && value !== undefined;
}

export function isEmpty(str?: string | null): boolean {
    return !str || str.length === 0;
}

/** Runtime type guard for plain objects. Narrows `unknown` to `Record<string, unknown>`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
