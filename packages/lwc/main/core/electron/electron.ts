import { store, APPLICATION, DOCUMENT, SELECTORS } from 'core/store';
import ToolkitElement from 'core/toolkitElement';
import { invokeCommand } from 'host-api/commands';
import { wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import LOGGER from 'shared/logger';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';
import { guid, isNotUndefinedOrNull, API as API_UTILS } from 'shared/utils';

type ElectronListener = (channel: string, handler: (args: any) => void) => void;

export default class Electron extends ToolkitElement {
    @wire(NavigationContext)
    navContext: any;

    initialized = false;
    listener_on: ElectronListener | undefined;

    connectedCallback() {
        this.init();
    }

    /**
     * SOQL owns its tabs. We ask the SOQL extension whether the tabId
     * exists; if SOQL isn't mounted (invokeCommand returns undefined),
     * we treat it as "no existing tab" and mint a new one.
     */
    formatTabId = async (tabId?: string | null) => {
        if (isNotUndefinedOrNull(tabId)) {
            const exists = await invokeCommand<{ tabId: string }, boolean>('soql.hasTab', {
                tabId: tabId as string,
            });
            if (exists) {
                return { tabId, isNewTab: false };
            }
        }
        return { tabId: guid(), isNewTab: true };
    };

    init = () => {
        if (this.initialized) return;
        try {
            this.listener_on = window.electron.listener_on;
        } catch (e) {
            this.listener_on = undefined;
        }
        if (this.listener_on) LOGGER.info('[Electron] init');
        {
            this.handleSOQL(this.listener_on);
            this.handleRestAPI(this.listener_on);
            this.handleAnonymousApex(this.listener_on);

            // Listen for navigation requests
            this.listener_on('electron-navigate-to', async args => {
                const [payload, callBackChannel] = args;
                LOGGER.info('[Electron] @navigate-to call args:', args);
                // Dispatch a navigation action
                const formattedPayload = `sftoolkit:${JSON.stringify({
                    type: 'application',
                    state: { applicationName: payload.application },
                })}`;
                await legacyStore.dispatch(legacyStore_application.navigate(formattedPayload));
                window.electron.send(callBackChannel, payload);
            });

            this.listener_on('desktop-command', async args => {
                const [payload, callBackChannel] = args;
                LOGGER.info('[Electron] @desktop-command call:', payload?.command?.type);
                const output = await this.handleDesktopCommand(payload?.command);
                window.electron.send(callBackChannel, output);
            });

            // Listen for getSettings requests and reply with settings
            this.listener_on('electron-get-settings', event => {
                // Fetch settings from the store
                const settings = store.getState().application; // Adjust as needed
                LOGGER.info('[Electron] getSettings requested, sending:', settings);
                //this.ipcRenderer.send('electron-get-settings-response', settings);
            });
        }
        this.initialized = true;
    };

    handleDesktopCommand = async command => {
        try {
            if (command?.type === 'openPage') {
                const route = command.route || {};
                await this.openPage(route.applicationName, route.state || {});
                return { status: 'success' };
            }

            if (command?.type === 'execute' && command.action?.kind === 'soqlQuery') {
                return await this.executeDesktopSoql(command.action);
            }

            if (command?.type === 'execute' && command.action?.kind === 'apiRequest') {
                return await this.executeDesktopApi(command.action);
            }

            if (command?.type === 'execute' && command.action?.kind === 'apexRun') {
                return await this.executeDesktopApex(command.action);
            }

            throw new Error(`Unsupported desktop command: ${command?.type || '<missing>'}`);
        } catch (error) {
            return {
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    name: error instanceof Error ? error.name : 'Error',
                },
            };
        }
    };

    openPage = async (applicationName, state = {}) => {
        if (!applicationName) {
            throw new Error('Application name is required.');
        }

        navigate(this.navContext, {
            type: 'application',
            state: {
                applicationName,
                ...state,
            },
        });
    };

    requireConnector = () => {
        if (!this.connector) {
            throw new Error('No active org connector found.');
        }

        return this.connector;
    };

    executeDesktopSoql = async action => {
        const connector = this.requireConnector();
        const tabId = `cli-${Date.now()}`;
        await this.openPage('soql');
        const res = (await invokeCommand('soql.executeQuery', {
            connector,
            soql: action.query,
            tabId,
            useToolingApi: Boolean(action.useToolingApi),
            includeDeletedRecords: Boolean(action.includeDeletedRecords),
        })) as { payload?: any; error?: any } | undefined;
        if (!res) {
            return { error: 'SOQL extension is not available.', tabId };
        }
        await invokeCommand('soql.selectTab', { tabId });
        return {
            ...(res.payload || {}),
            ...(res.error ? { error: res.error } : {}),
            tabId,
        };
    };

    executeDesktopApi = async action => {
        const connector = this.requireConnector();
        const tabId = `cli-${Date.now()}`;
        await this.openPage('api');
        const { request, error } = API_UTILS.formatApiRequest({
            endpoint: action.endpoint,
            method: action.method || 'GET',
            body: action.body || '',
            header: action.headerText || API_UTILS.DEFAULT.HEADER,
            connector,
        });
        if (error) {
            throw new Error(error);
        }

        const res = (await invokeCommand('api.executeRequest', {
            connector,
            request: {
                endpoint: request.endpoint,
                method: request.method,
                body: request.body,
                header: request.header,
            },
            formattedRequest: request,
            tabId,
            createdDate: Date.now(),
        })) as { payload?: any; error?: any } | undefined;
        if (!res) {
            return { error: 'API extension is not available.', tabId };
        }
        return {
            ...(res.payload?.response || res.payload || {}),
            ...(res.error ? { error: res.error } : {}),
            tabId,
        };
    };

    executeDesktopApex = async action => {
        const connector = this.requireConnector();
        const tabId = `cli-${Date.now()}`;
        if (action.shouldOpenUi !== false) {
            await this.openPage('anonymousapex');
        }

        const res = (await invokeCommand('anonymousApex.executeApex', {
            connector,
            body: action.apexCode,
            tabId,
            createdDate: Date.now(),
        })) as { payload?: any; error?: any } | undefined;
        if (!res) {
            return { error: 'Anonymous Apex extension is not available.', tabId };
        }
        return {
            ...(res.payload?.response || res.payload || {}),
            ...(res.error ? { error: res.error } : {}),
            tabId,
        };
    };

    handleSOQL = (listener: ElectronListener) => {
        // Listen for @soql calls from main process
        listener('/soql/query', async args => {
            const [payload, callBackChannel] = args;
            LOGGER.info('[Electron] @soql call args:', args);

            const { tabId, isNewTab } = await this.formatTabId(payload.tabId);

            const { application } = store.getState();
            if (application.isLoading) await this.waitForLoaded();

            navigate(this.navContext, {
                type: 'application',
                state: { applicationName: 'soql' },
            });

            await invokeCommand('soql.openOrSelectTab', {
                tabId,
                isNewTab,
                body: payload.query,
            });

            const res = (await invokeCommand('soql.executeQuery', {
                connector: this.connector,
                soql: payload.query,
                tabId,
                useToolingApi: false,
                includeDeletedRecords: false,
            })) as { payload?: any; error?: any } | undefined;

            LOGGER.debug('Execute Query [res]', res);
            await invokeCommand('soql.selectTab', { tabId });

            let _output: any;
            if (!res) {
                _output = { error: 'SOQL extension is not available.' };
            } else if (res.error) {
                _output = { error: res.error };
            } else {
                _output = { ...(res.payload || {}) };
            }
            _output.tabId = tabId;
            LOGGER.debug('MCP Response [output]', _output);
            window.electron.send(callBackChannel, _output);
        });

        // Listen for navigate-tab requests
        listener('/soql/navigate-tab', async args => {
            const [payload, callBackChannel] = args;
            LOGGER.info('[Electron] @soql navigate-tab args:', args);
            navigate(this.navContext, { type: 'application', state: { applicationName: 'soql' } });
            const { tabId, isNewTab } = await this.formatTabId(payload.tabId);
            const _output: any = { tabId };
            if (!isNewTab) {
                _output.status = 'success';
                await invokeCommand('soql.selectTab', { tabId });
            } else {
                _output.status = 'error';
                _output.message = 'Tab not found';
            }
            window.electron.send(callBackChannel, _output);
        });

        // listen for fetch query from Saved List
        listener('/soql/queries', async args => {
            const [payload, callBackChannel] = args;
            LOGGER.info('[Electron] @soql queries args:', args);
            // Dispatch a SOQL/QUERY action (customize as needed)
            LOGGER.info('[Electron] @soql current alias:', this.alias);
            await store.dispatch(
                DOCUMENT.reduxSlices.QUERYFILE.actions.loadFromStorage({
                    alias: this.alias,
                })
            );
            const { queryFiles } = store.getState();
            const entities = SELECTORS.queryFiles.selectAll({ queryFiles });
            // Taken from soql/app.js
            const queries = entities
                .filter(item => item.isGlobal || item.alias == this.alias)
                .map((item, index) => {
                    return item; // no mutation for now
                });
            LOGGER.info('[Electron] @soql saved queries:', queries);
            window.electron.send(callBackChannel, queries);
        });
    };

    handleAnonymousApex = (listener: ElectronListener) => {
        listener('/apex/execute', async args => {
            const [payload, callBackChannel] = args;
            const { body } = payload;
            LOGGER.info('[Electron] @apex/executeAnonymous call args:', args);

            const { tabId, isNewTab } = await this.formatTabId(payload.tabId);

            const { application } = store.getState();
            if (application.isLoading) await this.waitForLoaded();

            navigate(this.navContext, {
                type: 'application',
                state: { applicationName: 'anonymousapex' },
            });

            const res = (await invokeCommand('anonymousApex.executeApex', {
                connector: this.connector,
                body,
                tabId,
                isNewTab,
                createdDate: Date.now(),
            })) as { payload?: any; error?: any } | undefined;

            LOGGER.debug('Execute Apex [res]', res);

            let _output: any;
            if (!res) {
                _output = { error: 'Anonymous Apex extension is not available.' };
            } else {
                _output = { ...(res.payload?.response || {}) };
                if (res.error) _output.error = res.error;
            }
            _output.tabId = tabId;
            window.electron.send(callBackChannel, _output);
        });

        // listen for fetch query from Saved List
        listener('/apex/scripts', async args => {
            const [payload, callBackChannel] = args;
            LOGGER.info('[Electron] @apex/scripts queries args:', args);
            LOGGER.info('[Electron] @apex/scripts current alias:', this.alias);
            await store.dispatch(
                DOCUMENT.reduxSlices.APEXFILE.actions.loadFromStorage({
                    alias: this.alias,
                })
            );
            const { apexFiles } = store.getState();
            const entities = SELECTORS.apexFiles.selectAll({ apexFiles });

            const scripts = entities.filter(item => item.isGlobal || item.alias == this.alias);
            LOGGER.info('[Electron] @apex/scripts saved scripts:', scripts);
            window.electron.send(callBackChannel, scripts);
        });
    };

    handleRestAPI = (listener: ElectronListener) => {
        listener('/api/execute', async args => {
            const [payload, callBackChannel] = args;
            LOGGER.info('[Electron] @api/execute call args:', args);

            const { tabId, isNewTab } = await this.formatTabId(payload.tabId);

            const { application } = store.getState();
            if (application.isLoading) await this.waitForLoaded();

            navigate(this.navContext, {
                type: 'application',
                state: { applicationName: 'api' },
            });

            const headers =
                Object.keys(payload.headers || {})
                    .map(key => `${key}: ${payload.headers[key]}`)
                    .join('\n') || API_UTILS.DEFAULT.HEADER;

            const { request, error } = API_UTILS.formatApiRequest({
                endpoint: payload.endpoint,
                method: payload.method,
                body: payload.body,
                header: headers,
                connector: this.connector,
            });
            LOGGER.log('Execute API [request]', request, 'error', error);

            let tab: any;
            if (isNewTab) {
                tab = API_UTILS.generateDefaultTab(this.currentApiVersion, tabId);
                tab.body = request.body;
                tab.header = headers;
                tab.method = request.method;
                tab.endpoint = request.endpoint;
                tab.fileId = null;
            }

            const res = (await invokeCommand('api.executeRequest', {
                connector: this.connector,
                request: {
                    endpoint: request.endpoint,
                    method: request.method,
                    body: request.body,
                    header: request.header,
                },
                formattedRequest: request,
                tabId,
                isNewTab,
                tab,
                createdDate: Date.now(),
            })) as { payload?: any; error?: any } | undefined;

            LOGGER.debug('Execute API [res]', res);

            let _output: any;
            if (!res) {
                _output = { error: 'API extension is not available.' };
            } else {
                _output = { ...(res.payload?.response || {}) };
                if (res.error) _output.error = res.error;
            }
            _output.tabId = tabId;
            window.electron.send(callBackChannel, _output);
        });

        listener('/api/scripts', args => {
            const [payload, callBackChannel] = args;
            LOGGER.info('[Electron] @api/scripts call args:', args);
            const { apiFiles } = store.getState();
            const entities = SELECTORS.apiFiles.selectAll({ apiFiles });
            const apiFilesFiltered = entities.filter(
                item => item.isGlobal || item.alias == this.alias
            );
            window.electron.send(callBackChannel, apiFilesFiltered);
        });
    };

    sendToMain(channel, payload) {
        if (this.ipcRenderer) {
            //this.ipcRenderer.send(channel, payload);
        }
    }

    /**
     * Waits until the application is no longer loading.
     * Checks every second and resolves when loading is complete.
     * @returns {Promise<void>}
     */
    waitForLoaded() {
        return new Promise(resolve => {
            const checkLoading = () => {
                const { application } = store.getState();
                if (!application.isLoading) {
                    clearInterval(intervalId);
                    resolve();
                }
            };
            checkLoading(); // Check immediately in case already loaded
            const intervalId = setInterval(checkLoading, 1000);
        });
    }
}
