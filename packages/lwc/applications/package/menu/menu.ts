import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { api, wire, track } from 'lwc';
import { PACKAGE } from 'package/slices';
import { isNotUndefinedOrNull } from 'shared/utils';

import { getMetadataTypeIcon, METADATA_RECORD_ICON } from './constants';

export default class Menu extends ToolkitElement {
    @track metadata_global = null;
    @track metadata_records = null;

    @api sobject;
    @api param1;
    @api param2;
    @api label1;
    @api label2;

    currentMetadata;
    isLoading = false;
    loadingMessage;
    error;

    @wire(connectStore, { store })
    handleStoreChange({ package2, application }) {
        if (!this.verifyIsActive(application.currentApplication)) return;

        const _hasParam1Changed = this.param1 != package2.menu_param1;
        this.param1 = package2.menu_param1;
        this.label1 = package2.menu_label1;
        this.sobject = package2.menu_sobject;
        this.isLoading = package2.menu_isLoading;
        this.loadingMessage = package2.menu_loadingMessage;
        this.currentMetadata = package2.menu_currentMetadata;

        if (
            JSON.stringify(this.metadata_global) !== JSON.stringify(package2.menu_metadata_global)
        ) {
            this.metadata_global = package2.menu_metadata_global;
        }
        if (
            JSON.stringify(this.metadata_records) !==
                JSON.stringify(package2.menu_metadata_records) ||
            _hasParam1Changed
        ) {
            this.metadata_records = package2.menu_metadata_records;
        }
    }

    connectedCallback() {
        store.dispatch(PACKAGE.fetchMenuGlobalMetadata());
    }

    dispatchSelectionEvent = detail => {
        this.dispatchEvent(new CustomEvent('select', { detail, bubbles: true, composed: true }));
    };

    /** Events */

    handleTypeSelect = event => {
        const item = event.detail?.item;
        if (!item?.rawName) return;
        store.dispatch(PACKAGE.fetchMenuSpecificMetadata({ sobject: item.rawName }));
    };

    handleRecordSelect = async event => {
        const item = event.detail?.item;
        if (!item) return;
        const { rawName: name, label, _developerName } = item;
        const params = {
            sobject: this.currentMetadata,
            param1: name,
            label1: label || name,
            _developerName,
        };
        await store.dispatch(PACKAGE.reduxSlice.actions.setMenuAttributes(params));
        this.dispatchSelectionEvent(params);
    };

    handleRefresh = () => {
        store.dispatch(PACKAGE.fetchMenuGlobalMetadata());
    };

    handleGoBack = () => {
        store.dispatch(PACKAGE.reduxSlice.actions.menuGoBack());
    };

    /** Getters */

    get computedTypesTree() {
        const records = this.metadata_global?.records || [];
        return records
            .map(record => ({
                id: record.key || record.name,
                name: record.label || record.name,
                title: record.label || record.name,
                rawName: record.name,
                icon: getMetadataTypeIcon(record.name),
            }))
            .sort((a, b) => (a.name || '').localeCompare(b.name));
    }

    get computedRecordsTree() {
        const records = this.metadata_records?.records || [];
        return records
            .map(record => ({
                id: record.key || record.name,
                name: record.label || record.name,
                title: record.label || record.name,
                rawName: record.name,
                label: record.label || record.name,
                _developerName: record._developerName,
                icon: METADATA_RECORD_ICON,
            }))
            .sort((a, b) => (a.name || '').localeCompare(b.name));
    }

    get selectedTypeId() {
        return this.currentMetadata || '';
    }

    get selectedRecordId() {
        return this.param1 || '';
    }

    get isRecordsPanelVisible() {
        return isNotUndefinedOrNull(this.metadata_records);
    }

    get recordCount() {
        return this.metadata_records?.records?.length ?? 0;
    }

    get recordsPanelTitle() {
        return this.isLoading
            ? this.currentMetadata
            : `${this.currentMetadata} (${this.recordCount})`;
    }

    get isLoadingTypes() {
        return this.isLoading && !this.isRecordsPanelVisible;
    }

    get isLoadingRecords() {
        return this.isLoading && this.isRecordsPanelVisible;
    }

    get searchFields() {
        return ['name', 'id'];
    }

    get attributes() {
        return {
            sobject: this.sobject,
            param1: this.param1,
            label1: this.label1,
        };
    }
}
