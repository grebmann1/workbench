/**
 * Curated utility re-exports for extension Apps.
 *
 * Only the narrow subset used by today's extensions is exposed; keeping
 * this surface small makes the contract easy to audit and evolve. If an
 * extension needs more, add it here explicitly rather than opening a
 * wildcard re-export of `shared/utils`.
 */
export {
    isNotUndefinedOrNull,
    isUndefinedOrNull,
    isObject,
    isSame,
    isEmpty,
    lowerCaseKey,
    fullApiName,
    shortFormatter,
    classSet,
    guid,
    guidFromHash,
    runActionAfterTimeOut,
    extractErrorDetailsFromQuery,
    compareString,
    getFieldValue,
    arrayToMap,
    stripNamespace,
} from 'shared/utils';
