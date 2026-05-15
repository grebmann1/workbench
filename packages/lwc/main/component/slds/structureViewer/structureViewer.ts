import ToolkitElement from 'core/toolkitElement';
import { api, track } from 'lwc';
import {
    isEmpty,
    isElectronApp,
    classSet,
    isUndefinedOrNull,
    isNotUndefinedOrNull,
    runActionAfterTimeOut,
    formatFiles,
    sortObjectsByField,
    removeDuplicates,
} from 'shared/utils';

export default class StructureViewer extends ToolkitElement {
    @track _record;
    @track items = [];
    @api linkMode = 'navigate';

    @api
    get record() {
        return this._record;
    }

    set record(value) {
        this._record = value;
        this.formatTree(value);
    }

    /** Events **/

    expandAll = e => {
        const items = this.template.querySelectorAll('slds-structure-viewer-item');
        for (let i = 0; i < items.length; i++) {
            items[i].expandAll();
        }
    };

    collapseAll = e => {
        const items = this.template.querySelectorAll('slds-structure-viewer-item');
        for (let i = 0; i < items.length; i++) {
            items[i].collapseAll();
        }
    };

    /** Methods **/

    formatTree = record => {
        //const name = record.Name || record.DeveloperName || record.MasterLabel || 'Result';
        this.items = Object.keys(record).map(key => ({ key, value: record[key] }));
    };
}
