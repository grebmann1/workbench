/**
 * Focus trap utility for modals and transient panels.
 *
 * Usage:
 *
 *   import { createFocusTrap } from 'component/slds/focusTrap/focusTrap';
 *
 *   connectedCallback() {
 *     this._trap = createFocusTrap(this.template);
 *     this._trap.activate();
 *   }
 *   disconnectedCallback() {
 *     this._trap?.deactivate();
 *   }
 *
 * On `activate()`:
 *   - Remembers the currently focused element (so we can restore it later).
 *   - Moves focus to the first focusable element inside the given root.
 *   - Installs a keydown listener that catches Tab/Shift+Tab at the root
 *     and wraps focus between first/last focusable. Esc is NOT intercepted
 *     — callers that need Esc to close should register their own handler.
 *
 * On `deactivate()`:
 *   - Removes the keydown listener.
 *   - Restores focus to whatever was focused before activation.
 *
 * The utility is intentionally framework-agnostic (takes a DOM root, not
 * an LWC element) so it can drive focus traps in both LWC templates
 * (`this.template` is a ShadowRoot) and vanilla overlays.
 */

export interface FocusTrap {
    activate(): void;
    deactivate(): void;
}

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
].join(',');

function isVisible(el: Element): boolean {
    // Duck-type instead of `instanceof HTMLElement` so the utility works
    // in unit tests without jsdom. An HTMLElement has .focus, offsetParent,
    // and getClientRects() — that's enough.
    const anyEl = el as unknown as {
        hidden?: boolean;
        offsetParent?: unknown;
        getClientRects?: () => ArrayLike<unknown>;
        focus?: unknown;
    };
    if (typeof anyEl.focus !== 'function') return false;
    if (anyEl.hidden) return false;
    if (anyEl.offsetParent !== null && anyEl.offsetParent !== undefined) return true;
    const rects = anyEl.getClientRects?.();
    return !!rects && rects.length > 0;
}

function getFocusable(root: ParentNode): HTMLElement[] {
    const all = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[];
    return all.filter(isVisible);
}

export function createFocusTrap(root: ParentNode | null | undefined): FocusTrap {
    let previouslyFocused: HTMLElement | null = null;
    let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
    let active = false;

    function onKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Tab' || !root) return;
        const focusables = getFocusable(root);
        if (focusables.length === 0) {
            // Nothing to trap onto; prevent escape instead of crashing.
            event.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        // LWC shadow DOM routes focus up to document.activeElement, so we
        // read from document rather than trying to access a shadow-root's
        // activeElement. Also keeps the trap unit-testable without jsdom.
        const active = (document.activeElement as HTMLElement) ?? null;
        if (event.shiftKey) {
            if (!active || active === first || !focusables.includes(active)) {
                event.preventDefault();
                last.focus();
            }
        } else {
            if (!active || active === last || !focusables.includes(active)) {
                event.preventDefault();
                first.focus();
            }
        }
    }

    return {
        activate(): void {
            if (active || !root) return;
            active = true;
            previouslyFocused = (document.activeElement as HTMLElement) ?? null;
            keydownHandler = onKeydown;
            // Keydown on document so it fires regardless of focus location
            // inside the trap (LWC shadow DOM routes keyboard events up to
            // the document by default).
            document.addEventListener('keydown', keydownHandler, true);
            const focusables = getFocusable(root);
            if (focusables.length > 0) {
                focusables[0].focus();
            }
        },
        deactivate(): void {
            if (!active) return;
            active = false;
            if (keydownHandler) {
                document.removeEventListener('keydown', keydownHandler, true);
                keydownHandler = null;
            }
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                try {
                    previouslyFocused.focus();
                } catch {
                    // Element may have been removed from the DOM while the
                    // trap was active — swallow, we tried our best.
                }
            }
            previouslyFocused = null;
        },
    };
}

/** Test-only: query focusable elements via the utility's own rules. */
export function __focusableForTests(root: ParentNode): HTMLElement[] {
    return getFocusable(root);
}
