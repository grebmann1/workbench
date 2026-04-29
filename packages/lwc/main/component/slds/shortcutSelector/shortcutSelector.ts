import hotkeys from 'hotkeys-js';
import { LightningElement, api } from 'lwc';
import { isUndefinedOrNull } from 'shared/utils';

export default class ShortcutSelector extends LightningElement {
    @api label = 'Shortcut Selector';

    @api disabled = false;

    _value = [];
    @api
    get value() {
        const key = Array.isArray(this._value) ? this._value[0] : this._value;
        return key === 'backspace'
            ? null
            : Array.isArray(this._value)
              ? this._value.join('+')
              : this._value || null;
    }
    set value(val) {
        this._value = isUndefinedOrNull(val) || typeof val !== 'string' ? [] : val.split('+');
    }

    handleInputFocus = () => {
        this.bindShortcut();
    };

    handleInputFocusOut = () => {
        this.unbindShortcut();
    };

    shortcutHandler = (e, handler) => {
        e.preventDefault();
        // getPressedKeyString() returns string[] with possible Mac symbol chars
        const keyArray = hotkeys.getPressedKeyString();
        const symbolToName: Record<string, string> = {
            '⇧': 'shift',
            '⌥': 'alt',
            '⌃': 'ctrl',
            '⌘': 'cmd',
        };
        const normalized = keyArray.map(k => symbolToName[k] ?? k.toLowerCase());
        this._value =
            normalized.length === 0 || (normalized.length === 1 && normalized[0] === 'backspace')
                ? []
                : normalized;
        this.dispatchEvent(
            new CustomEvent('change', {
                detail: {
                    value: this.value,
                },
                bubbles: true,
                composed: true,
            })
        );
    };

    bindShortcut = () => {
        hotkeys('*', this.shortcutHandler);
    };

    unbindShortcut = () => {
        hotkeys.unbind('*', this.shortcutHandler);
    };

    get isDisabled() {
        return this.disabled;
    }
}
