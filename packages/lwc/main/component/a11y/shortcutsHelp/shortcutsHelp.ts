import { LightningElement, track } from 'lwc';

import { listShortcuts, subscribeShortcuts } from 'host-api/shortcuts';
import type { ShortcutDefinition } from 'host-api/shortcuts';

import { createFocusTrap, type FocusTrap } from 'component/slds/focusTrap/focusTrap';

/**
 * Keyboard shortcuts help modal. Lists every shortcut registered in the
 * host-api shortcut registry, grouped by scope. Opened via the global
 * `?` or `Cmd/Ctrl+/` handler wired in the app shell — this component
 * does NOT register the open shortcut itself (shell owns it so the shell
 * can open/close without an awkward public-API dance).
 *
 * Visible state is controlled by `@api isOpen`. When true, we activate
 * the focus trap and announce the modal's presence. When false, we
 * restore focus and stop listening.
 */
export default class ShortcutsHelp extends LightningElement {
    // Using a plain reactive field instead of `@api` because we proxy
    // isOpen through a setter below — the decorator route requires
    // `@api isOpen` + a separate setter, which trips TS in this repo.
    _isOpen = false;
    @track shortcuts: ShortcutDefinition[] = [];

    unsubscribe?: () => void;
    focusTrap?: FocusTrap;

    connectedCallback(): void {
        this.shortcuts = listShortcuts();
        this.unsubscribe = subscribeShortcuts(() => {
            this.shortcuts = listShortcuts();
        });
    }

    disconnectedCallback(): void {
        this.unsubscribe?.();
        this.focusTrap?.deactivate();
    }

    get isOpen(): boolean {
        return this._isOpen;
    }

    set isOpen(value: boolean) {
        const next = !!value;
        if (next === this._isOpen) return;
        this._isOpen = next;
        if (next) {
            // Wait a tick for the template to render before focus-trapping.
            Promise.resolve().then(() => {
                const root = this.template?.querySelector('.shortcuts-help-modal');
                this.focusTrap = createFocusTrap(root);
                this.focusTrap.activate();
            });
        } else {
            this.focusTrap?.deactivate();
            this.focusTrap = undefined;
        }
    }

    get groups(): Array<{ scope: string; items: ShortcutDefinition[] }> {
        const byScope = new Map<string, ShortcutDefinition[]>();
        for (const s of this.shortcuts) {
            const key = s.scope || 'General';
            if (!byScope.has(key)) byScope.set(key, []);
            byScope.get(key)!.push(s);
        }
        return Array.from(byScope.entries())
            .map(([scope, items]) => ({ scope, items }))
            .sort((a, b) => a.scope.localeCompare(b.scope));
    }

    handleClose(): void {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.handleClose();
        }
    }
}
