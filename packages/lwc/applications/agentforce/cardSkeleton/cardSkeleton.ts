import ToolkitElement from 'host-api/element';

/**
 * Pulsing skeleton for the conversation/interaction list (5 cards).
 *
 * Static template fragment — no `Array.from` over `@track`. Accessibility:
 * `role="status"` + `aria-live="polite"` + sr-only "Loading…" text.
 */
export default class CardSkeleton extends ToolkitElement {}
