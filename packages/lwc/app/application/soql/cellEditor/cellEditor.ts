import { LightningElement, api } from 'lwc';

export default class CellEditor extends LightningElement {
    @api editorType: string = 'text';
    @api picklistValues: Array<{ label: string; value: string }> = [];
    @api length: number = 0;
    @api initialValue: any = null;
    @api fieldLabel: string = '';

    _draft: any = null;
    _committed = false;

    connectedCallback() {
        this._draft = this._normalizeInitial(this.initialValue);
    }

    renderedCallback() {
        // Focus the input on first mount.
        const el = this._focusableEl();
        if (el && document.activeElement !== el) {
            try {
                el.focus();
                if (typeof el.select === 'function') el.select();
            } catch (_e) {
                // ignore focus errors
            }
        }
    }

    _focusableEl() {
        return (
            this.template.querySelector('lightning-input') ||
            this.template.querySelector('lightning-textarea') ||
            this.template.querySelector('lightning-combobox') ||
            this.template.querySelector('lightning-dual-listbox')
        );
    }

    _normalizeInitial(value) {
        if (value == null) return '';
        if (this.editorType === 'boolean') {
            return value === true || value === 'true';
        }
        if (this.editorType === 'multipicklist') {
            if (Array.isArray(value)) return value;
            if (typeof value === 'string' && value.length > 0) {
                return value.split(';').map(s => s.trim());
            }
            return [];
        }
        if (this.editorType === 'datetime' && typeof value === 'string') {
            // lightning-input type=datetime wants the local ISO value without TZ.
            // Strip trailing `Z` if present, keep up to seconds.
            return value.replace(/\.\d+/, '').replace(/Z$/, '');
        }
        return value;
    }

    get isText() {
        return this.editorType === 'text';
    }
    get isTextarea() {
        return this.editorType === 'textarea';
    }
    get isNumber() {
        return this.editorType === 'number';
    }
    get isDate() {
        return this.editorType === 'date';
    }
    get isDatetime() {
        return this.editorType === 'datetime';
    }
    get isBoolean() {
        return this.editorType === 'boolean';
    }
    get isPicklist() {
        return this.editorType === 'picklist';
    }
    get isMultipicklist() {
        return this.editorType === 'multipicklist';
    }

    get maxLengthAttr() {
        return this.length && this.length > 0 ? this.length : undefined;
    }

    handleChange = (e: any) => {
        if (this.isBoolean) {
            this._draft = e?.target?.checked === true;
            // For checkboxes, commit immediately on change.
            this._commit();
            return;
        }
        this._draft = e?.detail?.value ?? e?.target?.value ?? this._draft;
        if (this.isPicklist || this.isMultipicklist) {
            // Commit on change for dropdowns.
            this._commit();
        }
    };

    handleBlur = () => {
        this._commit();
    };

    handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !this.isTextarea) {
            e.preventDefault();
            this._commit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this._cancel();
        }
    };

    _commit() {
        if (this._committed) return;
        this._committed = true;
        this.dispatchEvent(
            new CustomEvent('commit', {
                detail: { value: this._draft },
            })
        );
    }

    _cancel() {
        if (this._committed) return;
        this._committed = true;
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
