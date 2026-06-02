import ToolkitElement from 'host-api/element';

/**
 * Pulsing skeleton for the inspector tree (8 rows of varying widths).
 *
 * Static template fragment — no `Array.from` over `@track`. Accessibility:
 * `role="status"` + `aria-live="polite"` + sr-only "Loading…" text.
 */
export default class TreeSkeleton extends ToolkitElement {}
