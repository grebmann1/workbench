import LightningModal from 'lightning/modal';

import { buildShortcutRows, detectIsMac, type FormattedShortcutRow } from './platform.ts';

/**
 * "Keyboard Shortcuts" modal for the GraphQL Explorer.
 *
 * Open with:
 *
 *     import ShortcutsModal from 'graphql/shortcutsModal';
 *     ShortcutsModal.open({ label: 'Keyboard shortcuts', size: 'small' });
 */
export default class ShortcutsModal extends LightningModal {
    private readonly _isMac: boolean = detectIsMac();

    get isMac(): boolean {
        return this._isMac;
    }

    get rows(): FormattedShortcutRow[] {
        return buildShortcutRows(this._isMac);
    }

    handleClose(): void {
        this.close('closed');
    }
}
