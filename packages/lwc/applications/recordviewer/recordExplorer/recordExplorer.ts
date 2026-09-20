import ToolkitElement from 'host-api/element';
import Toast from 'lightning/toast';
import { connectStore, store } from 'host-api/store';
import { investigationOrgKey } from 'shared/recordInvestigation';
import { wire, api, track } from 'lwc';
import { CurrentPageReference, NavigationContext, generateUrl, navigate } from 'lwr/navigation';
import { store as legacyStore, store_application } from 'shared/store';
import {
    isEmpty,
    isNotUndefinedOrNull,
    isUndefinedOrNull,
    refreshCurrentTab,
    runSilent,
    getCurrentTab,
    getObjectDocLink,
    getObjectFieldsSetupLink,
    getObjectListLink,
    getObjectSetupLink,
    getRecordTypesLink,
    redirectToUrlViaChrome,
} from 'shared/utils';

const PAGE_LIST_SIZE = 70;
const TOOLING = 'tooling';
const SOBJECT = {
    contact: 'Contact',
};

// On the Chrome extension the connector talks to Salesforce directly (no proxy),
// so record GETs are subject to the browser HTTP cache and a read-after-write can
// return the stale pre-edit response (the classic "only refreshes with DevTools
// open" symptom). The proxy transport used by web/electron already cache-busts;
// these headers give the direct path the same guarantee.
const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
};

export default class RecordExplorer extends ToolkitElement {
    @wire(NavigationContext)
    navContext;

    @api versions = [];
    @api isPanel = false;

    _recordId;
    _requestToken = 0;
    _orgKey = '';
    _loadedOrgKey = '';
    @wire(connectStore, { store })
    connectionChanged() {
        const key = investigationOrgKey(this.connector);
        if (this._orgKey && key !== this._orgKey) {
            this._requestToken++;
            this.metadata = null;
            this.record = null;
            this.data = [];
            this._loadedOrgKey = '';
            this.isLoading = false;
        }
        this._orgKey = key;
    }

    disconnectedCallback() {
        this._requestToken++;
    }

    tableInstance;
    isLoading = false;

    currentTab;
    currentOrigin;

    // record data
    sobjectName;
    @track metadata;
    record;
    recordType;
    // for table
    data = [];
    filter = '';
    isError = false;
    errorMessage = '';

    // Exceptions
    networkMembers = [];

    // Scrolling
    pageNumber = 1;

    // Editing
    isEditMode = false;
    isSaving = false;
    modifiedRows = [];
    isViewChangeFilterEnabled = false;
    fieldErrors = {};
    editingFieldSet = new Set();

    // field & labels
    isLabelDisplayed = false;

    // Info & Details
    isInfoDisplayed = false;

    @api
    get recordId() {
        return this._recordId;
    }

    set recordId(value) {
        const toRun = this._recordId != value && !isEmpty(value);
        this._recordId = value;
        if (toRun) {
            this.filter = '';
            this.pageNumber = 1;
            this.initRecordExplorer();
        }
    }

    connectedCallback() {
        // Load metadata
        //this.getObjects(this.connector.conn,'standard');
        //this.getObjects(this.connector.conn.tooling,'tooling');
        //this.isSaving = true;
    }

    /** Methods **/

    initRecordExplorer = async () => {
        const token = ++this._requestToken;
        const recordId = this.recordId;
        const connector = this.connector;
        const orgKey = investigationOrgKey(connector);
        const isCurrent = () =>
            token === this._requestToken &&
            recordId === this.recordId &&
            orgKey === investigationOrgKey(this.connector) &&
            connector === this.connector;
        this.isError = false;
        this.errorMessage = '';
        this.isLoading = true;
        this.metadata = null;
        this.record = null;
        this.recordType = null;
        this.data = [];
        this.networkMembers = [];
        this._loadedOrgKey = '';
        try {
            if (!connector || !orgKey)
                throw new Error('Connect to Salesforce to inspect this record.');
            const currentTab = await getCurrentTab();
            const describe = await connector.conn.describeGlobal();
            let sobjectName = describe.sobjects.find(
                object => object.keyPrefix === recordId.slice(0, 3)
            )?.name;
            let useToolingApi = false;
            if (!sobjectName) {
                const toolingDescribe = await connector.conn.tooling.describeGlobal();
                sobjectName = toolingDescribe.sobjects.find(
                    object => object.keyPrefix === recordId.slice(0, 3)
                )?.name;
                useToolingApi = true;
            }
            if (!sobjectName) throw new Error('No accessible object matches this record ID.');
            if (!isCurrent()) return;
            let conn = useToolingApi ? connector.conn.tooling : connector.conn;
            let [metadata, record] = await Promise.all([
                conn.sobject(sobjectName).describe$(),
                conn.sobject(sobjectName).retrieve(String(recordId), { headers: NO_CACHE_HEADERS }),
            ]);
            if (!metadata && !useToolingApi) {
                useToolingApi = true;
                conn = connector.conn.tooling;
                [metadata, record] = await Promise.all([
                    conn.sobject(sobjectName).describe$(),
                    conn
                        .sobject(sobjectName)
                        .retrieve(String(recordId), { headers: NO_CACHE_HEADERS }),
                ]);
            }
            if (!isCurrent()) return;
            let networkMembers = [];
            if (sobjectName === SOBJECT.contact) {
                networkMembers = await runSilent(
                    async () =>
                        (
                            await connector.conn.query(
                                `SELECT Id, MemberId, NetworkId,Network.Name,Network.Status FROM NetworkMember Where Member.ContactId = '${recordId}' AND Network.Status = 'Live'`
                            )
                        ).records,
                    []
                );
            }
            const recordType = record.RecordTypeId
                ? await connector.conn
                      .sobject('RecordType')
                      .retrieve(String(record.RecordTypeId), { headers: NO_CACHE_HEADERS })
                : null;
            if (!isCurrent()) return;
            this.currentTab = currentTab;
            this.currentOrigin = connector.frontDoorUrl + '&retURL=';
            this.sobjectName = sobjectName;
            this.metadata = { ...metadata, _useToolingApi: useToolingApi === true };
            this.record = record;
            this.recordType = recordType;
            this._loadedOrgKey = orgKey;
            this.networkMembers = networkMembers.map(x => ({
                ...x,
                _redirectLink: `${connector.conn.instanceUrl}/servlet/servlet.su?oid=${encodeURIComponent(connector.configuration.orgId)}&retURL=%2F&sunetworkid=${encodeURIComponent(x.NetworkId)}&sunetworkuserid=${encodeURIComponent(x.MemberId)}`,
            }));
            this.updateData(this.formatData());
            this.dispatchEvent(
                new CustomEvent('dataload', {
                    detail: {
                        recordId,
                        record,
                        recordType,
                        refreshedDate: new Date(),
                        success: true,
                    },
                    bubbles: true,
                    composed: true,
                })
            );
        } catch (e) {
            if (!isCurrent()) return;
            console.error(e);
            this.isError = true;
            this.errorMessage = e.message || 'The record could not be retrieved.';
            this.dispatchEvent(
                new CustomEvent('dataload', {
                    detail: { recordId, success: false, error: e.message },
                    bubbles: true,
                    composed: true,
                })
            );
        } finally {
            if (isCurrent()) this.isLoading = false;
        }
    };

    refreshData = () => this.initRecordExplorer();

    updateData = newData => {
        // to force refresh
        this.data = null;
        this.data = newData;
    };

    formatData = () => {
        const formattedData = this.metadata.fields
            .map(x => {
                const { label, name, type } = x;
                return {
                    name,
                    label,
                    type,
                    fieldInfo: x,
                    isVisible: true,
                    value: this.record.hasOwnProperty(name) ? this.record[name] : null,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        return formattedData;
    };

    @api
    updateFilter = value => {
        this.filter = value;
        this.scrollToTop();
        //this.pageNumber = 1; // reset not working with edit mode for now !
    };

    scrollToTop = () => {
        window.setTimeout(() => {
            this.template.querySelector('.tableFixHead')?.scrollTo({ top: 0, behavior: 'auto' });
        }, 100);
    };

    filtering = arr => {
        //console.log('arr',arr);
        const regex = new RegExp('(' + this.filter + ')', 'i');
        let items = arr.map(item => {
            if (typeof item.value == 'object' && item.value !== null) {
                item.value = JSON.stringify(item.value, null, 2);
            }
            const _value = this.isInfoDisplayed ? item.type : item.value;

            item.isVisible =
                isEmpty(this.filter) ||
                (this.filter === 'false' && _value === false) ||
                (this.filter === 'true' && _value === true) ||
                (this.filter === 'null' && _value === null);
            item.isVisible =
                item.isVisible ||
                (_value != false && _value != true && regex.test(_value)) ||
                regex.test(item.name) ||
                regex.test(item.label);
            return item;
        });
        /** Extra filter */

        if (this.isViewChangeFilterEnabled) {
            const allModifiedFields = this.modifiedRows.map(x => x.fieldName);
            const errorFields = Object.keys(this.fieldErrors);
            items = items.map(item => ({
                ...item,
                isVisible: allModifiedFields.includes(item.name) || errorFields.includes(item.name),
            }));
        }

        return items;
    };

    saveRecord = async () => {
        this.isSaving = true;

        const _connector = this.metadata?._useToolingApi
            ? this.connector.conn.tooling
            : this.connector.conn;

        const allModifiedRows = [
            ...this.template.querySelectorAll('recordviewer-record-explorer-row'),
        ].filter(item => item.isDirty);
        const toUpdate = {
            Id: this.record.Id,
        };

        allModifiedRows.forEach(x => {
            toUpdate[x.name] = x.newValue;
        });

        try {
            const res = await _connector.sobject(this.sobjectName).update([toUpdate]);
            const response = res[0];
            //console.log('###### response ######', response);
            if (response.success === true) {
                Toast.show({
                    label: 'Record saved successfully',
                    variant: 'success',
                });
                //console.log(`Updated Successfully : ${ret.id}`);
                this.resetEditing();
                if (this.isPanel) {
                    refreshCurrentTab();
                }
            } else {
                this.isViewChangeFilterEnabled = true; // To display all the modified fields in case of error.
                const fieldErrorSet = {};
                const fieldErrorGlobal = [];
                // Need to improve in the futur
                response.errors.forEach(error => {
                    const errorFields = error.fields || [];

                    errorFields.forEach(field => {
                        fieldErrorSet[field] = error;
                    });
                    if (errorFields.length == 0) {
                        fieldErrorGlobal.push(error);
                    }
                });
                this.fieldErrors = fieldErrorSet;

                if (fieldErrorGlobal.length > 0) {
                    const label =
                        fieldErrorGlobal[0].statusCode ||
                        fieldErrorGlobal[0].errorCode ||
                        'Update Error';
                    Toast.show({
                        message: fieldErrorGlobal[0].message,
                        label: label,
                        variant: 'error',
                        mode: 'sticky',
                    });
                }
            }
        } catch (e) {
            /** Global Errors are handled here **/
            this.isViewChangeFilterEnabled = true; // To display all the modified fields in case of error.
            console.error(e);
            const label = e.errorCode ? e.errorCode : 'Update Error';
            Toast.show({
                message: e.message,
                label: label,
                variant: 'error',
                mode: 'dismissible',
            });
        }

        this.isSaving = false;
    };

    resetEditing = () => {
        this.isEditMode = false;
        this.isSaving = false;
        this.modifiedRows = [];
        this.isViewChangeFilterEnabled = false;
        const rows = this.template.querySelectorAll('recordviewer-record-explorer-row');
        rows.forEach(row => {
            row.disableInputField();
        });
        this.refreshData();
    };

    generateDefaultQuery = () => {
        return `SELECT Id FROM ${this.metadata.name}`;
    };

    /** Events **/

    handleRedirectDataExplorer = () => {
        const applicationName = 'soql';
        const query = this.generateDefaultQuery();
        const params = new URLSearchParams({ applicationName, query });
        if (this.isPanel) {
            const settings = {
                sessionId: this.connector.conn.accessToken,
                serverUrl: this.connector.conn.instanceUrl,
                baseUrl: chrome.runtime.getURL('/views/app.html'),
                redirectUrl: encodeURIComponent(params.toString()),
            };
            redirectToUrlViaChrome(settings);
        } else {
            navigate(this.navContext, {
                type: 'application',
                state: {
                    applicationName,
                    query,
                },
            });
        }
    };

    handleRedirectToApp = () => {
        const params = new URLSearchParams({
            applicationName: 'recordviewer',
            recordId: this.recordId,
        });
        const settings = {
            sessionId: this.connector.conn.accessToken,
            serverUrl: this.connector.conn.instanceUrl,
            baseUrl: chrome.runtime.getURL('/views/app.html'),
            redirectUrl: encodeURIComponent(params.toString()),
        };
        redirectToUrlViaChrome(settings);
    };

    handleScroll(event) {
        //console.log('handleScroll');
        const target = event.target;
        const scrollDiff = Math.abs(target.clientHeight - (target.scrollHeight - target.scrollTop));
        const isScrolledToBottom = scrollDiff < 5; //5px of buffer
        if (isScrolledToBottom) {
            // Fetch more data when user scrolls to the bottom
            this.pageNumber++;
        }
    }

    handleCopy = e => {
        const { value, label } = e.currentTarget.dataset;
        navigator.clipboard.writeText(value);
        Toast.show({
            label,
            variant: 'success',
        });
    };

    redirectDoc = e => {
        e.preventDefault();
        e.stopPropagation();
        const params = {
            type: 'application',
            state: {
                applicationName: 'documentation',
                attribute1: this.isUsingToolingApi
                    ? 'atlas.en-us.api_tooling.meta'
                    : 'atlas.en-us.object_reference.meta',
                name: this.isUsingToolingApi
                    ? `tooling_api_objects_${this.sobjectName.toLowerCase()}`
                    : `sforce_api_objects_${this.sobjectName.toLowerCase()}`,
            },
        };

        legacyStore.dispatch(store_application.fakeNavigate(params));
    };

    handleRefreshClick = () => {
        this.refreshData();
    };

    handleInfoToggle = () => {
        this.isLoading = true;
        window.setTimeout(() => {
            this.isInfoDisplayed = !this.isInfoDisplayed;
            this.isLoading = false;
        }, 1);
    };

    handleCancelClick = () => {
        this.resetEditing();
    };

    handleSaveClick = () => {
        // Save data;
        this.saveRecord();
    };

    handleEnabledEditMode = e => {
        const { fieldName } = e.detail;
        this.editingFieldSet.add(fieldName);
        this.isEditMode = true;
        /*let rows = this.template.querySelectorAll('recordviewer-record-explorer-row');
            rows.forEach(row => {
                row.enableInputField();
            });*/
    };

    handleToggleFieldName = () => {
        this.isLabelDisplayed = !this.isLabelDisplayed;
    };

    handleRowInputChange = e => {
        e.stopPropagation();
        //console.log('handleRowInputChange',e);
        const allModifiedRows = [
            ...this.template.querySelectorAll('recordviewer-record-explorer-row'),
        ].filter(item => item.isDirty);
        this.modifiedRows = allModifiedRows.map(x => ({ fieldName: x.name }));
        //console.log('modifiedRows',this.modifiedRows);
    };

    handleViewChanges_filter = e => {
        this.isViewChangeFilterEnabled = !this.isViewChangeFilterEnabled;
    };

    /** Getters */

    get isNetworkMemberListDisplayed() {
        return this.networkMembers.length > 0;
    }

    /*
    addEntity = ({entity,api}) => {
        let item = this.entities.get(entity.name);
        if(item){
            if(!item.keyPrefix){ 
                item.keyPrefix = entity.keyPrefix;
            }
        }else{
            item = entity;
            item.availableApis = [];
        }
        if (api) {
            item.availableApis.push(api);
            if (entity.keyPrefix) {
                item.availableKeyPrefix = entity.keyPrefix;
            }
        }
        this.entities.set(item.name,item);
    }
    
    getObjects = (connector,api) =>{
        return connector.describeGlobal().then(describe => {
            for (let entity of describe.sobjects) {
                this.addEntity({entity,api})
            }
        }).catch(err => {
          console.error("list " + api + " sobjects", err);
        });
    }*/

    get modifiedRowsTotal() {
        return this.modifiedRows.length;
    }

    get viewChangeLabel() {
        return this.isViewChangeFilterEnabled ? 'Unfilter Changes' : 'Filter Changes';
    }

    get labelPlural() {
        return this.metadata?.labelPlural;
    }

    get label() {
        //console.log('this.metadata', this.metadata);
        return this.metadata?.label;
    }

    get developerName() {
        return this.metadata?.name;
    }

    get keyPrefix() {
        return this.metadata?.keyPrefix;
    }

    get fieldLabel() {
        return this.isLabelDisplayed ? 'Label' : 'Field';
    }

    get linkConfig() {
        return {
            host: this.currentOrigin,
            needEncoding: true,
            sobjectName: this.sobjectName,
            durableId: this.metadata?.durableId,
            isCustomSetting: this.metadata?.IsCustomSetting,
            keyPrefix: this.metadata?.keyPrefix,
        };
    }

    get recordTypeName() {
        if (isNotUndefinedOrNull(this.recordType)) {
            return `${this.recordType.Name} / ${this.recordType.DeveloperName}`;
        }
        return '';
    }

    get objectSetupLink() {
        return getObjectSetupLink(this.linkConfig);
    }

    get objectFieldsSetupLink() {
        return getObjectFieldsSetupLink(this.linkConfig);
    }

    get recordTypesLink() {
        return getRecordTypesLink(this.linkConfig);
    }

    get objectListLink() {
        return getObjectListLink(this.linkConfig);
    }

    get objectDocLink() {
        return getObjectDocLink(this.sobjectName, this.isUsingToolingApi);
    }

    get virtualList() {
        // Best UX Improvement !!!!
        // return this.formattedData.slice(0,this.pageNumber * PAGE_LIST_SIZE);
        const allModifiedFields = this.modifiedRows.map(x => x.fieldName);
        const virtualList = [];
        this.formattedData.forEach((x, i) => {
            if (virtualList.length < this.pageNumber * PAGE_LIST_SIZE && x.isVisible) {
                virtualList.push(x);
            } else if (allModifiedFields.includes(x.name)) {
                virtualList.push({
                    ...x,
                    isVisible: false,
                });
            }
        });
        return virtualList;
    }

    get formattedData() {
        return this.filtering(this.data || []);
    }

    get isRecordIdAvailable() {
        return (
            isNotUndefinedOrNull(this.recordId) &&
            !this.isError &&
            !!this.record &&
            this._loadedOrgKey === investigationOrgKey(this.connector)
        );
    }

    get isChangeMessageDisplayed() {
        return this.modifiedRowsTotal > 0;
    }

    get versions_options() {
        return this.versions.map(x => ({
            label: x.label,
            value: x.version,
        }));
    }

    get displayRecordHeader() {
        return !this.isLoading && !this.isSaving;
    }

    /*
    registerDependentField(e) {
        e.stopPropagation();

        const { fieldName, fieldElement } = e.detail;
        this._depManager.registerField({ fieldName, fieldElement });
    }

    updateDependentFields(e) {
        e.stopPropagation();

        if (this._depManager) {
            this._depManager.handleFieldValueChange(
                e.detail.fieldName,
                e.detail.value
            );
        }
    }
    */

    get isSaveButtonDisabled() {
        return this.modifiedRowsTotal <= 0 || this.isSaving;
    }

    get isCancelButtonDisabled() {
        return this.isSaving;
    }

    get isUsingToolingApi() {
        return this.metadata?._useToolingApi;
    }

    get docLinkTitle() {
        return this.metadata?._useToolingApi ? 'Tooling' : 'Standard';
    }

    get buttonSize() {
        return this.isPanel ? 'small' : 'medium';
    }

    get infoButtonClass() {
        return `toolbar-btn${this.isInfoDisplayed ? ' is-active' : ''}`;
    }
}
