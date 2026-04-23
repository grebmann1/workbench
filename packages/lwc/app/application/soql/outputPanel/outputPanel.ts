import { LightningElement, wire, api } from 'lwc';
import Toast from 'lightning/toast';
import ToolkitElement from 'core/toolkitElement';
import {
    reportError,
    store,
    connectStore,
    SELECTORS,
    DESCRIBE,
    SOBJECT,
    UI,
    QUERY,
} from 'core/store';
import { isNotUndefinedOrNull, lowerCaseKey } from 'shared/utils';
import moment from 'moment';

export default class OutputPanel extends ToolkitElement {
    response: Record<string, any> | null = null;
    sobjectName: string | null = null;
    childResponse: Record<string, any> | null = null;
    childSobjectName: string | null = null;
    isLoading = false;
    _loadingMessage: string | null = null;
    _loadingInterval: ReturnType<typeof setInterval> | null = null;

    error_title: string | null = null;
    error_message: string | null = null;
    currentTab: Record<string, any> | null = null;
    currentChildRecordId: string | null = null;

    @api tableSearch = '';

    _pendingEditCount = 0;
    _isSavingPendingEdits = false;

    @wire(connectStore, { store })
    storeChange({ query, ui, application }: { query: any; ui: any; application: any }) {
        const isCurrentApp = this.verifyIsActive(application.currentApplication);
        if (!isCurrentApp) return;
        const queryState = SELECTORS.queries.selectById({ query }, lowerCaseKey(ui.currentTab?.id));
        // Pending inline edits for the active tab.
        const tabId = ui?.currentTab?.id;
        const tabBucket = (tabId && ui?.pendingEdits?.[tabId]) || {};
        this._pendingEditCount = Object.values(tabBucket).reduce(
            (acc: number, entry: any) => acc + Object.keys(entry?.changes || {}).length,
            0
        );
        this._isSavingPendingEdits = !!ui?.pendingEditsSaving;
        // Tab Processing
        if (ui.currentTab && ui.currentTab.id != this.currentTab?.id) {
            this.currentTab = ui.currentTab;
            this.resetError();
        }

        if (queryState) {
            this.isLoading = queryState.isFetching;
            // loading Message
            if (this.isLoading) {
                this.enableAutoDate(queryState.createdDate);
            } else {
                if (this._loadingInterval) clearInterval(this._loadingInterval);
            }

            // Response Processing
            if (queryState.error) {
                this.handleError(queryState.error);
                this.response = null;
            } else if (queryState.data && this.response !== queryState.data) {
                this.resetError();
                this.response = queryState.data;
                this.sobjectName = queryState.sobjectName;
                // Apply selection when new data arrives
                this.applySelectedRows(ui.currentTab?.selectedRecordIds);
            } else if (queryState.isFetching) {
                this.response = null;
                this.resetError();
            }
        } else {
            this.response = null;
            this.isLoading = false;
            if (this._loadingInterval) clearInterval(this._loadingInterval);
        }
        this.childResponse = ui.currentTab.childRelationship;
        if (this.childResponse) {
            this.childSobjectName = this.childResponse.column;
            this.selectMainTable(this.childResponse.recordId);
        }
        // Keep selection in sync when only selection changes
        //this.applySelectedRows(ui.currentTab?.selectedRecordIds);
    }

    formatDate = (createdDate: string | number | Date): void => {
        //console.log('formatDate');
        this._loadingMessage = `Running for ${moment().diff(
            moment(createdDate),
            'seconds'
        )} seconds`;
    };

    enableAutoDate = (createdDate: string | number | Date): void => {
        if (this._loadingInterval) clearInterval(this._loadingInterval);
        this.formatDate(createdDate);
        this._loadingInterval = setInterval(() => {
            this.formatDate(createdDate);
        }, 1000);
    };

    closeChildRelationship() {
        this.selectMainTable(null);
        store.dispatch(UI.reduxSlice.actions.deselectChildRelationship());
    }

    selectMainTable = (recordId: string | null): void => {
        const _tableInstance = this.refs.maintable?.tableInstance;
        if (_tableInstance) {
            //_tableInstance.deselectRow();
            _tableInstance
                .getRows()
                .filter(row => row.getElement().classList.contains('tabulator-highlight-row'))
                .forEach(row => {
                    row.getElement().classList.remove('tabulator-highlight-row');
                });

            _tableInstance
                .getRows()
                .filter(row => isNotUndefinedOrNull(recordId) && recordId === row.getData().Id)
                .forEach(row => {
                    row.getElement().classList.add('tabulator-highlight-row');
                });
            //_tableInstance.selectRow(_tableInstance.getRows().filter(row => row.getData().Id === this.childResponse.recordId));
            //this.refs.maintable.tableResize(0);
        }
        this.currentChildRecordId = recordId;
    };

    handleTableBuilt = () => {
        this.selectMainTable(this.currentChildRecordId);
        // Apply selection after table is built
        const { ui } = store.getState();
        this.applySelectedRows(ui.currentTab?.selectedRecordIds);
    };

    applySelectedRows = (selectedIds: string[] | null | undefined): void => {
        const table = this.refs.maintable?.tableInstance;
        if (!table) return;
        try {
            // Deselect all rows first
            table.deselectRow();
            if (!Array.isArray(selectedIds) || selectedIds.length === 0) return;
            const rows = table.getRows();
            const targetRows = rows.filter(row => selectedIds.includes(row.getData().Id));
            if (targetRows.length > 0) table.selectRow(targetRows);
        } catch (e) {
            // no-op
        }
    };

    handleError = (e: any): void => {
        reportError(e, { source: 'soql' });
        let errors = e.message.split(':');
        if (errors.length > 1) {
            this.error_title = errors.shift();
        } else {
            this.error_title = 'Error';
        }
        this.error_message = errors.join(':');
    };

    resetError = (): void => {
        this.error_title = null;
        this.error_message = null;
    };

    /** Getters */

    @api
    get columns() {
        return this.refs.maintable?.columns;
    }

    get hasError() {
        return isNotUndefinedOrNull(this.error_message);
    }

    get isResponseTableDisplayed() {
        return !this.hasError && this.response;
    }

    get childRelationshipPanelClass() {
        return this.childResponse
            ? 'child-relationship-panel slds-height-30'
            : 'child-relationship-panel';
    }

    get childRelationshipPanelClass() {
        return this.childResponse
            ? 'child-relationship-panel slds-height-30'
            : 'child-relationship-panel';
    }

    get mainOutputClass() {
        return this.childResponse ? 'main-output slds-height-70' : 'main-output slds-full-height';
    }

    /** Inline edits toolbar */

    get hasPendingEdits() {
        return this._pendingEditCount > 0;
    }

    get pendingEditsLabel() {
        const n = this._pendingEditCount;
        return `${n} unsaved ${n === 1 ? 'change' : 'changes'}`;
    }

    get saveLabel() {
        const n = this._pendingEditCount;
        return n > 0 ? `Save ${n} ${n === 1 ? 'change' : 'changes'}` : 'Save';
    }

    get isSavingPendingEdits() {
        return this._isSavingPendingEdits;
    }

    handleSaveEdits = async () => {
        const { application, ui } = store.getState() as any;
        const connector = application?.connector;
        const tabId = ui?.currentTab?.id;
        if (!connector || !tabId) return;
        let action: any;
        try {
            action = await store.dispatch(UI.saveAllPendingEdits({ connector, tabId }) as any);
        } catch (e: any) {
            // The thunk itself catches per-batch errors, but surface anything
            // unexpected (e.g. a bug in the reducer path) to the user instead
            // of leaving the toolbar in a stuck "saving" state silently.
            Toast.show({
                label: 'Unable to save changes',
                message: e?.message || 'An unexpected error occurred.',
                variant: 'error',
                mode: 'sticky',
            });
            return;
        }
        const payload = action?.payload || {};
        const successCount = Object.keys(payload.successByKey || {}).length;
        const errorEntries = Object.entries(payload.errorByKey || {}) as Array<
            [string, { message: string; statusCode?: string }]
        >;
        if (successCount > 0) {
            Toast.show({
                label: `${successCount} record${successCount === 1 ? '' : 's'} updated`,
                variant: 'success',
            });
        }
        if (errorEntries.length > 0) {
            const [, firstErr] = errorEntries[0];
            const firstLine = firstErr?.statusCode
                ? `${firstErr.statusCode}: ${firstErr.message}`
                : firstErr?.message || 'Salesforce rejected the update.';
            const suffix =
                errorEntries.length > 1
                    ? `\n(+ ${errorEntries.length - 1} other record${errorEntries.length - 1 === 1 ? '' : 's'} failed. Hover the red cells for details.)`
                    : '';
            Toast.show({
                label: `Failed to save ${errorEntries.length} record${errorEntries.length === 1 ? '' : 's'}`,
                message: firstLine + suffix,
                variant: 'error',
                mode: 'sticky',
            });
        }
    };

    handleDiscardEdits = () => {
        const { ui } = store.getState() as any;
        const tabId = ui?.currentTab?.id;
        if (!tabId) return;
        store.dispatch(UI.reduxSlice.actions.clearEditsForTab({ tabId }));
    };
}
