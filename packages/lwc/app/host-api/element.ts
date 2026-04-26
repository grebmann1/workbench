/**
 * Public base element for extension Apps.
 *
 * Re-exports the host's `ToolkitElement` so extensions never import from
 * `core/toolkitElement` directly. Uses the `core/toolkitElement` module
 * alias (not a relative path) to keep any future swap-via-alias (mirroring
 * the `core/store` → `lightStore` pattern) applicable here too.
 */
export { default } from 'core/toolkitElement';
export * from 'core/toolkitElement';
