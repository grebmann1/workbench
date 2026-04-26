import { createSlice, createAsyncThunk, createEntityAdapter } from '@reduxjs/toolkit';
import {
    lowerCaseKey,
    guid,
    isNotUndefinedOrNull,
    METADATA as METADATA_UTILS,
} from 'shared/utils';
import { BACKGROUNDJOB, DESCRIBE, ERROR } from 'host-api/store';
import { loadSpecificMetadata, loadSpecificMetadataException } from 'metadata/slices/metadata';
import { getStore } from 'core/store/storeRef';
import type { ConnectorLike, ConnectionLike } from 'host-api/connector';

const PACKAGE_SETTINGS_KEY = 'PACKAGE_SETTINGS_KEY';

/** Methods */

function loadCacheSettings(alias) {
    try {
        const configText = localStorage.getItem(`${alias}-${PACKAGE_SETTINGS_KEY}`);
        if (configText) return JSON.parse(configText);
    } catch (e) {
        console.error('Failed to load CONFIG from localStorage', e);
    }
    return null;
}

function saveCacheSettings(alias, state) {
    console.log('saveCacheSettings');
    try {
        const { currentMethod, leftPanelToggled } = state;

        localStorage.setItem(
            `${alias}-${PACKAGE_SETTINGS_KEY}`,
            JSON.stringify({
                currentMethod,
                leftPanelToggled,
            })
        );
    } catch (e) {
        console.error('Failed to save CONFIG to localstorage', e);
    }
}

/** Redux */

const toTime = value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Date.now() : parsed;
};

const buildPackageJob = ({
    connector,
    createdDate,
    type,
}: {
    connector: ConnectionLike | null;
    createdDate: string | number | Date;
    type: string;
}) => {
    const alias = connector?.alias || connector?.instanceUrl || 'unknown';
    const startedAt = toTime(createdDate);
    return {
        id: `package-${type}-${alias}-${startedAt}`,
        category: 'package',
        label: `${type === 'deploy' ? 'Deploy' : 'Retrieve'} package (${alias})`,
        status: 'running',
        phase: 'start',
        message: `${type === 'deploy' ? 'Deploying' : 'Retrieving'} metadata package`,
        source: `package.${type}`,
        startedAt,
        updatedAt: Date.now(),
    };
};

export const executePackageDeploy = createAsyncThunk(
    'package/deploy',
    async (
        {
            connector,
            zip64,
            options,
            createdDate,
        }: {
            connector: ConnectorLike;
            zip64: string;
            options: Record<string, any>;
            createdDate: string | number | Date;
        },
        { dispatch }
    ) => {
        const job = buildPackageJob({
            connector: connector?.conn,
            createdDate,
            type: 'deploy',
        });
        dispatch(BACKGROUNDJOB.reduxSlice.actions.upsertJob(job));
        try {
            const result = await new Promise((resolve, reject) => {
                const asyncResult = connector.conn.metadata.deploy(zip64, options);
                asyncResult.then(res => resolve(res)).catch(e => reject(e));
            });
            dispatch(
                BACKGROUNDJOB.reduxSlice.actions.completeJob({
                    ...job,
                    phase: 'done',
                    message: 'Package deployment finished',
                    resultSummary: result?.status ? `Status: ${result.status}` : 'Deployment finished',
                    updatedAt: Date.now(),
                })
            );
            return result;
        } catch (error) {
            dispatch(
                BACKGROUNDJOB.reduxSlice.actions.failJob({
                    ...job,
                    phase: 'error',
                    message: 'Package deployment failed',
                    error: error?.message || 'Package deployment failed',
                    updatedAt: Date.now(),
                })
            );
            throw error;
        }
    }
);
const _retrievePackage = (
    connector: ConnectorLike,
    request: Record<string, any>,
    proxyUrl?: string | null
) => {
    return new Promise((resolve, reject) => {
        const metadataApi = connector.conn.metadata;
        metadataApi.pollTimeout = 1200000; // 20 min

        const requestPromise = metadataApi.retrieve(request);
        // Temporary solution as JSFORCE is crashing when the zip file is too large.
        requestPromise.on('complete', async res => {
            let body = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><soapenv:Header xmlns="http://soap.sforce.com/2006/04/metadata"><SessionHeader><sessionId>${connector.conn.accessToken}</sessionId></SessionHeader></soapenv:Header><soapenv:Body xmlns="http://soap.sforce.com/2006/04/metadata"><checkRetrieveStatus><asyncProcessId>${res.id}</asyncProcessId></checkRetrieveStatus></soapenv:Body></soapenv:Envelope>`;

            // Fetch metadata using SOAP API
            const targetUrl = `${connector.conn.instanceUrl}/services/Soap/m/${connector.conn.version}`;
            const url = proxyUrl ? proxyUrl : targetUrl;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml',
                    SOAPAction: '""',
                    'salesforceproxy-endpoint': targetUrl,
                },
                body,
            });

            if (!response.ok) {
                reject(response.status);
            }

            const responseText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(responseText, 'text/xml');
            const zipFile = xmlDoc.getElementsByTagName('zipFile')[0]?.textContent;
            const id = xmlDoc.getElementsByTagName('id')[0]?.textContent;
            const success = xmlDoc.getElementsByTagName('success')[0]?.textContent;
            const status = xmlDoc.getElementsByTagName('status')[0]?.textContent;
            resolve({ zipFile, id, success, status });
        });
        requestPromise.on('error', e => reject(e));
        requestPromise.poll(3000, metadataApi.pollTimeout);
    });
};
export const executePackageRetrieve = createAsyncThunk(
    'package/retrieve',
    async (
        {
            connector,
            request,
            createdDate,
            proxyUrl,
        }: {
            connector: ConnectorLike;
            request: Record<string, any>;
            createdDate: string | number | Date;
            proxyUrl?: string | null;
        },
        { dispatch }
    ) => {
        const job = buildPackageJob({
            connector: connector?.conn,
            createdDate,
            type: 'retrieve',
        });
        dispatch(BACKGROUNDJOB.reduxSlice.actions.upsertJob(job));
        try {
            const response = await _retrievePackage(connector, request, proxyUrl);
            dispatch(
                BACKGROUNDJOB.reduxSlice.actions.completeJob({
                    ...job,
                    phase: 'done',
                    message: 'Package retrieve finished',
                    resultSummary: response?.status
                        ? `Status: ${response.status}`
                        : 'Retrieve finished',
                    actions:
                        response?.zipFile && response?.id
                            ? [
                                  {
                                      id: 'download-zip',
                                      kind: 'downloadBase64',
                                      label: 'Download ZIP',
                                      payload: {
                                          contentBase64: response.zipFile,
                                          mimeType: 'application/zip',
                                          fileName: `retrieve_${response.id}.zip`,
                                      },
                                  },
                              ]
                            : [],
                    updatedAt: Date.now(),
                })
            );
            return { data: response };
        } catch (error) {
            dispatch(
                BACKGROUNDJOB.reduxSlice.actions.failJob({
                    ...job,
                    phase: 'error',
                    message: 'Package retrieve failed',
                    error: error?.message || 'Package retrieve failed',
                    updatedAt: Date.now(),
                })
            );
            throw error;
        }
    }
);

/*
export const cancelPackageDeploy = createAsyncThunk(
    'package/cancel',
    async ({ connector, requestId}, { dispatch,getState }) => {
        // Get the promise, update the currentDeploymentJob with the deploymentId and then operate the "Complete"
        const cancelResult = connector.conn.metadata._invoke('cancelDeploy', { id:requestId });
        
        console.log('cancelResult',cancelResult);
        return cancelResult;
    }
);
*/

// Metadata menu thunks (isolated from the METADATA slice so the Deployment Manager
// catalog doesn't share browsing state with the Metadata Explorer).
const fetchMenuGlobalMetadata = createAsyncThunk(
    'package/menu/fetchGlobalMetadata',
    async (_, { dispatch, getState, rejectWithValue }) => {
        try {
            const { application } = getState() as any;
            const { tooling } = (
                await dispatch(
                    DESCRIBE.describeSObjects({
                        connector: application.connector.conn,
                    })
                )
            ).payload;
            const sobjects = tooling.sobjects.map(obj => obj.name);
            const { metadataObjects } = (
                await dispatch(
                    DESCRIBE.describeVersion({
                        connector: application.connector.conn,
                    })
                )
            ).payload;
            let result = metadataObjects
                .filter(obj => !METADATA_UTILS.METADATA_EXCLUDE_LIST.includes(obj.xmlName))
                .map(obj => ({
                    ...obj,
                    name: obj.xmlName,
                    label: obj.xmlName,
                    key: obj.xmlName,
                    isSobject: sobjects.includes(obj.xmlName),
                }));
            result = [
                ...result,
                ...METADATA_UTILS.METADATA_EXCEPTION_LIST.filter(x => x.isSearchable),
            ];
            return { records: result, label: 'Metadata' };
        } catch (error) {
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: 'Error fetching global metadata for package',
                    details: error.message,
                })
            );
            return rejectWithValue(error.message);
        }
    }
);

const fetchMenuSpecificMetadata = createAsyncThunk(
    'package/menu/fetchSpecificMetadata',
    async (
        { sobject, bypass = false, force = false }: any,
        { dispatch, getState, rejectWithValue }
    ) => {
        try {
            await dispatch(packageSlice.actions.setMenuAttributes({ sobject }));
            const { application, package2 } = getState() as any;
            const exceptionMetadata =
                METADATA_UTILS.METADATA_EXCEPTION_LIST.find(x => x.name === sobject) || null;
            if (
                package2.menu_currentMetadata !== sobject ||
                force ||
                !package2.menu_metadata_records
            ) {
                const _metadata = exceptionMetadata
                    ? await loadSpecificMetadataException(
                          application.connector,
                          exceptionMetadata,
                          null,
                          1,
                          bypass
                      )
                    : await loadSpecificMetadata(
                          application.connector,
                          sobject,
                          bypass,
                          package2.menu_metadata_global?.records
                      );
                return {
                    currentMetadata: sobject,
                    metadata: _metadata,
                };
            }
            return {
                currentMetadata: package2.menu_currentMetadata,
                metadata: package2.menu_metadata_records,
            };
        } catch (error) {
            getStore()?.dispatch(
                ERROR.reduxSlice.actions.addError({
                    message: 'Error fetching specific metadata for package',
                    details: error.message,
                })
            );
            return rejectWithValue(error.message);
        }
    }
);

// Create a slice with reducers and extraReducers
const packageSlice = createSlice({
    name: 'package',
    initialState: {
        leftPanelToggled: false,
        currentMethod: null,
        currentDeploymentJob: null,
        currentRetrieveJob: null,
        // Metadata menu (isolated from METADATA slice)
        menu_isLoading: false,
        menu_loadingMessage: '',
        menu_currentMetadata: null,
        menu_metadata_global: null,
        menu_metadata_records: null,
        menu_param1: null,
        menu_label1: null,
        menu_sobject: null,
    },
    reducers: {
        loadCacheSettings: (state, action) => {
            const { alias } = action.payload;
            const cachedConfig = loadCacheSettings(alias);
            if (cachedConfig) {
                const { currentMethod } = cachedConfig;
                Object.assign(state, {
                    currentMethod,
                });
            }
            console.log('#cachedConfig#', cachedConfig);
        },
        saveCacheSettings: (state, action) => {
            const { alias } = action.payload;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        updateCurrentMethodPanel: (state, action) => {
            const { value, alias } = action.payload;
            state.currentMethod = value;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        updateLeftPanel: (state, action) => {
            const { value, alias } = action.payload;
            state.leftPanelToggled = value === true;
            if (isNotUndefinedOrNull(alias)) {
                saveCacheSettings(alias, state);
            }
        },
        clearCurrentDeploymentJob: (state, action) => {
            state.currentDeploymentJob = null;
        },
        clearCurrentRetrieveJob: (state, action) => {
            state.currentRetrieveJob = null;
        },
        setMenuAttributes: (state, action) => {
            const { sobject, param1, label1 } = action.payload || {};
            if (sobject !== undefined) state.menu_sobject = sobject;
            if (param1 !== undefined) state.menu_param1 = param1;
            if (label1 !== undefined) state.menu_label1 = label1;
        },
        menuGoBack: state => {
            state.menu_metadata_records = null;
            state.menu_currentMetadata = null;
            state.menu_param1 = null;
            state.menu_label1 = null;
        },
        /*setCurrentDeploymentJobId :(state, action) => {
            const { id } = action.payload;
            if(state.currentDeploymentJob){
                Object.assign(state.currentDeploymentJob,{id});
            }
        }*/
    },
    extraReducers: builder => {
        builder
            .addCase(executePackageDeploy.pending, (state, action) => {
                const { createdDate } = action.meta.arg;
                state.currentDeploymentJob = {
                    isFetching: true,
                    error: null,
                    createdDate,
                };
            })
            .addCase(executePackageDeploy.fulfilled, (state, action) => {
                Object.assign(state.currentDeploymentJob, {
                    isFetching: false,
                    data: action.payload,
                });
            })
            .addCase(executePackageDeploy.rejected, (state, action) => {
                const { error } = action;
                Object.assign(state.currentDeploymentJob, {
                    isFetching: false,
                    error,
                });
            })
            .addCase(executePackageRetrieve.pending, (state, action) => {
                const { createdDate } = action.meta.arg;
                state.currentRetrieveJob = {
                    isFetching: true,
                    error: null,
                    createdDate,
                };
            })
            .addCase(executePackageRetrieve.fulfilled, (state, action) => {
                Object.assign(state.currentRetrieveJob, {
                    isFetching: false,
                    data: action.payload.data,
                });
            })
            .addCase(executePackageRetrieve.rejected, (state, action) => {
                const { error } = action;
                Object.assign(state.currentRetrieveJob, {
                    isFetching: false,
                    error,
                });
            })
            // Menu: global metadata types
            .addCase(fetchMenuGlobalMetadata.pending, state => {
                state.menu_isLoading = true;
                state.menu_loadingMessage = 'Loading All Metadata';
            })
            .addCase(fetchMenuGlobalMetadata.fulfilled, (state, action) => {
                state.menu_isLoading = false;
                state.menu_metadata_global = action.payload;
            })
            .addCase(fetchMenuGlobalMetadata.rejected, state => {
                state.menu_isLoading = false;
            })
            // Menu: specific metadata records
            .addCase(fetchMenuSpecificMetadata.pending, state => {
                state.menu_isLoading = true;
                state.menu_loadingMessage = 'Loading Records';
            })
            .addCase(fetchMenuSpecificMetadata.fulfilled, (state, action) => {
                state.menu_isLoading = false;
                state.menu_metadata_records = action.payload.metadata;
                state.menu_currentMetadata = action.payload.currentMetadata;
            })
            .addCase(fetchMenuSpecificMetadata.rejected, state => {
                state.menu_isLoading = false;
            });
    },
});

export const reduxSlice = packageSlice;
export { fetchMenuGlobalMetadata, fetchMenuSpecificMetadata };
