import { LightningElement, api } from 'lwc';
import { normalizeString as normalize, classSet } from 'shared/utils';
import { clampPanelWidth, resizeWithKeyboard } from './resize';

export default class VerticalPanel extends LightningElement {
    @api position;
    @api isOpen;
    @api size = 'slds-size_medium';
    @api title = 'Filter';
    @api minWidth = 260;
    @api maxWidth: number | undefined;
    @api disableResize = false;

    @api isHeaderHidden = false;
    @api hasBorder = false;

    manualPanelWidth: number | undefined;

    hasLoaded = false;

    /** Events */

    handleClose = e => {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    };

    /** Methods */

    /** Getters */

    get filterPanelClass() {
        return classSet(
            `slds-panel ${this.normalizedSize} slds-panel_docked slds-panel_docked-${this.normalizedPosition} slds-panel_drawer`
        )
            .add({
                'slds-is-open slds-flex-column': this.isOpen,
                'with-border': this.hasBorder,
            })
            .toString();
    }

    get normalizedSize() {
        return normalize(this.size, {
            fallbackValue: 'default', // Default doesn't exist in SLDS !!!
            validValues: [
                'default',
                'slds-size_small',
                'slds-size_medium',
                'slds-size_large',
                'slds-size_x-large',
                'slds-size_full',
            ],
        });
    }

    get normalizedPosition() {
        return normalize(this.position, {
            fallbackValue: 'right',
            validValues: ['left', 'right'],
        });
    }

    get isHeaderVisible() {
        return !this.isHeaderHidden;
    }

    get panelStyle() {
        const width =
            !this.disableResize && this.manualPanelWidth
                ? `width: ${clampPanelWidth(this.manualPanelWidth, this.effectiveMinWidth, this.normalizedMaxWidth)}px;`
                : '';
        return `${width} min-width: ${this.effectiveMinWidth}px; max-width: ${this.normalizedMaxWidth}px;`;
    }

    get normalizedMinWidth() {
        const parsed = Number.parseInt(String(this.minWidth), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 260;
    }

    /** Pointer capture keeps drag cleanup local to the resize handle. */
    _drag: { x: number; width: number; pointerId: number; target: HTMLElement } | null = null;
    _observer: ResizeObserver | null = null;
    renderedWidth = 0;
    viewportWidth = window.innerWidth;

    connectedCallback() {
        window.addEventListener('resize', this.handleWindowResize);
    }
    disconnectedCallback() {
        this.finishResize();
        this._observer?.disconnect();
        window.removeEventListener('resize', this.handleWindowResize);
    }
    renderedCallback() {
        if (!this._observer && this.refs.panel) {
            this._observer = new ResizeObserver(entries => {
                const width = Math.round(
                    entries[0]?.borderBoxSize?.[0]?.inlineSize || entries[0]?.contentRect.width || 0
                );
                if (width !== this.renderedWidth) this.renderedWidth = width;
            });
            this._observer.observe(this.refs.panel);
        }
    }
    handleWindowResize = () => {
        this.viewportWidth = window.innerWidth;
    };
    get normalizedMaxWidth() {
        const parsed = Number(this.maxWidth);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : this.viewportWidth;
    }
    get effectiveMinWidth() {
        return Math.min(this.normalizedMinWidth, this.normalizedMaxWidth);
    }
    get showResizeHandle() {
        return this.isOpen && !this.disableResize;
    }
    get resizeLabel() {
        return `${this.title} width`;
    }
    get resizeValue() {
        return this.renderedWidth || this.effectiveMinWidth;
    }
    get resizeValueText() {
        return `${this.resizeValue} pixels`;
    }

    setPanelWidth(width: number) {
        this.manualPanelWidth = clampPanelWidth(
            width,
            this.effectiveMinWidth,
            this.normalizedMaxWidth
        );
        window.dispatchEvent(new Event('resize'));
    }
    handleResizeStart = event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const target = event.currentTarget;
        target.focus();
        target.setPointerCapture(event.pointerId);
        this._drag = {
            x: event.clientX,
            width: this.renderedWidth,
            pointerId: event.pointerId,
            target,
        };
    };
    handleResizeMove = event => {
        if (!this._drag || event.pointerId !== this._drag.pointerId) return;
        const change = event.clientX - this._drag.x;
        this.setPanelWidth(
            this._drag.width + (this.normalizedPosition === 'right' ? -change : change)
        );
    };
    finishResize = () => {
        const drag = this._drag;
        this._drag = null;
        if (drag?.target.hasPointerCapture(drag.pointerId))
            drag.target.releasePointerCapture(drag.pointerId);
    };
    handleResizeKeydown = event => {
        const width = resizeWithKeyboard(
            this.resizeValue,
            event.key,
            this.normalizedPosition,
            event.shiftKey,
            this.effectiveMinWidth,
            this.normalizedMaxWidth
        );
        if (width === null) return;
        event.preventDefault();
        this.setPanelWidth(width);
    };
}
