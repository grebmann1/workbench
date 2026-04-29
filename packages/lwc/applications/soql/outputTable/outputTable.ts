import ToolkitElement from 'host-api/element';
import { store, SOBJECT, SHELL, connectStore } from 'host-api/store';
import {
    isNotUndefinedOrNull,
    isUndefinedOrNull,
    lowerCaseKey,
    runActionAfterTimeOut,
} from 'host-api/utils';
import Toast from 'lightning/toast';
import { api, wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import { UI } from 'soql/slices';

import { resolveFieldEditability, normalizeEditorValue } from './editable';

class ColumnCollector {
    columnMap = new Map();
    columns = [];
    records;

    constructor(records) {
        this.records = records;
    }

    collect() {
        this.records.forEach(record => {
            this._collectColumnMap(record);
        });
        this._collectColumns();
        return this.columns;
    }

    _collectColumnMap(record, relationships = []) {
        Object.keys(record).forEach(name => {
            if (name !== 'attributes') {
                let parentRelation = this.columnMap;
                relationships.forEach(relation => {
                    parentRelation = parentRelation.get(relation);
                });
                if (!parentRelation.has(name)) {
                    parentRelation.set(name, new Map());
                }
                const data = record[name];
                if (data instanceof Object) {
                    if (!data.totalSize) {
                        this._collectColumnMap(data, [...relationships, name]);
                    }
                }
            }
        });
    }

    _collectColumns(columnMap = this.columnMap, relationships = []) {
        for (const [name, data] of columnMap) {
            if (data.size) {
                this._collectColumns(data, [...relationships, name]);
            } else {
                this.columns.push([...relationships, name].join('.'));
            }
        }
    }
}

export default class OutputTable extends ToolkitElement {
    @wire(NavigationContext)
    navContext;

    isLoading = false;
    _columns;
    rows;
    _response;
    _nextRecordsUrl;
    _hasRendered = false;
    _tableSearch;
    _lastColumnsKey = '';
    _displayTableRunId = 0;
    _tabulatorCtor;
    _tabulatorImportPromise;
    _allRows = null;

    @api tableInstance;
    @api childTitle;
    @api sobjectName;
    @api isChildTable = false;

    /** Inline-edit state (mirrored from the store) */
    _currentTabId: string | null = null;
    _pendingEditsByKey: Record<string, any> = {};
    _sobjectState: any = null;
    _describeRequested = new Set<string>();

    /** Inline-edit overlay state */
    _isEditing = false;
    _editorProps: any = null;
    _editorStyle: string = '';
    _activeEdit: {
        sobjectType: string;
        recordId: string;
        field: string;
        oldValue: any;
        editorType: any;
    } | null = null;

    @wire(connectStore, { store })
    storeChange({ ui, sobject }: { ui: any; sobject: any }) {
        if (this.isChildTable) return;
        this._currentTabId = ui?.currentTab?.id || null;
        this._pendingEditsByKey =
            (this._currentTabId && ui?.pendingEdits?.[this._currentTabId]) || {};
        this._sobjectState = sobject || null;
        this._refreshDirtyDecorations();
    }

    async ensureTabulator() {
        if (this._tabulatorCtor) return this._tabulatorCtor;
        if (!this._tabulatorImportPromise) {
            this._tabulatorImportPromise = import('tabulator-tables').then(mod => {
                return mod.TabulatorFull || mod.default || mod.Tabulator;
            });
        }
        this._tabulatorCtor = await this._tabulatorImportPromise;
        return this._tabulatorCtor;
    }

    @api
    set response(res) {
        this._response = JSON.parse(JSON.stringify(res));
        this._nextRecordsUrl = res.nextRecordsUrl;
        const collector = new ColumnCollector(res.records);
        this._columns = collector.collect();
        this.displayTable();
    }
    get response() {
        return this._response;
    }

    renderedCallback() {
        if (!this._hasRendered) {
            this.displayTable();
            window.addEventListener('resize', this.tableResizeEvent);
        }
        this._hasRendered = true;
    }

    disconnectedCallback() {
        window.removeEventListener('resize', this.tableResizeEvent);
    }

    /** Methods */

    formatDataForTable = () => {
        const records = this._response?.records || [];
        return records.map(record => {
            const row = { ...record };
            // Preserve the SObject type (needed for inline editing PATCH calls)
            // but drop the rest of `attributes` so it doesn't leak into the UI.
            const sobjectType = record?.attributes?.type || null;
            delete row.attributes;
            if (sobjectType) {
                row.__sobjectType = sobjectType;
            }
            row.__searchText = this._buildRowSearchText(row);
            return row;
        });
    };

    _buildRowSearchText(row) {
        try {
            return Object.entries(row)
                .filter(([key]) => !key.startsWith('__'))
                .map(([, val]) => {
                    if (val == null) return '';
                    if (typeof val === 'object') {
                        try {
                            return JSON.stringify(val);
                        } catch (_e) {
                            return '';
                        }
                    }
                    return String(val);
                })
                .join(' ')
                .toLowerCase();
        } catch (_e) {
            return '';
        }
    }

    _escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    _iconButtonHtml({ action, iconName, assistiveText, title }) {
        const safeTitle = this._escapeHtml(title || assistiveText || '');
        const safeText = this._escapeHtml(assistiveText || '');
        return `
            <button class="slds-button slds-button_icon slds-button_icon-bare sftk-cell-btn" type="button" data-action="${action}" title="${safeTitle}">
                <svg class="slds-button__icon" aria-hidden="true" focusable="false">
                    <use xlink:href="/assets/icons/utility-sprite/svg/symbols.svg#${iconName}"></use>
                </svg>
                <span class="slds-assistive-text">${safeText}</span>
            </button>
        `;
    }

    _formatChildRelationshipLabel(value) {
        const count = Array.isArray(value) ? value.length : value?.totalSize || 0;
        return `${count} records`;
    }

    _getPendingEditForCell(sobjectType, recordId, field) {
        if (!sobjectType || !recordId) return null;
        const entry = this._pendingEditsByKey?.[`${sobjectType}:${recordId}`];
        if (!entry) return null;
        return entry.changes?.[field] || null;
    }

    _formatDisplayValue(val) {
        if (val == null) return '';
        if (Array.isArray(val)) return val.join(';');
        return String(val);
    }

    tabulatorCellFormatter = cell => {
        const field = cell.getColumn().getField();
        const rowData = cell.getRow().getData() || {};
        const recordId = rowData.Id;
        const sobjectType = rowData.__sobjectType;

        const rawValue = cell.getValue();
        const isChildRelationship = rawValue && typeof rawValue === 'object';

        const pendingEdit = this._getPendingEditForCell(sobjectType, recordId, field);
        const effectiveValue = pendingEdit ? pendingEdit.newValue : rawValue;

        if (isChildRelationship && !pendingEdit) {
            const label = this._formatChildRelationshipLabel(rawValue);
            const safe = this._escapeHtml(label);
            return `
                <div class="sftk-cell">
                    <span class="sftk-badge sftk-cell-child" data-action="child" title="${safe}">${safe}</span>
                </div>
            `;
        }

        const displayText = this._formatDisplayValue(effectiveValue);
        const isIdLike = /^[0-9A-Za-z]{18}$/.test(displayText);
        const isRecordIdField = field === 'Id';

        const valueHtml = isIdLike
            ? `<a href="#" class="sftk-cell-link" data-action="navigate" title="${this._escapeHtml(displayText)}">${this._escapeHtml(displayText)}</a>`
            : `<div class="slds-truncate sftk-cell-value" title="${this._escapeHtml(displayText)}">${this._escapeHtml(displayText)}</div>`;

        const isLookupField = isIdLike && !isRecordIdField;

        const actions = [];
        if (isRecordIdField && recordId) {
            actions.push(
                this._iconButtonHtml({ action: 'edit', iconName: 'edit', assistiveText: 'edit' })
            );
        }
        if (isLookupField) {
            actions.push(
                this._iconButtonHtml({
                    action: 'view',
                    iconName: 'preview',
                    assistiveText: 'view record',
                })
            );
        }
        if (effectiveValue != null && displayText !== '') {
            actions.push(
                this._iconButtonHtml({ action: 'copy', iconName: 'copy', assistiveText: 'copy' })
            );
        }

        // Apply dirty / error decorations on the cell element after render.
        const cellEl = cell.getElement?.();
        if (cellEl) {
            cellEl.classList.toggle('sftk-cell-dirty', !!pendingEdit);
            const tabBucket = this._pendingEditsByKey || {};
            const entry = tabBucket[`${sobjectType}:${recordId}`];
            // Field-level error takes precedence; fall back to record-level when
            // Salesforce didn't pinpoint a field (e.g. validation rule with no
            // field binding, DML exception, auth failure).
            const fieldErr = entry?.error?.fieldErrors?.[field];
            const recordErr = entry?.error && !entry.error.fieldErrors ? entry.error.message : null;
            const errMsg = fieldErr || recordErr;
            cellEl.classList.toggle('sftk-cell-error', !!(pendingEdit && errMsg));
            if (errMsg) {
                const code = entry?.error?.statusCode;
                cellEl.setAttribute('title', code ? `${code}: ${errMsg}` : errMsg);
            }
        }

        return `
            <div class="sftk-cell">
                <div class="sftk-cell-main">${valueHtml}</div>
                <div class="sftk-cell-actions">${actions.join('')}</div>
            </div>
        `;
    };

    _tabulatorRowFormatter = row => {
        const data = row.getData() || {};
        const entry = this._pendingEditsByKey?.[`${data.__sobjectType}:${data.Id}`] || null;
        const hasDirty = !!(entry && Object.keys(entry.changes || {}).length > 0);
        row.getElement().classList.toggle('sftk-row-dirty', hasDirty);
    };

    _refreshDirtyDecorations() {
        if (!this.tableInstance) return;
        try {
            this.tableInstance.getRows().forEach(row => {
                const data = row.getData() || {};
                const entry = this._pendingEditsByKey?.[`${data.__sobjectType}:${data.Id}`] || null;
                const el = row.getElement();
                const hasDirty = !!(entry && Object.keys(entry.changes || {}).length > 0);
                const wasDirty = el?.classList?.contains('sftk-row-dirty');
                el?.classList?.toggle('sftk-row-dirty', hasDirty);
                if (hasDirty || wasDirty) {
                    // Re-run formatter so the displayed value + cell classes update.
                    row.reformat?.();
                }
            });
        } catch (_e) {
            // no-op
        }
    }

    _handleCellClick = (e, cell) => {
        const actionEl = e?.target?.closest?.('[data-action]');
        const action = actionEl?.dataset?.action;
        if (!action) return;

        const value = cell.getValue();
        const field = cell.getColumn().getField();
        const rowData = cell.getRow().getData() || {};
        const recordId = rowData.Id;

        if (action === 'copy') {
            e.preventDefault();
            e.stopPropagation();
            navigator.clipboard.writeText(value == null ? '' : String(value));
            Toast.show({
                label: `${field} exported to your clipboard`,
                variant: 'success',
            });
            return;
        }

        if (action === 'edit') {
            e.preventDefault();
            e.stopPropagation();
            if (!recordId) return;
            navigate(this.navContext, {
                type: 'application',
                state: {
                    applicationName: 'recordviewer',
                    recordId,
                },
            });
            return;
        }

        if (action === 'navigate') {
            e.preventDefault();
            e.stopPropagation();
            if (value == null) return;
            store.dispatch(SHELL.reduxSlice.actions.navigate({ target: String(value) }));
            return;
        }

        if (action === 'view') {
            e.preventDefault();
            e.stopPropagation();
            if (value == null) return;
            navigate(this.navContext, {
                type: 'application',
                state: {
                    applicationName: 'recordviewer',
                    recordId: String(value),
                },
            });
            return;
        }

        if (action === 'child') {
            e.preventDefault();
            e.stopPropagation();
            const base = {
                recordId,
                column: field,
            };
            let clonedValue = value;
            try {
                clonedValue = JSON.parse(JSON.stringify(value));
            } catch (_e) {
                // fall back to original value if not serializable
            }
            store.dispatch(
                UI.reduxSlice.actions.selectChildRelationship({
                    childRelationship: {
                        ...base,
                        ...(clonedValue && typeof clonedValue === 'object' ? clonedValue : {}),
                    },
                })
            );
        }
    };

    _handleCellDblClick = (e, cell) => {
        if (this.isChildTable) return;
        const rowData = cell.getRow().getData() || {};
        const field = cell.getColumn().getField();
        const sobjectType = rowData.__sobjectType;
        const recordId = rowData.Id;

        if (!sobjectType || !recordId) return;
        if (!field || field === '__sobjectType' || field === '__searchText') return;

        const rawValue = cell.getValue();
        // Prefer the pending edit's newValue when we re-enter editing.
        const pendingEdit = this._getPendingEditForCell(sobjectType, recordId, field);
        const valueForEditor = pendingEdit ? pendingEdit.newValue : rawValue;

        const editability = resolveFieldEditability({
            sobjectState: this._sobjectState,
            sobjectType,
            field,
            value: rawValue,
        });

        if (!editability.editable) {
            // Lazy-fetch describe the first time we see this sobject type without metadata.
            if (editability.reason === 'not-found' || editability.reason === 'no-describe') {
                this._requestDescribe(sobjectType);
            }
            return;
        }

        // Prevent the single-click handler from firing navigations/actions under the dblclick.
        e?.preventDefault?.();
        e?.stopPropagation?.();

        this._openEditor({
            cell,
            field,
            sobjectType,
            recordId,
            rawValue,
            valueForEditor,
            editability,
        });
    };

    _requestDescribe(sobjectType) {
        if (!sobjectType) return;
        const key = lowerCaseKey(sobjectType);
        if (this._describeRequested.has(key)) return;
        const conn = (store.getState() as any)?.application?.connector;
        if (!conn) return;
        this._describeRequested.add(key);
        store.dispatch(
            SOBJECT.describeSObject({
                connector: conn.conn,
                sObjectName: sobjectType,
            }) as any
        );
    }

    _openEditor({ cell, field, sobjectType, recordId, rawValue, valueForEditor, editability }) {
        const cellEl = cell.getElement?.();
        const host = this.template.querySelector('.output-panel');
        if (!cellEl || !host) return;

        const hostRect = host.getBoundingClientRect();
        const rect = cellEl.getBoundingClientRect();

        const top = rect.top - hostRect.top + host.scrollTop;
        const left = rect.left - hostRect.left + host.scrollLeft;
        const width = Math.max(rect.width, 180);
        const height = Math.max(rect.height, 28);

        this._editorProps = {
            editorType: editability.editorType,
            picklistValues: editability.picklistValues || [],
            length: editability.length || 0,
            initialValue: valueForEditor,
            fieldLabel: editability.label || field,
        };
        this._editorStyle = `top:${top}px; left:${left}px; width:${width}px; min-height:${height}px;`;
        this._activeEdit = {
            sobjectType,
            recordId,
            field,
            oldValue: rawValue,
            editorType: editability.editorType,
        };
        this._isEditing = true;

        // Commit editor on Tabulator scroll to prevent the editor from floating away.
        try {
            if (!this._scrollBound && this.tableInstance) {
                this._scrollBound = true;
                this.tableInstance.on('scrollVertical', this._handleTableScrollWhileEditing);
                this.tableInstance.on('scrollHorizontal', this._handleTableScrollWhileEditing);
            }
        } catch (_e) {
            // ignore scroll-binding errors
        }
    }

    _scrollBound = false;

    _handleTableScrollWhileEditing = () => {
        if (this._isEditing) {
            this._closeEditor();
        }
    };

    _closeEditor() {
        this._isEditing = false;
        this._editorProps = null;
        this._activeEdit = null;
        this._editorStyle = '';
    }

    handleCellEditorCommit = (e: CustomEvent) => {
        if (!this._activeEdit) {
            this._closeEditor();
            return;
        }
        const { sobjectType, recordId, field, oldValue, editorType } = this._activeEdit;
        const rawNewValue = (e as any)?.detail?.value;
        const newValue = normalizeEditorValue(editorType, rawNewValue);
        this._closeEditor();
        if (!this._currentTabId) return;
        store.dispatch(
            UI.reduxSlice.actions.setCellEdit({
                tabId: this._currentTabId,
                sobjectType,
                recordId,
                field,
                oldValue,
                newValue,
            })
        );
    };

    handleCellEditorCancel = () => {
        this._closeEditor();
    };

    @api
    discardAllEdits() {
        if (!this._currentTabId) return;
        store.dispatch(UI.reduxSlice.actions.clearEditsForTab({ tabId: this._currentTabId }));
    }

    formatColumns = () => {
        const columns = this._columns.map(key => {
            return {
                title: key,
                field: key,
                maxWidth: 500,
                formatter: this.tabulatorCellFormatter,
                cellClick: this._handleCellClick,
                cellDblClick: this._handleCellDblClick,
            };
        });

        if (isNotUndefinedOrNull(this.childTitle)) {
            return [{ title: this.childTitle, columns: columns }];
        } else {
            return columns;
        }
    };

    tableResizeEvent = e => {
        //console.log('tableResizeEvent');
        this.tableResize(1);
    };

    @api
    tableResize = timeout => {
        runActionAfterTimeOut(
            null,
            param => {
                if (isUndefinedOrNull(this.tableInstance)) return;
                const height = this.template.querySelector('.output-panel').clientHeight;
                if (height > 0) {
                    this.tableInstance.setHeight(height);
                }
            },
            { timeout, key: 'soql.outputTable.resize' }
        );
    };

    displayTable = async () => {
        const runId = ++this._displayTableRunId;
        const columnsKey = Array.isArray(this._columns) ? this._columns.join('|') : '';
        const element = this.template.querySelector('.custom-table');
        const rowSelector = {
            headerSort: false,
            resizable: false,
            frozen: true,
            headerHozAlign: 'center',
            hozAlign: 'center',
            formatter: 'rowSelection',
            titleFormatter: 'rowSelection',
            cellClick: function (e, cell) {
                cell.getRow().toggleSelect();
            },
        };
        if (!element) return;
        this.isLoading = true;
        const data = this.formatDataForTable();
        const columns = this.formatColumns();

        if (this.tableInstance && this._lastColumnsKey === columnsKey) {
            this.tableInstance.replaceData(data);
            this.applyTableSearchFilter();
            this.isLoading = false;
            return;
        }

        const Tabulator = await this.ensureTabulator();
        if (!Tabulator || runId !== this._displayTableRunId) {
            return;
        }

        if (this.tableInstance) {
            this.tableInstance.destroy();
        }

        this._lastColumnsKey = columnsKey;
        this.tableInstance = new Tabulator(element, {
            height: '100%',
            data,
            autoResize: false,
            layout: 'fitDataFill',
            columns,
            columnHeaderVertAlign: 'middle',
            minHeight: 100,
            rowHeight: 28,
            rowFormatter: this._tabulatorRowFormatter,
            rowHeader: this.isChildTable || data.length === 0 ? null : rowSelector,
            headerSortElement: function (column, dir) {
                const _arrowIcon = iconName =>
                    `<svg class="slds-icon slds-icon-text-default slds-is-sortable__icon " aria-hidden="true"><use xlink:href="/assets/icons/utility-sprite/svg/symbols.svg#${iconName}"></use></svg>`;
                switch (dir) {
                    case 'asc':
                        return _arrowIcon('arrowup');
                    case 'desc':
                        return _arrowIcon('arrowdown');
                    default:
                        return _arrowIcon('arrowdown');
                }
            },
        });
        this.tableInstance.on('tableBuilding', () => {
            //console.log('tableBuilding')
            this.isLoading = true;
        });
        this.tableInstance.on('tableBuilt', () => {
            this.isLoading = false;
            if (!this.isChildTable) {
                this.dispatchEvent(
                    new CustomEvent('tablebuilt', { bubbles: true, composed: true })
                );
            }
        });
        this.tableInstance.on('rowSelectionChanged', (data, rows, selected, deselected) => {
            this.dispatchEvent(
                new CustomEvent('rowselection', {
                    detail: {
                        rows: data,
                        isChildTable: this.isChildTable,
                    },
                    bubbles: true,
                    composed: true,
                })
            );
        });
        this.applyTableSearchFilter();
    };

    applyTableSearchFilter() {
        if (!this.tableInstance) return;
        const search = (this._tableSearch || '').toLowerCase();
        if (!search) {
            this.tableInstance.clearFilter();
            return;
        }
        this.tableInstance.setFilter(rowData => {
            const text = rowData?.__searchText || '';
            return text.includes(search);
        });
    }

    _convertQueryResponse(res) {
        if (!res) return [];
        const startIdx = this._allRows ? this._allRows.length : 0;
        return res.records.map((record, rowIdx) => {
            const acutualRowIdx = startIdx + rowIdx;
            const row = {
                key: acutualRowIdx,
                values: [],
            };
            this.columns.forEach((column, valueIdx) => {
                const rawData = this._getFieldValue(column, record);
                let data = rawData;
                if (data && data.totalSize) {
                    data = `${data.totalSize} rows`;
                }
                row.values.push({
                    key: `${acutualRowIdx}-${valueIdx}`,
                    data,
                    rawData,
                    column,
                });
            });
            return row;
        });
    }

    _getFieldValue(column, record) {
        let value = record;
        column.split('.').forEach(name => {
            if (value) value = value[name];
        });
        return value;
    }

    /** Getters **/

    @api
    get columns() {
        return this._columns;
    }

    @api
    get tableSearch() {
        return this._tableSearch || '';
    }
    set tableSearch(val) {
        this._tableSearch = val || '';
        this.applyTableSearchFilter();
    }
}
