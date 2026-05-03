import { createFocusTrap, type FocusTrap } from 'slds/focusTrap';
import LightningModal from 'lightning/modal';
import { api } from 'lwc';

export const RESULT = {
    CLOSE: 'close',
    AUTO_RECONNECT: 'auto-reconnect',
};

export default class SessionRecoveryModal extends LightningModal {
    @api heading = 'Session Expired';
    @api message =
        'Your Salesforce session has expired. You can reconnect automatically when a reusable browser session is available.';
    @api details = '';
    @api closeLabel = 'Log out';
    @api reconnectLabel = 'Auto-Reconnect';
    @api isAutoReconnectEnabled = false;

    _focusTrap: FocusTrap | null = null;

    connectedCallback() {
        // Additive focus trap — Lightning's base modal handles focus
        // movement but the recovery modal is often shown via the global
        // error pathway where focus may already be lost, so trapping onto
        // the Close/Reconnect buttons defensively is worth the extra ms.
        this._focusTrap = createFocusTrap(this.template);
        this._focusTrap.activate();
    }

    disconnectedCallback() {
        this._focusTrap?.deactivate();
        this._focusTrap = null;
    }

    handleClose = () => {
        this.close(RESULT.CLOSE);
    };

    handleAutoReconnect = () => {
        this.close(RESULT.AUTO_RECONNECT);
    };
}
