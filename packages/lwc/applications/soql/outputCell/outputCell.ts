import { store, SHELL } from 'host-api/store';
import { isUndefinedOrNull, isObject } from 'host-api/utils';
import Toast from 'lightning/toast';
import { LightningElement, api, wire } from 'lwc';
import { navigate, NavigationContext } from 'lwr/navigation';
import { UI } from 'soql/slices';

export default class OutputCell extends LightningElement {
    @wire(NavigationContext)
    navContext;

    @api value;
    @api column;
    @api recordId;

    /** Events */

    handleClick() {
        //console.log('handleClick');
        //const records =
        const _cloned = {
            recordId: this.recordId,
            column: this.column,
            ...JSON.parse(JSON.stringify(this.value)),
        };

        store.dispatch(
            UI.reduxSlice.actions.selectChildRelationship({ childRelationship: _cloned })
        );
    }

    handle_copyClick = e => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(this.value);
        Toast.show({
            label: `${this.column} exported to your clipboard`,
            variant: 'success',
        });
    };

    handle_editClick = e => {
        const params = {
            type: 'application',
            state: {
                applicationName: 'recordviewer',
                recordId: this.recordId,
            },
        };
        navigate(this.navContext, params);
    };

    handle_viewLookupClick = e => {
        e.preventDefault();
        e.stopPropagation();
        const params = {
            type: 'application',
            state: {
                applicationName: 'recordviewer',
                recordId: this.value,
            },
        };
        navigate(this.navContext, params);
    };

    handleRedirection = e => {
        e.preventDefault();
        e.stopPropagation();
        store.dispatch(SHELL.reduxSlice.actions.navigate({ target: this.value }));
    };

    /** Getters */

    get isRecordIdField() {
        return this.column === 'Id';
    }

    get isLookupField() {
        return !isUndefinedOrNull(this.url) && !this.isRecordIdField;
    }

    get formattedValue() {
        return isObject(this.value) ? null : this.value;
    }

    get isNotEmpty() {
        return !isUndefinedOrNull(this.value);
    }

    get formattedTotalSize() {
        return `${
            Array.isArray(this.value)
                ? this.value.length
                : isObject(this.value)
                  ? this.value.totalSize
                  : 0
        } records`;
    }

    get isChildRelationship() {
        return this.value && isObject(this.value); //this.value.rawData && this.value.rawData.totalSize;
    }

    get url() {
        if (!/^[0-9A-Za-z]{18}$/.test(this.formattedValue)) return null;
        return this.formattedValue;
    }

    get isDataDisplayed() {
        return isUndefinedOrNull(this.url);
    }
}
