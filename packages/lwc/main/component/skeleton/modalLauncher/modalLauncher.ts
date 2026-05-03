import { createFocusTrap, type FocusTrap } from 'slds/focusTrap';
import LightningModal from 'lightning/modal';
import { api } from 'lwc';

export default class ModalLauncher extends LightningModal {
    @api isUserLoggedIn;

    _focusTrap: FocusTrap | null = null;

    connectedCallback() {
        // Lightning's base modal already manages a focus trap, but the
        // launcher body contains searchable items rendered outside the
        // modal-header region — wrap our template in a second, additive
        // trap so Tab cycles stay inside the launcher list even when the
        // host modal's trap races with dynamic content.
        this._focusTrap = createFocusTrap(this.template);
        this._focusTrap.activate();
    }

    disconnectedCallback() {
        this._focusTrap?.deactivate();
        this._focusTrap = null;
    }

    handleCloseClick() {
        this.close();
    }

    closeModal() {
        this.close();
    }

    /** events **/
    handleSelectApplication = e => {
        const application = e.detail;
        if (application) {
            this.close(application);
        }
    };
}
