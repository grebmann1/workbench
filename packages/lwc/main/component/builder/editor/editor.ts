import { LightningElement, api, track, wire } from 'lwc';

import { LABELS } from './editorLabels';
import hotkeysManager from './hotkeysmanager';

const BUILDER_MODE = {
    EDIT_MODE: 'EDIT_MODE',
    READ_MODE: 'READ_MODE',
};

export default class Editor extends LightningElement {
    @api isLoading = false;
    @api isLeftPanelToggled = false;
    @api isRightPanelToggled = false;
    @api isHeaderHidden = false;
    @api isToolbarHidden = false;
    @api isLeftPanelResizable = false;
    @api leftPanelWidth = 400;
    @api leftPanelMinWidth = 280;
    @api leftPanelMaxWidth = 700;

    // Header
    @api title;
    @api subtitle;

    labels = LABELS;
    editorId;
    _isResizingLeftPanel = false;

    connectedCallback() {
        this.enableShortcuts();
    }

    disconnectedCallback() {
        this.disableShortcuts();
        this.detachLeftPanelResizeListeners();
    }

    /** Methods */

    enableShortcuts = () => {
        hotkeysManager.subscribe('ctrl+s, command+s', this.executeActionSave);
        hotkeysManager.subscribe('ctrl+enter, command+enter', this.executeActionMethod);
    };

    disableShortcuts = () => {
        hotkeysManager.unsubscribe('ctrl+s, command+s', this.executeActionSave);
        hotkeysManager.unsubscribe('ctrl+enter, command+enter', this.executeActionMethod);
    };

    executeActionSave = e => {
        e.preventDefault();
        e.stopPropagation();
        if (this.isEditorVisible) {
            this.dispatchEvent(new CustomEvent('executesave', { bubbles: true, composed: true }));
        }
    };

    executeActionMethod = e => {
        e.preventDefault();
        e.stopPropagation();
        if (this.isEditorVisible) {
            this.dispatchEvent(new CustomEvent('executeaction', { bubbles: true, composed: true }));
        }
    };

    /** Getters */

    get isEditorVisible() {
        const element = this.template.querySelector('.editor-main-container');
        return element ? !element.hidden && element.offsetParent !== null : false;
    }

    get showSpinner() {
        return this.isLoading;
    }

    get spinnerAlternativeText() {
        return LABELS.spinnerAlternativeText;
    }

    get isReadOnlyMode() {
        return this.builderMode === BUILDER_MODE.READ_MODE;
    }

    get showLeftPanelClass() {
        return this.isLeftPanelToggled ? 'slds-show' : 'slds-hide';
    }

    get showRightPanel() {
        return this.isRightPanelToggled;
    }

    get isHeaderDisplayed() {
        return !this.isHeaderHidden;
    }

    get isToolbarDisplayed() {
        return !this.isToolbarHidden;
    }

    get isResizableLeftPanelVisible() {
        return this.isLeftPanelToggled && this.isLeftPanelResizable;
    }

    get leftPanelStyle() {
        if (!this.isResizableLeftPanelVisible) return '';
        const width = this.normalizedLeftPanelWidth;
        return `width:${width}px;min-width:${width}px;max-width:${width}px;`;
    }

    get normalizedLeftPanelWidth() {
        const width = Number(this.leftPanelWidth);
        const min = Number(this.leftPanelMinWidth);
        const max = Number(this.leftPanelMaxWidth);
        if (!Number.isFinite(width)) return min;
        return Math.max(min, Math.min(max, width));
    }

    handleLeftPanelResizeMouseDown = event => {
        if (!this.isResizableLeftPanelVisible) return;
        event.preventDefault();
        this._isResizingLeftPanel = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', this.handleLeftPanelResizeMouseMove);
        window.addEventListener('mouseup', this.handleLeftPanelResizeMouseUp);
    };

    handleLeftPanelResizeMouseMove = event => {
        if (!this._isResizingLeftPanel) return;
        const container = this.template.querySelector('.editor-content-row');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const candidateWidth = event.clientX - rect.left;
        const min = Number(this.leftPanelMinWidth);
        const max = Number(this.leftPanelMaxWidth);
        this.leftPanelWidth = Math.max(min, Math.min(max, candidateWidth));
    };

    handleLeftPanelResizeMouseUp = () => {
        this._isResizingLeftPanel = false;
        this.detachLeftPanelResizeListeners();
    };

    detachLeftPanelResizeListeners() {
        window.removeEventListener('mousemove', this.handleLeftPanelResizeMouseMove);
        window.removeEventListener('mouseup', this.handleLeftPanelResizeMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
}
