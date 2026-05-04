import { registerCommand } from 'host-api/commands';
import ToolkitElement from 'host-api/element';
import { store, injectReducer, connectStore } from 'host-api/store';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';
import {
    classSet,
    isEmpty,
    isNotUndefinedOrNull,
    lowerCaseKey,
    runActionAfterTimeOut,
} from 'host-api/utils';
import LightningConfirm from 'lightning/confirm';
import Toast from 'lightning/toast';
import { track, wire } from 'lwc';
import moment from 'moment';
import Analytics from 'shared/analytics';
import { UI, QUERY } from 'graphql/slices';
import { querySelectors } from 'graphql/slices/query';
import ShortcutsModal from 'graphql/shortcutsModal';
import {
    countQueryFields,
    deriveTabName,
    extractErrorMarkers,
    formatBytes,
    formatResponse,
    isMacPlatform,
    runShortcutLabel,
    validateVariablesJson,
} from './util';

type AnyRecord = Record<string, any>;

let _graphqlBootstrapped = false;
function bootstrapGraphqlExtension() {
    if (_graphqlBootstrapped) return;
    _graphqlBootstrapped = true;
    injectReducer('graphqlUi', UI.reduxSlice.reducer);
    injectReducer('graphqlQuery', QUERY.reduxSlice.reducer);

    registerCommand('graphql.open', () => {
        const target = `sftoolkit:${JSON.stringify({
            type: 'application',
            state: { applicationName: 'graphql' },
        })}`;
        return legacyStore.dispatch(legacyStore_application.navigate(target));
    });
    registerCommand('graphql.shortcuts', () =>
        ShortcutsModal.open({ label: 'GraphQL Explorer shortcuts', size: 'small' })
    );
}
bootstrapGraphqlExtension();

export default class App extends ToolkitElement {
    _hasRendered = false;

    @track tabs: AnyRecord[] = [];
    currentTab: AnyRecord | null = null;

    body = '';
    variables = '{}';

    isRecentToggled = false;
    isCatalogToggled = false;
    isVariablesExpanded = false;
    recentItems: AnyRecord[] = [];

    isRunning = false;
    _response: unknown = null;
    _errors: Array<{ message: string; path?: string[] }> | null = null;
    _took: number | null = null;
    _createdDate: number | null = null;
    _createdDateFormatted: string | null = null;
    _headerInterval: ReturnType<typeof setInterval> | null = null;
    _abortingMap: Record<string, any> = {};
    _isMac: boolean = false;
    _wiredShortcut = false;

    currentModel: any = null;
    variablesModel: any = null;
    responseModel: any = null;

    connectedCallback() {
        Analytics.trackAppOpen('graphql', { alias: this.alias });
        this._isMac = isMacPlatform();
        if (this.alias) {
            store.dispatch(UI.reduxSlice.actions.loadCacheSettings({ alias: this.alias }));
        }
        this.header_enableAutoDate();
        document.addEventListener('keydown', this._handleGlobalKeydown);
    }

    disconnectedCallback() {
        if (this._headerInterval) clearInterval(this._headerInterval);
        document.removeEventListener('keydown', this._handleGlobalKeydown);
    }

    _handleGlobalKeydown = (e: KeyboardEvent) => {
        // ⌘K / Ctrl+K opens the shortcuts modal. Let other ⌘K handlers
        // (browser address bar, etc.) win by checking we're on our surface.
        const isCmd = this._isMac ? e.metaKey : e.ctrlKey;
        if (!isCmd || e.shiftKey || e.altKey) return;
        if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            ShortcutsModal.open({ label: 'GraphQL Explorer shortcuts', size: 'small' });
        } else if (e.key === 'b' || e.key === 'B') {
            e.preventDefault();
            store.dispatch(UI.reduxSlice.actions.toggleVariables());
        }
    };

    renderedCallback() {
        this._hasRendered = true;
        if (this.refs?.tabs) {
            this.refs.tabs.activeTabValue = this.currentTab?.id;
        }
    }

    @wire(connectStore, { store })
    storeChange({ graphqlUi, graphqlQuery, application }: AnyRecord) {
        const isCurrentApp = this.verifyIsActive(application.currentApplication);
        if (!isCurrentApp) return;

        this.tabs = graphqlUi.tabs;
        this.isRecentToggled = graphqlUi.recentPanelToggled;
        this.isVariablesExpanded = !!graphqlUi.variablesExpanded;

        const prevTabId = this.currentTab?.id;
        this.currentTab = graphqlUi.currentTab;
        const tabChanged = prevTabId !== this.currentTab?.id;

        if (this.currentTab && this.body !== this.currentTab.body) {
            this.body = this.currentTab.body;
            if (tabChanged) this.syncEditorValue('body');
        }
        if (this.currentTab && this.variables !== this.currentTab.variables) {
            this.variables = this.currentTab.variables;
            if (tabChanged) this.syncEditorValue('variables');
        }

        const queryState = querySelectors.selectById(
            { graphqlQuery },
            lowerCaseKey(this.currentTab?.id || '')
        );
        if (queryState) {
            this.isRunning = !!queryState.isFetching;
            if (queryState.error) {
                this._response = null;
                this._errors = [{ message: queryState.error.message || 'Request failed' }];
                this._took = null;
                this._abortingMap[this.currentTab!.id] = null;
            } else if (!queryState.isFetching) {
                this._response = queryState.data ?? null;
                this._errors = queryState.errors || null;
                this._took = typeof queryState.took === 'number' ? queryState.took : null;
                this._createdDate = queryState.createdDate || null;
                this._abortingMap[this.currentTab!.id] = null;
                this.header_formatDate();
            }
        } else {
            this.isRunning = false;
            this._response = null;
            this._errors = null;
            this._took = null;
            this._createdDate = null;
            this._createdDateFormatted = null;
        }
        this.updateResponseEditor();
        this.applyErrorMarkers();

        this.recentItems = (graphqlUi.recent || []).map((entry: any, idx: number) => ({
            id: String(idx),
            content: entry.body,
            extra: entry,
        }));
    }

    applyErrorMarkers() {
        if (!this._hasRendered || !this.refs?.editor) return;
        const editor = this.refs.editor;
        if (!editor.currentMonaco) return;
        const markers = extractErrorMarkers(this._errors as any);
        if (markers.length === 0) {
            editor.resetMarkers();
            return;
        }
        const ms = editor.currentMonaco.MarkerSeverity?.Error ?? 8;
        editor.addMarkers(
            markers.map(m => ({
                startLineNumber: m.line,
                endLineNumber: m.line,
                startColumn: m.column,
                endColumn: m.column + 1,
                message: m.message,
                severity: ms,
            }))
        );
    }

    syncEditorValue(which: 'body' | 'variables') {
        if (!this._hasRendered) return;
        const ref = which === 'body' ? this.refs?.editor : this.refs?.variablesEditor;
        const model = ref?.currentModel;
        if (!model) return;
        const value = which === 'body' ? this.body : this.variables;
        if (model.getValue() !== value) {
            model.setValue(value || '');
        }
    }

    header_formatDate = () => {
        this._createdDateFormatted = this._createdDate ? moment(this._createdDate).fromNow() : null;
    };

    header_enableAutoDate = () => {
        this.header_formatDate();
        this._headerInterval = setInterval(this.header_formatDate, 30000);
    };

    /** Editor */

    handleMonacoLoaded = () => {
        this.currentModel = this.refs.editor.createModel({
            body: this.body,
            language: 'graphql',
        });
        this.refs.editor.displayModel(this.currentModel);
    };

    handleVariablesMonacoLoaded = () => {
        this.variablesModel = this.refs.variablesEditor.createModel({
            body: this.variables,
            language: 'json',
        });
        this.refs.variablesEditor.displayModel(this.variablesModel);
    };

    handleBodyChange = (e: CustomEvent) => {
        runActionAfterTimeOut(
            e,
            (lastEvent: CustomEvent) => {
                const value = (lastEvent.detail as AnyRecord)?.value ?? '';
                if (this.body === value) return;
                this.body = value;
                store.dispatch(UI.reduxSlice.actions.updateBody({ body: value }));
            },
            { timeout: 150, key: 'graphql.app.handleBodyChange' }
        );
    };

    handleVariablesChange = (e: CustomEvent) => {
        runActionAfterTimeOut(
            e,
            (lastEvent: CustomEvent) => {
                const value = (lastEvent.detail as AnyRecord)?.value ?? '';
                if (this.variables === value) return;
                this.variables = value;
                store.dispatch(UI.reduxSlice.actions.updateVariables({ variables: value }));
            },
            { timeout: 150, key: 'graphql.app.handleVariablesChange' }
        );
    };

    handleFormatBody = () => {
        if (!this._hasRendered || !this.refs?.editor?.currentMonaco) return;
        this.refs.editor.currentEditor?.getAction('editor.action.formatDocument')?.run();
    };

    /** Run */

    executeAction = async () => {
        const body = this.refs?.editor?.currentModel?.getValue() || '';
        if (isEmpty(body)) return;
        const variables = this.refs?.variablesEditor?.currentModel?.getValue() || '{}';

        const parse = validateVariablesJson(variables);
        if (!parse.ok) {
            Toast.show({
                label: 'Invalid variables JSON',
                message: parse.error,
                variant: 'error',
                mode: 'sticky',
            });
            return;
        }

        Analytics.trackAction('graphql', 'execute', { alias: this.alias });

        const tabId = this.currentTab!.id;
        const queryPromise: any = store.dispatch(
            QUERY.executeQuery({
                connector: this.connector,
                query: body,
                variables,
                tabId,
                createdDate: Date.now(),
            })
        );
        this._abortingMap[tabId] = queryPromise;
        const res: any = await queryPromise;
        if (!res.error) {
            const payload = res.payload || {};
            store.dispatch(
                UI.reduxSlice.actions.saveRecent({
                    body,
                    variables,
                    response: { data: payload.data ?? null, errors: payload.errors ?? null },
                    took: payload.took,
                })
            );
        } else if (res.error?.name !== 'AbortError') {
            const message = res.error?.message || 'GraphQL request failed';
            Toast.show({ label: 'GraphQL error', message, variant: 'error', mode: 'sticky' });
        }
    };

    handleAbort = () => {
        const tabId = this.currentTab?.id;
        if (!tabId) return;
        const promise = this._abortingMap[tabId];
        if (promise && typeof promise.abort === 'function') {
            promise.abort();
        }
    };

    /** Response actions */

    handleCopyResponse = async () => {
        const text = this.formattedResponse;
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            Toast.show({ label: 'Response copied', variant: 'success' });
        } catch (e: any) {
            Toast.show({
                label: 'Copy failed',
                message: e?.message || 'Unable to copy',
                variant: 'error',
            });
        }
    };

    handleDownloadResponse = () => {
        const text = this.formattedResponse;
        if (!text) return;
        try {
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `graphql-response-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            Toast.show({
                label: 'Download failed',
                message: e?.message || 'Unable to download',
                variant: 'error',
            });
        }
    };

    handleCopyQuery = async () => {
        try {
            await navigator.clipboard.writeText(this.body || '');
            Toast.show({ label: 'Query copied', variant: 'success' });
        } catch (e: any) {
            Toast.show({
                label: 'Copy failed',
                message: e?.message || 'Unable to copy',
                variant: 'error',
            });
        }
    };

    /** Tabs */

    handleAddTab = () => {
        store.dispatch(UI.reduxSlice.actions.addTab({ tab: {} }));
    };

    handleSelectTab = (e: CustomEvent) => {
        const tabId = (e.target as AnyRecord)?.value;
        if (tabId) store.dispatch(UI.reduxSlice.actions.selectionTab({ id: tabId }));
    };

    handleTabDblClick = (e: Event) => {
        const el = (e.target as HTMLElement)?.closest('[data-tab-id]') as HTMLElement | null;
        const tabId = el?.dataset?.tabId;
        if (!tabId) return;
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;
        const suggested = typeof tab.name === 'string' && tab.name ? tab.name : '';
        const input =
            typeof window !== 'undefined' && typeof window.prompt === 'function'
                ? window.prompt('Tab name (leave empty to auto-derive):', suggested)
                : null;
        if (input === null) return;
        store.dispatch(UI.reduxSlice.actions.renameTab({ id: tabId, name: input }));
    };

    handleCloseTab = async (e: CustomEvent) => {
        const tabId = (e.detail as AnyRecord)?.value;
        if (!tabId) return;
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab && tab.body && tab.body.trim().length > 0 && this.tabs.length > 1) {
            const ok = await LightningConfirm.open({
                variant: 'headerless',
                message: 'Close this tab? Its content will be lost.',
            });
            if (!ok) return;
        }
        store.dispatch(UI.reduxSlice.actions.removeTab({ id: tabId }));
    };

    /** Panels */

    handleRecentToggle = () => {
        store.dispatch(UI.reduxSlice.actions.updateRecentPanel({ value: !this.isRecentToggled }));
    };

    handleVariablesToggle = () => {
        store.dispatch(UI.reduxSlice.actions.toggleVariables());
    };

    handleShortcutsClick = () => {
        ShortcutsModal.open({ label: 'GraphQL Explorer shortcuts', size: 'small' });
    };

    handleClearRecent = () => {
        store.dispatch(UI.reduxSlice.actions.clearRecent());
    };

    handleCatalogToggle = () => {
        this.isCatalogToggled = !this.isCatalogToggled;
    };

    handleCatalogClose = () => {
        this.isCatalogToggled = false;
    };

    handleCatalogSelect = (e: CustomEvent) => {
        const detail = e.detail as AnyRecord;
        if (!detail?.body) return;
        store.dispatch(
            UI.reduxSlice.actions.addTab({
                tab: {
                    body: detail.body,
                    variables: detail.variables || '{}',
                    name: detail.name || null,
                },
            })
        );
        this.isCatalogToggled = false;
    };

    handleResponseMonacoLoaded = () => {
        this.responseModel = this.refs.responseEditor.createModel({
            body: this.formattedResponse,
            language: 'json',
        });
        this.refs.responseEditor.displayModel(this.responseModel);
    };

    updateResponseEditor = () => {
        if (!this._hasRendered || !this.refs?.responseEditor) return;
        const model = this.refs.responseEditor.currentModel;
        if (!model) return;
        const next = this.formattedResponse;
        if (model.getValue() !== next) model.setValue(next);
    };

    handleSelectItem = (e: CustomEvent) => {
        e.stopPropagation();
        const detail = e.detail as AnyRecord;
        const entry = detail?.extra;
        if (!entry?.body) return;
        // If a cached response exists, restore it on the new tab so the user
        // sees what they previously ran without re-executing.
        if (entry.response && (entry.response.data != null || entry.response.errors != null)) {
            this._response = entry.response.data ?? null;
            this._errors = entry.response.errors || null;
            this._took = typeof entry.took === 'number' ? entry.took : null;
            this._createdDate = entry.savedAt || null;
            this.header_formatDate();
            this.updateResponseEditor();
        }
        store.dispatch(
            UI.reduxSlice.actions.addTab({
                tab: { body: entry.body, variables: entry.variables || '{}' },
            })
        );
    };

    /** Getters */

    get pageClass() {
        return super.pageClass;
    }

    get formattedTabs() {
        return this.tabs.map((t, idx) => ({
            ...t,
            name: typeof t.name === 'string' && t.name ? t.name : deriveTabName(t.body, idx),
            isCloseable: this.tabs.length > 1,
            class: classSet('slds-tabs_scoped__item').toString(),
        }));
    }

    get fieldCount() {
        return countQueryFields(this.body);
    }

    get fieldCountLabel() {
        const n = this.fieldCount;
        if (n <= 0) return '';
        return `${n} field${n === 1 ? '' : 's'}`;
    }

    get responseBytesLabel() {
        const s = this.formattedResponse;
        if (!s) return '';
        return formatBytes(new Blob([s]).size);
    }

    get runShortcutLabel() {
        return runShortcutLabel(this._isMac);
    }

    get runButtonTitle() {
        return `Run (${this.runShortcutLabel})`;
    }

    get hasFieldCount() {
        return this.fieldCount > 0;
    }

    get hasResponseStats() {
        return this.hasResponse && !!this.responseBytesLabel;
    }

    get isRunButtonDisplayed() {
        return !this.isRunning;
    }

    get isRunButtonDisabled() {
        return this.isRunning || isEmpty(this.body);
    }

    get hasResponse() {
        return isNotUndefinedOrNull(this._response) || (this._errors && this._errors.length > 0);
    }

    get formattedResponse() {
        return formatResponse(this._response, this._errors);
    }

    get variablesToggleIcon() {
        return this.isVariablesExpanded ? 'utility:chevrondown' : 'utility:chevronright';
    }

    get variablesSectionClass() {
        return classSet('graphql-variables-section')
            .add({ 'graphql-variables-section--expanded': this.isVariablesExpanded })
            .toString();
    }

    get isMetaDisplayed() {
        return this.hasResponse && isNotUndefinedOrNull(this._createdDate);
    }

    get tookFormatted() {
        if (this._took == null) return '';
        return `${this._took} ms`;
    }

    get rightSlotClass() {
        return classSet('slds-full-height slds-full-width slds-flex-column').toString();
    }

    get isResponseActionsDisabled() {
        return !this.hasResponse || this.isRunning;
    }

    get responseEditorClass() {
        return classSet('graphql-response-editor slds-fill-height')
            .add({ 'slds-hide': !this.hasResponse })
            .toString();
    }

    get isEmptyStateDisplayed() {
        return !this.hasResponse && !this.isRunning;
    }
}
