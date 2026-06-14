import Analytics from 'host-api/analytics';
import { SaveModal, CATEGORY_STORAGE } from 'host-api/builder';
import { registerCommand } from 'host-api/commands';
import type { ConnectionLike } from 'host-api/connector';
import ToolkitElement from 'host-api/element';
import LOGGER from 'host-api/logger';
import {
    store,
    injectReducer,
    connectStore,
    SELECTORS,
    DESCRIBE,
    DOCUMENT,
    APPLICATION,
} from 'host-api/store';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';
import {
    guid,
    guidFromHash,
    isNotUndefinedOrNull,
    isUndefinedOrNull,
    fullApiName,
    compareString,
    lowerCaseKey,
    getFieldValue,
    isObject,
    arrayToMap,
    extractErrorDetailsFromQuery,
    shortFormatter,
    isEmpty,
} from 'host-api/utils';
import LightningConfirm from 'lightning/confirm';
import Toast from 'lightning/toast';
import { api, wire, track } from 'lwc';
import { CurrentPageReference, NavigationContext, generateUrl, navigate } from 'lwr/navigation';
import moment from 'moment';
import PerformanceModal from 'soql/performanceModal';
import { getDescribeByName, getDescribeByPrefix } from '../describeResolver';
import { UI, QUERY } from 'soql/slices';
import { querySelectors } from 'soql/slices/query';

import { confirmDiscardPendingEdits, escapeCsvValue, formatQueryWithComment } from './util';

// Slice + command wiring for SOQL. Runs once when the SOQL bundle is
// first imported — subsequent mounts are idempotent (injectReducer replaces,
// registerCommand replaces). Kept at module scope rather than in
// connectedCallback so dispatches in `connectedCallback` below (e.g.
// loadCacheSettings) find the reducers already installed.
let _soqlBootstrapped = false;
function bootstrapSoqlExtension() {
    if (_soqlBootstrapped) return;
    _soqlBootstrapped = true;
    injectReducer('ui', UI.reduxSlice.reducer);
    injectReducer('query', QUERY.reduxSlice.reducer);

    registerCommand('soql.hasTab', (payload: { tabId: string }) => {
        const { ui } = store.getState() as any;
        return Array.isArray(ui?.tabs) && ui.tabs.some((t: any) => t.id === payload?.tabId);
    });

    registerCommand('soql.selectTab', (payload: { tabId: string }) =>
        store.dispatch(UI.reduxSlice.actions.selectionTab({ id: payload.tabId }))
    );

    // Zero-arg "open the SOQL app" — backs the `/soql` slash command.
    // Navigates to the SOQL route without touching tab state, so the user
    // lands on whatever tab they last had open.
    registerCommand('soql.open', () => {
        const target = `sftoolkit:${JSON.stringify({
            type: 'application',
            state: { applicationName: 'soql' },
        })}`;
        return legacyStore.dispatch(legacyStore_application.navigate(target));
    });

    registerCommand(
        'soql.openOrSelectTab',
        (payload: { tabId: string; isNewTab: boolean; body: string }) => {
            if (payload.isNewTab) {
                return store.dispatch(
                    UI.reduxSlice.actions.addTab({
                        tab: { id: payload.tabId, body: payload.body },
                    })
                );
            }
            store.dispatch(UI.reduxSlice.actions.selectionTab({ id: payload.tabId }));
            return store.dispatch(UI.reduxSlice.actions.updateSoql({ soql: payload.body }));
        }
    );

    registerCommand('soql.executeQuery', async (payload: any) => {
        const res: any = await store.dispatch(
            QUERY.executeQuery({
                connector: payload.connector,
                soql: payload.soql,
                rawSoql: payload.rawSoql,
                tabId: payload.tabId,
                createdDate: Date.now(),
                useToolingApi: payload.useToolingApi,
                includeDeletedRecords: payload.includeDeletedRecords,
            } as any)
        );
        return { payload: res.payload, error: res.error };
    });

    registerCommand('soql.executeQueryIncognito', async (payload: any) => {
        const res: any = await store.dispatch(
            QUERY.executeQueryIncognito({
                connector: payload.connector,
                soql: payload.soql,
                tabId: payload.tabId,
                useToolingApi: payload.useToolingApi,
                includeDeletedRecords: payload.includeDeletedRecords,
            } as any)
        );
        return { payload: res.payload, error: res.error };
    });
}

bootstrapSoqlExtension();

export default class App extends ToolkitElement {
    // used to controle store of childs
    isActive = false;
    isLoading = false;
    isDownloading = false;
    isDownloadCanceled = false;

    @track selectedSObject: string | null = null;
    @track isLeftToggled = true;
    @track isRecentToggled = false;
    @api namespace: string | null = null;

    @track recentQueries: Array<Record<string, any>> = [];
    @track savedQueries: Array<Record<string, any>> = [];

    @track selectedRecords: Array<Record<string, any>> = [];
    @track selectedChildRecords: Array<Record<string, any>> = [];

    soql: string | null = null;
    _useToolingApi: boolean | null = null;
    sobjectPrefixMapping: Record<string, any> | null = null;

    // Response
    _response: Record<string, any> | null = null;
    _responseCreatedDate: string | number | Date | null = null;
    _responseCreatedDateFormatted: string | null = null;
    _responseNextRecordsUrl: string | null = null;
    _responseRows: Array<Record<string, any>> | null = null;
    _sobject: Record<string, any> | null = null;
    _interval: ReturnType<typeof setInterval> | null = null;
    _isFetchingMore = false;

    // Aborting
    _abortingMap: Record<string, any> = {};
    _displayStopButton = false;

    //
    querySet = new Set<string>();

    connectedCallback() {
        Analytics.trackAppOpen('soql', { alias: this.alias });
        store.dispatch(
            DESCRIBE.describeSObjects({
                connector: this.connector.conn,
            })
        );
        //this.sobjectPrefixMapping = this.generatePrefixMapping();
        //store.dispatch(QUERY.reduxSlice.actions.dummyData());

        if (this.alias) {
            store.dispatch((dispatch, getState) => {
                dispatch(
                    DOCUMENT.reduxSlices.QUERYFILE.actions.loadFromStorage({
                        alias: this.alias,
                    })
                );
                dispatch(
                    UI.reduxSlice.actions.loadCacheSettings({
                        alias: this.alias,
                        queryFiles: getState().queryFiles,
                    })
                );
            });
        }
        this.enableAutoDate();
    }

    disconnectedCallback() {
        clearInterval(this._interval);
    }

    _hasRendered = false;
    renderedCallback() {
        if (!this._hasRendered) {
            this._hasRendered = true;
            this.loadFromNavigation(this._pageRef);
        }
    }

    _pageRef: any;
    @wire(CurrentPageReference)
    handleNavigation(pageRef: any) {
        if (isUndefinedOrNull(pageRef)) return;
        if (JSON.stringify(this._pageRef) == JSON.stringify(pageRef)) return;

        this._pageRef = pageRef;
        if (this._hasRendered) {
            this.loadFromNavigation(pageRef);
        }
        //  this.loadFromNavigation(pageRef);
        //('this._hasRendered',this._hasRendered);
    }

    loadFromNavigation = async (pageRef: any): Promise<void> => {
        const { state } = pageRef;
        // Use state.query to force a specific query to be loaded !
        if (isNotUndefinedOrNull(state.query)) {
            const _guid = guidFromHash(state.query);
            const { ui } = store.getState() as any;
            const existingTab = ui.tabs.find(x => x.id === _guid);
            if (existingTab) {
                store.dispatch(UI.reduxSlice.actions.selectionTab(existingTab));
            } else {
                store.dispatch(
                    UI.reduxSlice.actions.addTab({
                        tab: {
                            id: _guid,
                            body: state.query,
                        },
                    })
                );
            }

            // Remove query from url
            const searchParams = new URLSearchParams(window.location.search);
            searchParams.delete('query'); // Remove the 'query' parameter
            // Update the URL without reloading the page
            window.history.replaceState(
                {},
                '',
                `${window.location.origin}${window.location.pathname}?${searchParams.toString()}`
            );
        }
    };

    @wire(connectStore, { store })
    storeChange({
        query,
        ui,
        describe,
        queryFiles,
        recents,
        application,
    }: {
        query: any;
        ui: any;
        describe: any;
        queryFiles: any;
        recents: any;
        application: any;
    }) {
        const isCurrentApp = this.verifyIsActive(application.currentApplication);
        if (!isCurrentApp) return;

        if (ui && this._useToolingApi != (ui.currentTab?.useToolingApi === true)) {
            this._useToolingApi = ui.currentTab?.useToolingApi === true;
        }
        this.isLeftToggled = ui.leftPanelToggled;
        this.isRecentToggled = ui.recentPanelToggled;
        this.soql = ui.soql;

        const fullSObjectName = ui.selectedSObject
            ? lowerCaseKey(fullApiName(ui.selectedSObject, this.namespace))
            : null;
        if (
            fullSObjectName &&
            isNotUndefinedOrNull(
                getDescribeByName({
                    describeState: describe,
                    sobjectName: fullSObjectName,
                    useToolingApi: ui?.currentTab?.useToolingApi === true,
                })
            )
        ) {
            this.selectedSObject = fullSObjectName;
        } else {
            this.selectedSObject = null;
        }
        /** Responses */

        const queryState = querySelectors.selectById({ query }, lowerCaseKey(ui.currentTab?.id));
        if (queryState) {
            if (queryState.error) {
                this._abortingMap[ui.currentTab.id] = null; // Reset the abortingMap
                this._displayStopButton = false;
                this.resetResponse();
            } else if (queryState.data) {
                this._response = queryState.data;
                this._responseCreatedDate = queryState.createdDate;
                this._responseNextRecordsUrl = queryState.data.nextRecordsUrl;
                this._responseRows = queryState.data.records;
                this._isFetchingMore = queryState.isFetchingMore === true;
                this._abortingMap[ui.currentTab.id] = null; // Reset the abortingMap
                this._displayStopButton = false;
                this._sobject = getDescribeByName({
                    describeState: describe,
                    sobjectName: queryState.sobjectName,
                    useToolingApi:
                        queryState?.useToolingApi === true
                            ? true
                            : ui?.currentTab?.useToolingApi === true,
                });
                this.formatDate();
            } else if (queryState.isFetching) {
                this._displayStopButton = true;
                this.resetResponse();
            } else {
                // For queryExplain as i am reusing the same redux and it doesn't contain any data
                // TODO: Improve this for performances
                this._displayStopButton = false;
            }
        } else {
            this.resetResponse();
        }

        /** Recent Queries */
        if (recents && recents.queries) {
            this.recentQueries = recents.queries.map((query, index) => {
                return { id: `${index}`, content: query };
            });
        }

        /** Saved Queries */
        if (queryFiles) {
            const entities = SELECTORS.queryFiles.selectAll({ queryFiles });
            this.savedQueries = entities
                .filter(item => item.isGlobal || item.alias == this.alias)
                .map((item, index) => {
                    return item; // no mutation for now
                });
        }
    }

    resetResponse = () => {
        this._response = null;
        this._responseCreatedDate = null;
        this._responseNextRecordsUrl = null;
        this._responseRows = null;
        this._sobject = null;
        this._isFetchingMore = false;
    };

    formatDate = () => {
        this._responseCreatedDateFormatted = this._responseCreatedDate
            ? moment(this._responseCreatedDate).fromNow()
            : null;
    };

    enableAutoDate = () => {
        this.formatDate();
        this._interval = setInterval(() => {
            this.formatDate();
        }, 30000);
    };

    getEffectiveUseToolingApi = (sobjectName, ui, describe) => {
        if (ui?.currentTab?.useToolingApi === true) {
            return true;
        }
        return (
            getDescribeByName({
                describeState: describe,
                sobjectName,
                useToolingApi: false,
            })?.useToolingApi === true
        );
    };

    deleteRecords = async (sobject, records) => {
        if (isUndefinedOrNull(sobject)) return [];
        const connector: ConnectionLike = sobject.useToolingApi
            ? this.connector.conn.tooling
            : this.connector.conn;
        const ret = await connector.sobject(sobject.name).delete(records.map(x => x.Id));
        // jsforce returns a single object when one id is passed, an array otherwise.
        return Array.isArray(ret) ? ret : [ret];
    };

    /** Events **/

    handleLeftToggle = e => {
        store.dispatch(
            UI.reduxSlice.actions.updateLeftPanel({
                value: !this.isLeftToggled,
                alias: this.alias,
            })
        );
    };

    handleRecentToggle = e => {
        store.dispatch(
            UI.reduxSlice.actions.updateRecentPanel({
                value: !this.isRecentToggled,
                alias: this.alias,
            })
        );
    };

    handlePerformanceCheckClick = async e => {
        try {
            const { ui, describe } = store.getState() as any;
            const effectiveUseToolingApi = this.getEffectiveUseToolingApi(
                this.selectedSObject,
                ui,
                describe
            );
            //this.isLoading = true;
            const result = await store
                .dispatch(
                    QUERY.explainQuery({
                        connector: this.connector,
                        soql: formatQueryWithComment(this.soql),
                        tabId: ui.currentTab.id,
                        useToolingApi: effectiveUseToolingApi,
                    })
                )
                .unwrap();
            //this.isLoading = false;
            const plans = result.data.plans;
            PerformanceModal.open({ plans });
        } catch (e) {
            // handle error here
            console.error('error', e);

            //this.isLoading = false;
        }
    };

    executeAction = async e => {
        const isAllRows = false;
        const inputEl = this.refs?.editor?.editor?.currentModel;
        if (!inputEl) return;
        const query = inputEl.getValue();
        if (!query) return;

        const { ui, describe } = store.getState() as any;
        const effectiveUseToolingApi = this.getEffectiveUseToolingApi(
            this.selectedSObject,
            ui,
            describe
        );
        // Block running a new query when the current tab has unsaved inline edits.
        if (!(await confirmDiscardPendingEdits(ui, ui.currentTab?.id))) return;
        // Clear current tab selection before running a new query
        store.dispatch(UI.reduxSlice.actions.updateTabSelection({ selectedRecordIds: [] }));
        store.dispatch(UI.reduxSlice.actions.deselectChildRelationship());
        const queryPromise = store.dispatch(
            QUERY.executeQuery({
                connector: this.connector,
                soql: formatQueryWithComment(query),
                rawSoql: query,
                tabId: ui.currentTab.id,
                sobjectName: this.selectedSObject,
                isAllRows,
                createdDate: Date.now(),
                useToolingApi: effectiveUseToolingApi,
                includeDeletedRecords: ui.includeDeletedRecords || false,
            })
        );
        this._abortingMap[ui.currentTab.id] = queryPromise;
    };

    handleAbortClick = e => {
        const { ui } = store.getState() as any;
        const queryPromise = this._abortingMap[ui.currentTab.id];
        if (queryPromise) {
            queryPromise.abort();
        }
    };

    handleLoadMore = () => this._loadMore(false);

    handleLoadAll = () => this._loadMore(true);

    _loadMore = (loadAll: boolean) => {
        if (this._isFetchingMore || !this._responseNextRecordsUrl) return;
        const { ui } = store.getState() as any;
        store.dispatch(
            QUERY.loadMoreRecords({
                connector: this.connector,
                tabId: ui.currentTab.id,
                loadAll,
            }) as any
        );
    };

    handleSaveClick = () => {
        const { ui } = store.getState() as any;
        const file = ui.currentTab.fileId
            ? SELECTORS.queryFiles.selectById(store.getState(), lowerCaseKey(ui.currentTab.fileId))
            : null;
        SaveModal.open({
            title: 'Save Query',
            _file: file,
        }).then(async data => {
            if (isUndefinedOrNull(data)) return;

            const { name, isGlobal, folder, tags } = data;
            store.dispatch(async (dispatch, getState) => {
                await dispatch(
                    DOCUMENT.reduxSlices.QUERYFILE.actions.upsertOne({
                        id: name, // generic
                        isGlobal, // generic
                        content: this.soql,
                        alias: this.alias,
                        extra: {
                            useToolingApi: this._useToolingApi === true, // Needed for queries
                            folder,
                            tags,
                        },
                    })
                );
                await dispatch(
                    UI.reduxSlice.actions.linkFileToTab({
                        fileId: name,
                        alias: this.alias,
                        queryFiles: getState().queryFiles,
                    })
                );
            });

            // Reset draft
        });
    };

    handleClearTabs = () => {
        store.dispatch(
            UI.reduxSlice.actions.clearTabs({
                alias: this.alias,
            })
        );
    };

    handleCancelDownloadClick = () => {
        this.isDownloadCanceled = true;
    };

    executeSave = e => {
        e.stopPropagation();
        const { ui } = store.getState() as any;
        const file = ui.currentTab.fileId
            ? SELECTORS.queryFiles.selectById(store.getState(), lowerCaseKey(ui.currentTab.fileId))
            : null;
        if (isNotUndefinedOrNull(file)) {
            // Existing file
            store.dispatch(async (dispatch, getState) => {
                await dispatch(
                    DOCUMENT.reduxSlices.QUERYFILE.actions.upsertOne({
                        ...file,
                        content: this.soql,
                    })
                );
                await dispatch(
                    UI.reduxSlice.actions.linkFileToTab({
                        fileId: file.id,
                        alias: file.alias,
                        queryFiles: getState().queryFiles,
                    })
                );
            });
        } else {
            // New File
            this.handleSaveClick();
        }
    };

    handleRowSelection = e => {
        const { rows, isChildTable } = e.detail;
        if (isChildTable) {
            this.selectedChildRecords = rows;
        } else {
            this.selectedRecords = rows;
            try {
                const ids = Array.isArray(rows) ? rows.map(x => x.Id).filter(Boolean) : [];
                store.dispatch(
                    UI.reduxSlice.actions.updateTabSelection({ selectedRecordIds: ids })
                );
            } catch (e) {
                // no-op
            }
        }
    };

    deleteSelectedRecords = async e => {
        const { describe, ui } = store.getState() as any;
        const customMessages = [];
        let _sobject, _sobjectChild;
        const selectedIds = Array.isArray(ui.currentTab.selectedRecordIds)
            ? ui.currentTab.selectedRecordIds
            : [];
        if (selectedIds.length > 0) {
            const _firstId = selectedIds[0];
            // Verify if the Id is included
            if (isUndefinedOrNull(_firstId)) {
                Toast.show({
                    label: 'Error during deletion',
                    message: 'You need to provide the Record Id',
                    variant: 'error',
                    mode: 'sticky',
                });
                return;
            }
            _sobject = getDescribeByPrefix({
                describeState: describe,
                idPrefix: _firstId.substr(0, 3),
                useToolingApi: ui?.currentTab?.useToolingApi === true,
            });
            if (_sobject) {
                customMessages.push(
                    `${selectedIds.length} ${
                        selectedIds.length == 1 ? _sobject.label : _sobject.labelPlural
                    }`
                );
            }
        }
        /*if(this.selectedChildRecords.length > 0){
            const _item = this.selectedChildRecords[0];
            _sobjectChild = describe.prefixMap[_item.Id.substr(0,3)];
            if(_sobjectChild){
                customMessages.push(`${this.selectedChildRecords.length} ${this.selectedChildRecords.length == 1 ? _sobjectChild.label:_sobjectChild.labelPlural}`)
            }
        }*/
        const params = {
            variant: 'header',
            theme: 'error',
            message: `Are you sure you want to delete the selected records (${customMessages.join(
                ' & '
            )})? This action cannot be undone.`,
            label: 'Confirm Deletion',
        };
        if (!(await LightningConfirm.open(params))) return;
        store.dispatch(APPLICATION.reduxSlice.actions.startLoading());

        const deletedRecordIds = new Set<string>();
        const errorMessages: string[] = [];
        try {
            const retParent = await this.deleteRecords(
                _sobject,
                selectedIds.map(id => ({ Id: id }))
            );
            retParent.forEach((ret, idx) => {
                if (ret?.success) {
                    deletedRecordIds.add(ret.id || selectedIds[idx]);
                    return;
                }
                // jsforce SaveResult errors: [{ statusCode, message, fields }]
                const errs = Array.isArray(ret?.errors)
                    ? ret.errors
                    : ret?.errors
                      ? [ret.errors]
                      : [];
                const first = errs[0] || {};
                const code = first.statusCode || first.errorCode;
                const msg =
                    first.message ||
                    first.content ||
                    'Salesforce rejected the delete (no message returned).';
                errorMessages.push(code ? `${code}: ${msg}` : msg);
            });
        } catch (err: any) {
            // Batch-level failure (network, invalid session, no connection).
            // Surface it, don't leave the UI stuck in loading.
            const code = err?.errorCode || err?.name;
            const msg = err?.message || 'Unable to reach Salesforce.';
            Toast.show({
                label: 'Error during deletion',
                message: code ? `${code}: ${msg}` : msg,
                variant: 'error',
                mode: 'sticky',
            });
            store.dispatch(APPLICATION.reduxSlice.actions.stopLoading());
            return;
        }

        if (errorMessages.length > 0) {
            const suffix =
                errorMessages.length > 1
                    ? `\n(+ ${errorMessages.length - 1} other record${errorMessages.length - 1 === 1 ? '' : 's'} failed.)`
                    : '';
            Toast.show({
                label: `Failed to delete ${errorMessages.length} record${errorMessages.length === 1 ? '' : 's'}`,
                message: errorMessages[0] + suffix,
                variant: 'error',
                mode: 'sticky',
            });
        }
        if (deletedRecordIds.size > 0) {
            Toast.show({
                label: 'Successful Deletion',
                message: `${deletedRecordIds.size} record(s) were deleted successfully.`,
                variant: 'success',
                mode: 'dismissible',
            });
            // Discard any pending inline edits for records that no longer exist,
            // otherwise the Save N changes toolbar stays lit with ghost rows.
            const tabId = ui.currentTab.id;
            const tabEdits = (store.getState() as any).ui?.pendingEdits?.[tabId] || {};
            Object.values(tabEdits).forEach((entry: any) => {
                if (entry && deletedRecordIds.has(entry.recordId)) {
                    store.dispatch(
                        UI.reduxSlice.actions.clearEditsForRecord({
                            tabId,
                            sobjectType: entry.sobjectType,
                            recordId: entry.recordId,
                        })
                    );
                }
            });
        }
        store.dispatch(
            QUERY.reduxSlice.actions.deleteRecords({
                deletedRecordIds: [...deletedRecordIds],
                tabId: ui.currentTab.id,
            })
        );
        // Clear selection for current tab after deletion (only rows that were actually removed).
        const remainingSelection = selectedIds.filter(id => !deletedRecordIds.has(id));
        store.dispatch(
            UI.reduxSlice.actions.updateTabSelection({ selectedRecordIds: remainingSelection })
        );
        this.selectedRecords = this.selectedRecords.filter(
            r => !deletedRecordIds.has(r?.Id || r?.id)
        );
        store.dispatch(APPLICATION.reduxSlice.actions.stopLoading());
    };

    /** Copy & Download */

    copyCSV = async e => {
        this.isDownloading = true;
        this.isDownloadCanceled = false;
        try {
            const data = await this.generateCsv();
            navigator.clipboard.writeText(data);
            Toast.show({
                label: `CSV exported to your clipboard`,
                variant: 'success',
            });
        } catch (e) {
            console.error(e);
            Toast.show({
                label: this.i18n.OUTPUT_PANEL_FAILED_EXPORT_CSV,
                errors: e,
                variant: 'error',
                mode: 'dismissible',
            });
        }
        this.isDownloading = false;
    };

    copyExcel = async e => {
        this.isDownloading = true;
        this.isDownloadCanceled = false;
        try {
            const data = await this.generateCsv('\t');
            navigator.clipboard.writeText(data);
            Toast.show({
                label: `Excel exported to your clipboard`,
                variant: 'success',
            });
            this.isDownloading = false;
        } catch (e) {
            console.error(e);
            Toast.show({
                label: this.i18n.OUTPUT_PANEL_FAILED_EXPORT_EXCEL,
                errors: e,
                variant: 'error',
                mode: 'dismissible',
            });
        }
    };

    copyJSON = async e => {
        this.isDownloading = true;
        this.isDownloadCanceled = false;
        try {
            await this._fetchSubsequentRecords(this._responseNextRecordsUrl);
            navigator.clipboard.writeText(JSON.stringify(this._responseRows, null, 4));
            Toast.show({
                label: `JSON exported to your clipboard`,
                variant: 'success',
            });
        } catch (e) {
            console.error(e);
            Toast.show({
                label: this.i18n.OUTPUT_PANEL_FAILED_EXPORT_JSON,
                errors: e,
                variant: 'error',
                mode: 'dismissible',
            });
        }
        this.isDownloading = false;
    };

    downloadCSV = async e => {
        this.isDownloading = true;
        this.isDownloadCanceled = false;
        try {
            const data = await this.generateCsv(',');
            const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
            const blob = new Blob([bom, data], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const download = document.createElement('a');
            download.href = window.URL.createObjectURL(blob);
            download.download = `${this.sobjectPlurialLabel}.csv`;
            download.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            Toast.show({
                label: this.i18n.OUTPUT_PANEL_FAILED_EXPORT_CSV,
                errors: e,
                variant: 'error',
                mode: 'dismissible',
            });
        }
        this.isDownloading = false;
    };

    downloadJSON = async e => {
        this.isDownloading = true;
        this.isDownloadCanceled = false;
        try {
            await this._fetchSubsequentRecords(this._responseNextRecordsUrl);
            const blob = new Blob([JSON.stringify(this._responseRows, null, 4)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const download = document.createElement('a');
            download.href = window.URL.createObjectURL(blob);
            download.download = `${this.sobjectPlurialLabel}.json`;
            download.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            Toast.show({
                label: this.i18n.OUTPUT_PANEL_FAILED_EXPORT_JSON,
                errors: e,
                variant: 'error',
                mode: 'dismissible',
            });
        }
        this.isDownloading = false;
    };

    async generateCsv(separator) {
        await this._fetchSubsequentRecords(this._responseNextRecordsUrl);
        const header = this.refs.output.columns.join(separator);
        const data = this._responseRows
            .map(row => {
                return this.refs.output.columns
                    .map(column => {
                        const value = getFieldValue(column, row);
                        const processedValue = isObject(value)
                            ? JSON.stringify(value.records)
                            : value;
                        return escapeCsvValue(separator, processedValue);
                    })
                    .join(separator);
            })
            .join('\n');
        return `${header}\n${data}`;
    }

    async _fetchNextRecords(nextRecordsUrl) {
        if (!nextRecordsUrl) return;
        const res = await this.connector.conn.request({
            method: 'GET',
            url: nextRecordsUrl,
            //headers: salesforce.getQueryHeaders()
        });
        this._responseNextRecordsUrl = res.nextRecordsUrl;
        this._responseRows = [...this._responseRows, ...res.records];
    }

    async _fetchSubsequentRecords(nextRecordsUrl) {
        await this._fetchNextRecords(nextRecordsUrl);
        if (this._responseNextRecordsUrl && !this.isDownloadCanceled) {
            await this._fetchSubsequentRecords(this._responseNextRecordsUrl);
        }
    }

    /** Storage Files  **/

    handleSelectItem = e => {
        e.stopPropagation();
        const { ui, queryFiles } = store.getState() as any;
        const { id, content, category, extra } = e.detail;
        // Check if tab is already open with
        if (category === CATEGORY_STORAGE.SAVED) {
            // Check if tab is already open or create new one

            const tabs = ui.tabs;
            const existingTab = tabs.find(x => compareString(x.fileId, id));
            if (existingTab) {
                // Existing tab
                store.dispatch(UI.reduxSlice.actions.selectionTab(existingTab));
            } else {
                store.dispatch(
                    UI.reduxSlice.actions.addTab({
                        tab: {
                            id: guid(),
                            body: content,
                            fileId: id,
                        },
                        queryFiles,
                    })
                );
            }
        } else if (category === CATEGORY_STORAGE.RECENT) {
            // Open in existing tab
            if (ui.currentTab.fileId) {
                store.dispatch(
                    UI.reduxSlice.actions.addTab({
                        tab: {
                            id: guid(),
                            body: content,
                        },
                    })
                );
            } else {
                store.dispatch(
                    UI.reduxSlice.actions.updateSoql({
                        connector: this.connector,
                        soql: content,
                    })
                );
            }
        } else {
            console.warn(`${category} not supported !`);
        }
    };

    handleRemoveItem = e => {
        e.stopPropagation();
        const { id } = e.detail;
        store.dispatch(DOCUMENT.reduxSlices.QUERYFILE.actions.removeOne(id));
    };

    handleTableSearchChange = event => {
        store.dispatch(UI.reduxSlice.actions.updateTabTableSearch({ value: event.target.value }));
    };

    /** Getters **/

    get isLoadingAdvanced() {
        return this.isLoading || this.isDownloading;
    }

    get loadingMessage() {
        // this._responseRows
        return this.isDownloading
            ? `Preparing the file. Might take a few seconds. ${this.currentRecordsFormatted}/${this.totalRecordsFormatted} records.`
            : 'Loading';
    }

    get pageClass() {
        //Overwrite
        return super.pageClass;
    }

    get sobjectsPanelClass() {
        return this.selectedSObject ? 'slds-hide' : '';
    }

    get isRunButtonDisplayed() {
        return !this._displayStopButton;
    }

    get isRunButtonDisabled() {
        return this.isLoading || isEmpty(this.soql);
    }

    get isSaveButtonDisabled() {
        return this.isLoading || isEmpty(this.soql);
    }

    get isFieldsPanelDisplayed() {
        return isNotUndefinedOrNull(this.selectedSObject);
    }

    get toggleLeftIconName() {
        return this.isLeftToggled ? 'utility:toggle_panel_right' : 'utility:toggle_panel_left';
    }

    get toggleRecentVariant() {
        return this.isRecentToggled ? 'brand' : 'bare';
    }

    get isMetaDisplayed() {
        return isNotUndefinedOrNull(this._response);
    }

    get totalRecords() {
        return this._response?.totalSize || 0;
    }

    get currentRecordsFormatted() {
        return shortFormatter.format(this._responseRows?.length || 0);
    }

    get totalRecordsFormatted() {
        return shortFormatter.format(this.totalRecords);
    }

    get loadedRecords() {
        return this._responseRows?.length || 0;
    }

    get loadedRecordsFormatted() {
        return shortFormatter.format(this.loadedRecords);
    }

    // True when Salesforce returned a cursor (more than the loaded records exist).
    get hasMoreRecords() {
        return isNotUndefinedOrNull(this._responseNextRecordsUrl);
    }

    // Show the pagination footer only when there is something more to load
    // or a load-more fetch is in flight.
    get isLoadMoreDisplayed() {
        return (
            isNotUndefinedOrNull(this._response) && (this.hasMoreRecords || this._isFetchingMore)
        );
    }

    get isLoadMoreDisabled() {
        return this._isFetchingMore || !this.hasMoreRecords;
    }

    get loadMoreLabel() {
        return this._isFetchingMore
            ? `Loading… ${this.loadedRecordsFormatted}/${this.totalRecordsFormatted}`
            : `Load more (${this.loadedRecordsFormatted} of ${this.totalRecordsFormatted})`;
    }

    get sobjectPlurialLabel() {
        return this._sobject?.labelPlural;
    }

    get isDownloadDisabled() {
        return isUndefinedOrNull(this._response);
    }

    get isDeleteDisabled() {
        const { ui } = store.getState() as any;
        const parentLen = Array.isArray(ui.currentTab.selectedRecordIds)
            ? ui.currentTab.selectedRecordIds.length
            : 0;
        return parentLen == 0 && this.selectedChildRecords.length == 0;
    }

    get currentTabTableSearch() {
        const { ui } = store.getState() as any;
        return ui.currentTab?.tableSearch || '';
    }
}
