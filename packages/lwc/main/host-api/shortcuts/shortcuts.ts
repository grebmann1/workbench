/**
 * Keyboard-shortcut registry.
 *
 * Every custom keyboard handler in the app registers its shortcut here on
 * `connectedCallback` and unregisters on `disconnectedCallback`. The
 * shortcut-help modal (`component/a11y/shortcutsHelp/`) reads from the
 * registry to show a live list of every active shortcut, and the same
 * data feeds `aria-keyshortcuts` attributes on interactive elements.
 *
 * This is a pure data layer — registering a shortcut does NOT attach any
 * event listener. The component that owns the shortcut keeps its own
 * listener. Registering here is how we tell the user "this shortcut
 * exists", nothing more.
 *
 * Shortcut keys use the W3C aria-keyshortcuts format:
 *   "Control+Shift+S", "Alt+F4", "Escape", "?"
 * Modifier order is Meta, Control, Alt, Shift, then the key. A single
 * shortcut definition can list multiple key combos separated by spaces
 * (e.g. "Control+/ Meta+/" for cross-platform ? or Cmd+/).
 */

export interface ShortcutDefinition {
    id: string;
    keys: string;
    label: string;
    scope?: string;
    description?: string;
}

const registry = new Map<string, ShortcutDefinition>();
const listeners = new Set<() => void>();

export function registerShortcut(definition: ShortcutDefinition): () => void {
    if (!definition || !definition.id) {
        throw new Error('registerShortcut: definition.id is required');
    }
    if (!definition.keys || !definition.label) {
        throw new Error(`registerShortcut: "${definition.id}" requires keys + label`);
    }
    registry.set(definition.id, definition);
    notifyChange();
    return () => {
        if (registry.get(definition.id) === definition) {
            registry.delete(definition.id);
            notifyChange();
        }
    };
}

export function listShortcuts(): ShortcutDefinition[] {
    return Array.from(registry.values()).sort((a, b) => {
        const scopeDiff = (a.scope || '').localeCompare(b.scope || '');
        return scopeDiff !== 0 ? scopeDiff : a.label.localeCompare(b.label);
    });
}

export function subscribeShortcuts(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function notifyChange(): void {
    for (const listener of listeners) {
        try {
            listener();
        } catch {
            // Listener errors are isolated — one bad subscriber shouldn't
            // block the rest or break a register/unregister flow.
        }
    }
}

export function __resetShortcutsForTests(): void {
    registry.clear();
    listeners.clear();
}
