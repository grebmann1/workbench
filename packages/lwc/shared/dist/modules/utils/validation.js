/**
 * Validation utilities
 */
export function isUndefinedOrNull(value) {
    return value === null || value === undefined;
}
export function isNotUndefinedOrNull(value) {
    return value !== null && value !== undefined;
}
export function isEmpty(str) {
    return !str || str.length === 0;
}
/** Runtime type guard for plain objects. Narrows `unknown` to `Record<string, unknown>`. */
export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
//# sourceMappingURL=validation.js.map