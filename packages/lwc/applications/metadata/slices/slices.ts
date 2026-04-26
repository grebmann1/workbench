/**
 * Metadata-owned Redux slice. Moved out of core/store/modules so the
 * Metadata extension owns its state shape. Registers at runtime via
 * `injectReducer('metadata', …)` when the app mounts.
 */
export * as METADATA from './metadata';
