import { isUndefinedOrNull } from './validation';

/**
 * Storage utilities
 */

export function getFromStorage<T = unknown>(item: string | null, byDefault: T): T {
    if (item == null) return byDefault;
    try {
        const parsedItem = JSON.parse(item);
        return isUndefinedOrNull(parsedItem) ? byDefault : parsedItem;
    } catch {
        return byDefault;
    }
}

export function safeParseJson<T = unknown>(item: string | null): T | null {
    if (item == null) return null;
    try {
        return JSON.parse(item) as T;
    } catch {
        return null;
    }
}
