import ToolkitElement from 'host-api/element';
import { store, connectStore, DESCRIBE } from 'host-api/store';
import { lowerCaseKey } from 'host-api/utils';
import { wire } from 'lwc';
import { getAllDescribeEntries } from '../describeResolver';
import { UI } from 'soql/slices';

import { SOBJECT_ICON } from './constants';

export default class SobjectsPanel extends ToolkitElement {
    sobjects;
    isLoading = false;
    selectedId = '';

    _rawSObjects;

    @wire(connectStore, { store })
    storeChange({ describe, application, ui }) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        this.selectedId = ui?.selectedSObject
            ? lowerCaseKey(
                  `${ui.selectedSObject}::${ui?.currentTab?.useToolingApi === true ? 'tooling' : 'standard'}`
              )
            : '';

        if (describe) {
            this.isLoading = describe.isFetching;
            if (describe.isFetching === false && describe.error == null) {
                this._rawSObjects = getAllDescribeEntries(describe).map((sobject: any) => ({
                    ...sobject,
                    itemLabel: `${sobject.name} (${sobject?.source === 'tooling' ? 'Tooling' : 'Standard'}) / ${sobject.label}`,
                }));
                this.sobjects = this._rawSObjects;
            }
        }
    }

    /** Events */

    handleTreeSelect(event) {
        const item = event.detail?.item;
        if (item?.rawName) {
            store.dispatch(
                UI.reduxSlice.actions.updateUseToolingApi({
                    value: item?.useToolingApi === true,
                    alias: this.alias,
                })
            );
            store.dispatch(UI.reduxSlice.actions.selectSObject({ sObjectName: item.rawName }));
        }
    }

    handleRefresh() {
        store.dispatch(
            DESCRIBE.describeSObjects({
                connector: this.connector.conn,
            })
        );
    }

    /** Getters */

    get computedTree() {
        if (!this.sobjects || !this.sobjects.length) {
            return [];
        }
        return this.sobjects
            .filter(sobject => sobject.queryable)
            .map(sobject => ({
                id: lowerCaseKey(`${sobject.name}::${sobject?.source || 'standard'}`),
                name: sobject.itemLabel,
                title: sobject.itemLabel,
                rawName: sobject.name,
                source: sobject?.source || 'standard',
                useToolingApi: sobject?.useToolingApi === true,
                icon: SOBJECT_ICON,
            }));
    }

    get sobjectSearchFields() {
        return ['name', 'id'];
    }

    get minSearchLength() {
        return 1;
    }
}
