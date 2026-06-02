import ToolkitElement from 'host-api/element';
import { store, connectStore, SELECTORS, SOBJECT } from 'host-api/store';
import { fullApiName, lowerCaseKey } from 'host-api/utils';
import { wire, api } from 'lwc';
import { getDescribeByName } from '../describeResolver';
import { UI } from 'soql/slices';

export default class FieldsPanel extends ToolkitElement {
    @api namespace;

    tabs = [
        {
            id: 'tab-fields',
            label: this.i18n.FIELDS_PANEL_FIELDS,
            isActive: true,
        },
        {
            id: 'tab-relationships',
            label: this.i18n.FIELDS_PANEL_CHILD_REL,
            isActive: false,
        },
    ];
    sobjectMeta;
    keyword = '';
    isLoading = false;

    _selectedSObject;

    connectedCallback() {}

    @wire(connectStore, { store })
    storeChange({ describe, sobject, ui, application }) {
        const isCurrentApp = this.verifyIsActive(application.currentApplication);
        if (!isCurrentApp) return;

        if (!ui.leftPanelToggled) return;
        const { selectedSObject } = ui;
        if (!selectedSObject) return;

        const fullSObjectName = lowerCaseKey(fullApiName(selectedSObject, this.namespace));
        const describeEntry = getDescribeByName({
            describeState: describe,
            sobjectName: fullSObjectName,
            useToolingApi: ui?.currentTab?.useToolingApi === true,
        });
        if (!describeEntry) {
            return;
        }
        if (fullSObjectName !== this._selectedSObject) {
            // useToolingApi
            //console.log('fullSObjectName',fullSObjectName,describe.nameMap[fullSObjectName])
            this._selectedSObject = fullSObjectName;
            store.dispatch(
                SOBJECT.describeSObject({
                    connector: this.connector.conn,
                    sObjectName: this._selectedSObject,
                    useToolingApi: describeEntry.useToolingApi === true,
                })
            );
        }
        const sobjectState = SELECTORS.sobject.selectById(
            { sobject },
            lowerCaseKey(this._selectedSObject)
        );
        if (!sobjectState) return;
        this.isLoading = sobjectState.isFetching;
        // Assign Metadata
        if (sobjectState.data) {
            this.sobjectMeta = sobjectState.data;
        } /*  else if (sobjectState.error) {
            LOGGER.error(sobjectState.error);
            Toast.show({
                message: this.i18n.FIELDS_PANEL_FAILED_DESCRIBE_OBJ,
                errors: sobjectState.error,
            });
        } */
    }

    deselectSObject() {
        store.dispatch(UI.reduxSlice.actions.deselectSObject());
    }

    handleClosePanel() {
        // Close the whole side panel (not only go back to the SObject list)
        store.dispatch(UI.reduxSlice.actions.deselectSObject());
        store.dispatch(
            UI.reduxSlice.actions.updateLeftPanel({
                value: false,
                alias: this.alias,
            })
        );
    }

    /** Events */

    selectTab(event) {
        const tabId = event.target.dataset.id;
        this.tabs = this.tabs.map(tab => {
            return { ...tab, isActive: tab.id === tabId };
        });
    }

    setKeyword(event) {
        this.keyword = event.target.value;
    }

    handleMenuSelect(event) {
        switch (event.detail.value) {
            case 'select_all':
                store.dispatch(
                    UI.reduxSlice.actions.selectAllFields({ sObjectMeta: this.sobjectMeta })
                );
                break;
            case 'clear_all':
                store.dispatch(UI.reduxSlice.actions.clearAllFields());
                break;
            case 'sort_asc':
                store.dispatch(UI.reduxSlice.actions.sortFields({ sort: UI.SORT.ORDER.ASC }));
                break;
            case 'sort_desc':
                store.dispatch(UI.reduxSlice.actions.sortFields({ sort: UI.SORT.ORDER.DESC }));
                break;
            default:
                break;
        }
    }

    handleClear() {
        this.keyword = '';
    }

    /** Getters */

    get isDisplayClearButton() {
        return this.keyword !== '';
    }

    get isFieldsActive() {
        return !!this.tabs.find(tab => tab.id === 'tab-fields' && tab.isActive);
    }

    get isRelationshipsActive() {
        return !!this.tabs.find(tab => tab.id === 'tab-relationships' && tab.isActive);
    }
}
