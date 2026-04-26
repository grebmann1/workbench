import { isUndefinedOrNull } from './validation';
/**
 * Storage utilities
 */
export function getFromStorage(item, byDefault) {
    if (item == null)
        return byDefault;
    try {
        const parsedItem = JSON.parse(item);
        return isUndefinedOrNull(parsedItem) ? byDefault : parsedItem;
    }
    catch {
        return byDefault;
    }
}
export function safeParseJson(item) {
    if (item == null)
        return null;
    try {
        return JSON.parse(item);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=storage.js.map