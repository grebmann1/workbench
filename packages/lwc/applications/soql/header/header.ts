import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { api, wire } from 'lwc';

export default class Header extends ToolkitElement {
    _apiUsage: { used: number; limit: number } | null = null;

    @wire(connectStore, { store })
    storeChange({ ui }) {
        this._apiUsage = ui.apiUsage;
    }

    connectedCallback() {}

    /** Events **/

    /** Getters **/

    get apiUsage() {
        if (!this._apiUsage) return '';
        return `${this._apiUsage.used}/${this._apiUsage.limit}`;
    }
}
