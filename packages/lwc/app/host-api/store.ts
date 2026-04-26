/**
 * Public store surface for extension Apps. Re-exports only the stable
 * contracts; concrete feature slices for *other* apps and `storeRef`
 * internals stay private.
 *
 * Re-exports via the `core/store` module alias so the inject_salesforce
 * bundle's `core/store` → `lightStore` remap continues to apply. Relative
 * imports would bypass that remap and silently pull the full store into
 * the injected context.
 *
 * The action-namespace re-exports (UI, SOBJECT, DESCRIBE, QUERY, SELECTORS)
 * are what lets extension Apps dispatch and select against the host's
 * shared slices without reaching into `core/store` themselves. When a
 * slice moves out of core into its own extension (e.g. QUERY → SOQL), its
 * action creators are still re-exported here so cross-app coordination
 * keeps working.
 */
export { store, injectReducer, removeReducer, connectStore, reportError } from 'core/store';
export { getStore } from 'core/store/storeRef';
export {
    SELECTORS,
    SOBJECT,
    DESCRIBE,
    DOCUMENT,
    SHELL,
    APPLICATION,
    ERROR,
    BACKGROUNDJOB,
} from 'core/store';
