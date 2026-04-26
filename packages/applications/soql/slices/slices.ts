/**
 * SOQL-owned Redux slices. These used to live in `core/store/modules`
 * but moved into the SOQL extension so the package is self-contained and
 * the core host can boot without them.
 *
 * Slices register at runtime via `injectReducer('ui', …)` /
 * `injectReducer('query', …)` when the SOQL app mounts.
 */
export * as UI from './ui';
export * as QUERY from './query';
