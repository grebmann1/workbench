import { APP_LIST } from 'core/applications';
import ConnectPrompt from 'connection/connectPrompt';
import { runQuickConnect } from 'connection/quickConnect';
import {
    getConfiguration,
    getConfigurations,
    setConfigurations,
    extractConfig,
    normalizeConfiguration,
    saveSession,
} from 'core/connector';
import {
    checkDesktopCommands,
    getDesktopLaunchIntent,
    onDesktopLaunchIntent,
} from 'core/desktopBridge';
import { connectStore, store, DOCUMENT, APPLICATION, SHELL } from 'core/store';
import { LightningElement, track, api, wire } from 'lwc';
import { NavigationContext, CurrentPageReference, navigate } from 'lwr/navigation';
import LOGGER from 'shared/logger';
import { cacheManager } from 'shared/cacheManager';
import { store as legacyStore, store_application } from 'shared/store';
import {
    guid,
    isNotUndefinedOrNull,
    classSet,
    isUndefinedOrNull,
    isEmpty,
    isElectronApp,
    isChromeExtension,
    decodeBase64UrlToJson,
} from 'shared/utils';
/** Apps  **/

/** Helpers **/
import { connectToBackgroundWithIdentity, disconnectFromBackground } from './background';
import { initCacheStorage, loadFromCache } from './cache';
import { loadLimitedMode, loadFullMode } from './session';
import { initShortcuts } from './shortcuts';
import { resolveTabClose } from './tabNavigation';
import { resolveTaskTarget } from './taskNavigation';
import { getShellLayout } from './layout';
import { MIN_TOOL_WIDTH } from './constants';

/** Store **/

const LIMITED = 'limited';

export * as CONFIG from 'core/applications';

export default class App extends LightningElement {
    @wire(NavigationContext)
    navContext;

    @api mode;
    @api redirectUrl;
    // for Extension (Limited Mode)
    @api sessionId;
    @api serverUrl;
    // for Electron (Limited Mode)
    @api alias;

    version;
    isApplicationTabVisible = false;
    betaSmartInputEnabled = false;
    isSalesforceCliInstalled = false;
    isJavaCliInstalled = false;
    isCommandCheckFinished = false;
    isMenuHidden = false;
    isMenuCollapsed = false;
    pageHasLoaded = false;
    targetPage;
    _isLoggedIn = false;
    _removeDesktopLaunchIntentListener = null;
    pendingTaskPath: string | null = null;
    isConnecting = false;
    connectionError = '';
    shellWidth = window.innerWidth;
    compactNavigationExpanded = false;
    _resizeObserver: ResizeObserver | null = null;
    _focusSurface: 'navigation' | 'assistant' | null = null;

    // Full App Loading
    _isFullAppLoading = false;
    _fullAppLoadingMessage;

    @track applications = [];

    currentApplicationId;

    // Port to communicate with background
    _backgroundPort = null;

    // Agent View
    @api isAgentChatExpanded = false;

    @wire(connectStore, { store: legacyStore })
    applicationChange({ application }) {
        // Open Application
        if (application.isOpen) {
            const { target } = application;
            this.handleApplicationSelection(target);
        }

        // Toggle Menu
        if (isNotUndefinedOrNull(application.isMenuDisplayed)) {
            this.isMenuHidden = !application.isMenuDisplayed;
        } else if (isNotUndefinedOrNull(application.isMenuExpanded)) {
            this.isMenuCollapsed = !application.isMenuExpanded;
        }

        // Toggle Agent Chat
        if (isNotUndefinedOrNull(application.isAgentChatExpanded)) {
            if (application.isAgentChatExpanded && !this.isAgentChatExpanded) {
                this.compactNavigationExpanded = false;
                this._focusSurface = 'assistant';
                this.dom
                    .querySelector<HTMLElement & { clearSearch(): void }>('skeleton-menu')
                    ?.clearSearch();
            }
            this.isAgentChatExpanded = application.isAgentChatExpanded;
        }

        // Redirect
        if (application.redirectTo) {
            this.handleRedirection(application);
        }
    }

    @wire(connectStore, { store })
    storeChange({ application, shell }) {
        this._isFullAppLoading = application.isLoading;
        this._fullAppLoadingMessage = application.isLoadingMessage;

        if (this._isLoggedIn != application.isLoggedIn) {
            this._isLoggedIn = application.isLoggedIn;
            if (application.isLoggedIn) {
                this.handleLogin(application.connector);
            } else if (!application.isLoggedIn) {
                this.handleLogout();
            }
        }

        if (shell?.redirectTo) {
            void this.handleRedirection({ redirectTo: shell.redirectTo });
            store.dispatch(SHELL.reduxSlice.actions.clearRedirect());
        }
    }

    @wire(CurrentPageReference)
    handleNavigation(pageRef) {
        this.targetPage = pageRef;
        if (!this.pageHasLoaded) return;
        const { type, state = {} } = pageRef || {};
        if (state.applicationName !== 'connections') {
            this.pendingTaskPath = null;
        }
        switch (type) {
            case 'home':
                this.handleApplicationSelection(this.defaultLandingTarget);
                break;
            case 'application': {
                const formattedApplicationName = (state.applicationName || '').toLowerCase();
                if (!formattedApplicationName) {
                    this.handleApplicationSelection(this.defaultLandingTarget);
                    break;
                }
                if (formattedApplicationName === 'smartinput' && !this.betaSmartInputEnabled) {
                    this.handleApplicationSelection('home/app');
                    break;
                }
                const target = APP_LIST.find(x => x.path === formattedApplicationName);
                if (isNotUndefinedOrNull(target)) {
                    this.handleApplicationSelection(target.name);
                } else {
                    this.handleApplicationSelection('home/app');
                }
                break;
            }
        }
    }

    connectedCallback() {
        this.init();
    }

    init = async () => {
        await initCacheStorage();
        await this.loadFromCache();
        await this.processShareParams();
        if (isElectronApp()) {
            await Promise.all([this.prepareDesktopLaunchIntent(), this.initElectron()]);
            this.isCommandCheckFinished = true;
            this.registerDesktopLaunchIntentListener();
        }
        void this.loadVersion();
        await this.initMode();
        this.initDragDrop();
        this.initShortcuts();
    };

    disconnectedCallback() {
        this._resizeObserver?.disconnect();
        if (typeof this._removeDesktopLaunchIntentListener === 'function') {
            this._removeDesktopLaunchIntentListener();
        }
    }

    get dom(): ShadowRoot {
        return this.template;
    }

    renderedCallback() {
        if (!this._resizeObserver && this.refs.workspace) {
            this._resizeObserver = new ResizeObserver(entries => {
                const width = entries[0]?.contentRect.width;
                if (!width || width === this.shellWidth) return;
                const wasFocused = this.layout.assistantFocused;
                const wasReturnFocused = this.dom
                    .querySelector('[data-return-to-tool]')
                    ?.matches(':focus');
                const wasCollapsed = this.layout.menuCollapsed;
                this.shellWidth = width;
                if (!this.layout.compact) this.compactNavigationExpanded = false;
                if (wasReturnFocused && !this.layout.assistantFocused)
                    this.focusHeaderControl('assistant');
                if (!wasCollapsed && this.layout.menuCollapsed) {
                    if (this.dom.activeElement?.tagName === 'SKELETON-MENU')
                        this.focusHeaderControl('navigation');
                    this.dom
                        .querySelector<HTMLElement & { clearSearch(): void }>('skeleton-menu')
                        ?.clearSearch();
                }
                if (!wasFocused && this.layout.assistantFocused) this._focusSurface = 'assistant';
            });
            this._resizeObserver.observe(this.refs.workspace);
        }
        if (this._focusSurface === 'navigation' && this.layout.navigationFocused) {
            this.dom
                .querySelector<HTMLElement & { focusSearch(): void }>('skeleton-menu')
                ?.focusSearch();
        }
        if (this._focusSurface === 'assistant' && this.layout.assistantFocused) {
            this.dom.querySelector<HTMLButtonElement>('[data-return-to-tool]')?.focus();
        }
        this._focusSurface = null;
    }

    get layout() {
        return getShellLayout(
            this.shellWidth,
            this.isMenuCollapsed,
            this.isAgentChatExpanded,
            this.compactNavigationExpanded
        );
    }
    get workspaceClass() {
        return classSet('workspace l-cell-auto-size l-container-horizontal slds-fill-height')
            .add({
                'navigation-focused': this.layout.navigationFocused,
                'assistant-focused': this.layout.assistantFocused,
                'narrow-tool': this.requiresWiderWindow,
            })
            .toString();
    }
    get requiresWiderWindow() {
        const app = this.applications.find(item => item.id === this.currentApplicationId);
        return (
            this.shellWidth < MIN_TOOL_WIDTH &&
            app &&
            !['home', 'connections', 'settings', 'release'].includes(app.path)
        );
    }
    get assistantPanelMaxWidth() {
        return this.layout.assistantFocused ? this.shellWidth : this.layout.assistantMaxWidth;
    }
    get assistantPanelSize() {
        return this.layout.assistantFocused ? 'slds-size_full' : 'slds-size_x-large';
    }
    get isAssistantResizeDisabled() {
        return this.layout.assistantFocused;
    }
    get showCompactToolbar() {
        return !this.isApplicationTabVisible;
    }
    get menuToggleLabel() {
        return this.layout.menuCollapsed ? 'Expand navigation' : 'Collapse navigation';
    }
    get assistantToggleLabel() {
        return this.isAgentChatExpanded ? 'Close AI assistant' : 'Open AI assistant';
    }

    handleMenuToggle = event => {
        event.stopPropagation();
        const collapsed = event.detail?.collapsed ?? !this.layout.menuCollapsed;
        this.dom
            .querySelector<HTMLElement & { clearSearch(): void }>('skeleton-menu')
            ?.clearSearch();
        if (this.layout.compact) {
            this.compactNavigationExpanded = !collapsed;
            if (!collapsed) {
                legacyStore.dispatch(store_application.collapseAgentChat('user'));
                this._focusSurface = 'navigation';
            } else {
                this.focusHeaderControl('navigation');
            }
        } else {
            this.isMenuCollapsed = collapsed;
            legacyStore.dispatch(
                collapsed
                    ? store_application.collapseMenu('user')
                    : store_application.expandMenu('user')
            );
            cacheManager.store.setItem('header-isMenuSmall', JSON.stringify(collapsed));
        }
    };
    toggleAssistant = () => {
        legacyStore.dispatch(
            this.isAgentChatExpanded
                ? store_application.collapseAgentChat('user')
                : store_application.expandAgentChat('user')
        );
    };
    closeAssistant = () => {
        legacyStore.dispatch(store_application.collapseAgentChat('user'));
        this.focusHeaderControl('assistant');
    };
    focusHeaderControl = (control: 'navigation' | 'assistant') => {
        const header = this.dom.querySelector<
            HTMLElement & { focusNavigationToggle(): void; focusAssistantToggle(): void }
        >('skeleton-header');
        if (header) {
            if (control === 'navigation') header.focusNavigationToggle();
            else header.focusAssistantToggle();
        } else
            this.dom.querySelector<HTMLButtonElement>(`[data-shell-toggle="${control}"]`)?.focus();
    };
    handleShellKeydown = event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (this.layout.navigationFocused) {
            event.preventDefault();
            this.compactNavigationExpanded = false;
            this.focusHeaderControl('navigation');
        } else if (this.layout.assistantFocused) {
            event.preventDefault();
            this.closeAssistant();
        }
    };

    prepareDesktopLaunchIntent = async () => {
        const launchIntent = await getDesktopLaunchIntent();
        await this.applyDesktopLaunchIntent(launchIntent);
    };

    registerDesktopLaunchIntentListener = () => {
        this._removeDesktopLaunchIntentListener = onDesktopLaunchIntent(async launchIntent => {
            await this.applyDesktopLaunchIntent(launchIntent, true);
        });
    };

    applyDesktopLaunchIntent = async (launchIntent, shouldReload = false) => {
        if (launchIntent?.target !== 'org' || !launchIntent.orgAlias) {
            return;
        }

        try {
            const configuration = await getConfiguration(launchIntent.orgAlias);
            if (!configuration) {
                return;
            }

            this.pendingTaskPath = null;
            await saveSession({
                ...configuration,
                alias: configuration.alias,
                credentialType: configuration.credentialType,
            });

            if (shouldReload) {
                store.dispatch(APPLICATION.reduxSlice.actions.logout());
                await this.initMode();
            }
        } catch (error) {
            LOGGER.error('applyDesktopLaunchIntent', error);
        }
    };

    processShareParams = async () => {
        if (typeof window === 'undefined' || !window.location) return;
        const url = new URL(window.location.href);
        const share = url.searchParams.get('share');
        const shareUser = url.searchParams.get('shareUser');
        let urlChanged = false;

        if (share) {
            try {
                const payload = decodeBase64UrlToJson(decodeURIComponent(share));
                if (payload?.v === 1 && payload.alias && payload.sfdxAuthUrl) {
                    const params = extractConfig(payload.sfdxAuthUrl);
                    if (params) {
                        let instanceUrl = params.instanceUrl;
                        if (instanceUrl && !instanceUrl.startsWith('http')) {
                            instanceUrl = `https://${instanceUrl}`;
                        }
                        const rawConfig = {
                            credentialType: 'OAUTH',
                            alias: payload.alias,
                            refreshToken: params.refreshToken,
                            instanceUrl,
                        };
                        const normalized = normalizeConfiguration(rawConfig, true);
                        const configs = await getConfigurations();
                        const next = configs.some(c => c.alias === payload.alias)
                            ? configs.map(c => (c.alias === payload.alias ? normalized : c))
                            : [...configs, normalized];
                        await setConfigurations(next);
                        await saveSession({ credentialType: 'OAUTH', alias: payload.alias });
                    }
                }
            } catch (e) {
                LOGGER.error('processShareParams share', e);
            }
            url.searchParams.delete('share');
            urlChanged = true;
        }

        if (shareUser) {
            try {
                const payload = decodeBase64UrlToJson(decodeURIComponent(shareUser));
                if (payload?.v === 1) {
                    sessionStorage.setItem('connectionNewModalPrefill', JSON.stringify(payload));
                }
            } catch (e) {
                LOGGER.error('processShareParams shareUser', e);
            }
            url.searchParams.delete('shareUser');
            urlChanged = true;
        }

        if (urlChanged) {
            const cleanUrl = url.pathname + (url.search || '') + (url.hash || '');
            window.history.replaceState(null, '', cleanUrl);
        }
    };

    /** Events */

    handleLogin = async connector => {
        if (isUndefinedOrNull(connector)) {
            store.dispatch(APPLICATION.reduxSlice.actions.stopLoading());
            return;
        }

        // Reset first
        this.applications = this.applications.filter(x => x.name == 'home/app');

        // Add new module
        if (this.applications.filter(x => x.name == 'org/app').length == 0) {
            this.openSpecificModule('org/app');
        }
        store.dispatch(APPLICATION.reduxSlice.actions.stopLoading());

        // Load Cached data
        store.dispatch(
            DOCUMENT.reduxSlices.RECENT.actions.loadFromStorage({
                alias: this.connector.configuration.alias,
            })
        );

        // Connect to background
        const context = {
            connector: this.connector,
            navContext: this.navContext,
            _backgroundPort: this._backgroundPort,
        };
        connectToBackgroundWithIdentity(context);
        this._backgroundPort = context._backgroundPort;
        const task = this.resolveTask(this.pendingTaskPath);
        this.pendingTaskPath = null;
        if (task) {
            this.handleApplicationSelection(task.name);
            navigate(this.navContext, {
                type: 'application',
                state: { applicationName: task.path },
            });
        }
    };

    handleLogout = () => {
        this.pendingTaskPath = null;
        // Reset Applications
        this.applications = this.applications.filter(x => x.name == 'home/app');
        navigate(this.navContext, { type: 'application', state: { applicationName: 'home' } });
        // Disconnect from background
        const context = { _backgroundPort: this._backgroundPort };
        disconnectFromBackground(context);
        this._backgroundPort = context._backgroundPort;
    };

    handleLogoutClick = async e => {
        e.preventDefault(); // currentApplication

        await store.dispatch(APPLICATION.reduxSlice.actions.logout());

        this.initMode();
        //location.reload();
    };

    handleTabChange = e => {
        const applicationId = e.detail.id;
        this.loadSpecificTab(applicationId);
    };

    resolveTask = path =>
        resolveTaskTarget(
            APP_LIST,
            path,
            {
                electron: isElectronApp(),
                chrome: isChromeExtension(),
            },
            this.betaSmartInputEnabled
        );

    handleConnectRequest = async event => {
        event.stopPropagation();
        if (this.isConnecting) return;
        const path = event.detail?.path;
        const task = this.resolveTask(path);
        if (path && !task) return;
        if (task && this.isUserLoggedIn) {
            navigate(this.navContext, {
                type: 'application',
                state: { applicationName: task.path },
            });
            return;
        }
        this.pendingTaskPath = null;
        this.isConnecting = true;
        this.connectionError = '';
        try {
            const choice = await ConnectPrompt.open({
                size: 'small',
                taskLabel: task?.label || '',
            });
            if (!choice) return;
            this.pendingTaskPath = task?.path || null;
            if (choice.manageConnections) {
                navigate(this.navContext, {
                    type: 'application',
                    state: { applicationName: 'connections' },
                });
                return;
            }
            await runQuickConnect({
                loginUrl: choice.loginUrl,
                setLoading: message =>
                    store.dispatch(APPLICATION.reduxSlice.actions.startLoading({ message })),
                resetLoading: () => store.dispatch(APPLICATION.reduxSlice.actions.stopLoading()),
            });
        } catch {
            this.pendingTaskPath = null;
            this.connectionError =
                'Connection was not completed. Choose Connect again to retry, or use Manage connections.';
        } finally {
            this.isConnecting = false;
        }
    };

    cancelPendingTask = () => {
        this.pendingTaskPath = null;
    };

    get pendingTaskMessage() {
        const task = this.resolveTask(this.pendingTaskPath);
        return task ? `Connect to continue to ${task.label}.` : '';
    }

    handleTabDelete = e => {
        const result = resolveTabClose(this.applications, e.detail.id, this.currentApplicationId);
        if (!result) return;
        this.applications = result.remaining;
        if (result.nextPath) {
            const target = APP_LIST.find(app => app.path === result.nextPath);
            this.handleApplicationSelection(target?.name || 'home/app');
            navigate(this.navContext, {
                type: 'application',
                state: { applicationName: result.nextPath },
            });
        }
    };

    handleNewApp = async e => {
        this.loadModule(e.detail);
    };

    handleRedirection = async ({ redirectTo }) => {
        let url = redirectTo || '';
        if (url.startsWith('sftoolkit:')) {
            /* Inner Navigation */
            const navigationConfig = url.replace('sftoolkit:', '');
            navigate(this.navContext, JSON.parse(navigationConfig));
            return;
        }

        const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url) || url.startsWith('//');

        if (this.isUserLoggedIn && !isAbsoluteUrl) {
            // to force refresh in case it's not valid anymore :
            await this.connector.conn.identity();
            url = `${this.connector.frontDoorUrl}&retURL=${encodeURI(url)}`;
        }

        if (isElectronApp()) {
            window.location = url;
        } else {
            window.open(url, '_blank');
        }
    };

    handleApplicationSelection = async eventOrTarget => {
        if (this.compactNavigationExpanded) {
            this.compactNavigationExpanded = false;
            this.focusHeaderControl('navigation');
        }
        let target =
            typeof eventOrTarget === 'object' && eventOrTarget?.detail?.target != null
                ? eventOrTarget.detail.target
                : eventOrTarget;
        if (target === 'smartinput/app' && !this.betaSmartInputEnabled) {
            target = 'home/app';
        }
        if (this.applications.filter(x => x.name === target).length == 0) {
            this.loadModule(target);
        } else {
            const existingAppId = this.applications.find(x => x.name === target).id;
            this.loadSpecificTab(existingAppId);
        }
    };

    handleOpenAiSettings = event => {
        event.preventDefault();
        event.stopPropagation();
        legacyStore.dispatch(store_application.collapseAgentChat('user'));
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'settings', tab: 'ai' },
        });
    };

    /** Methods  */

    loadFromCache = async () => {
        const config = await loadFromCache(this);
        this.isApplicationTabVisible = config.isApplicationTabVisible === true;

        if (isEmpty(config.openaiKey)) {
            // `checkForInjected` exists in some app modules but not all.
            // Guard to avoid runtime crash when the method isn't implemented.
            const maybeCheckForInjected =
                'checkForInjected' in this ? this.checkForInjected : undefined;
            if (typeof maybeCheckForInjected === 'function') {
                maybeCheckForInjected.call(this);
            }
        }
    };

    openSpecificModule = async target => {
        this.handleApplicationSelection(target);
    };

    loadVersion = async () => {
        const url = isChromeExtension() || isElectronApp() ? '/manifest.json' : '/version';
        const data = await (await fetch(url)).json();
        this.version = `v${data.version || '1.0.0'}`;
    };

    initElectron = async () => {
        try {
            const result = await checkDesktopCommands();
            this.isSalesforceCliInstalled = result.sfdx;
            this.isJavaCliInstalled = result.java;
        } catch (error) {
            this.isSalesforceCliInstalled = false;
            this.isJavaCliInstalled = false;
        }
    };

    initDragDrop = () => {
        window.addEventListener(
            'dragover',
            function (e) {
                e.preventDefault();
            },
            false
        );
        window.addEventListener(
            'drop',
            function (e) {
                e.preventDefault();
            },
            false
        );
    };

    initMode = async () => {
        window.isLimitedMode = this.isLimitedMode; // To hide

        this.applications = [];
        this.currentApplicationId = null;
        try {
            LOGGER.log('Init Mode -->', this.isLimitedMode);
            if (this.isLimitedMode) {
                await this.load_limitedMode();
            } else {
                await this.load_fullMode();
            }
        } catch (e) {
            LOGGER.error('Init Mode Error -->', e);
            this.pageHasLoaded = true;
        }
    };

    loadSpecificTab = applicationId => {
        this.currentApplicationId = applicationId;
        const _applications = this.applicationPreFormatted;
        _applications.forEach(x => {
            if (x.id == applicationId) {
                x.isActive = true;
                x.class = 'slds-context-bar__item slds-is-active';
                x.classVisibility = 'slds-show slds-full-height';
                x.attributes.isActive = true;
                // Update the store
                store.dispatch(
                    APPLICATION.reduxSlice.actions.updateCurrentApplication({
                        application: x.name,
                    })
                );
            } else {
                x.attributes.isActive = false;
            }
        });
        this.applications = _applications;
    };

    /** Extension & Electron Org Window  **/
    load_limitedMode = async () => {
        const result = await loadLimitedMode({
            alias: this.alias,
            sessionId: this.sessionId,
            serverUrl: this.serverUrl,
            redirectUrl: this.redirectUrl,
            navContext: this.navContext,
            targetPage: this.targetPage,
            handleNavigation: this.handleNavigation.bind(this),
        });

        // Reset session params after use
        if (result.success && isNotUndefinedOrNull(this.sessionId)) {
            this.sessionId = null;
            this.serverUrl = null;
        }

        this.pageHasLoaded = true;
        if (this.targetPage) {
            this.handleNavigation(this.targetPage);
        }
    };

    /** Website & Electron **/
    load_fullMode = async () => {
        await loadFullMode({
            sessionId: this.sessionId,
            serverUrl: this.serverUrl,
            redirectUrl: this.redirectUrl,
            navContext: this.navContext,
            targetPage: this.targetPage,
            loadModule: this.loadModule.bind(this),
            handleNavigation: this.handleNavigation.bind(this),
        });

        // Reset session params after use
        if (isNotUndefinedOrNull(this.sessionId)) {
            this.sessionId = null;
            this.serverUrl = null;
        }

        this.pageHasLoaded = true;
        if (this.targetPage) {
            this.handleNavigation(this.targetPage);
        }
    };

    /** Getters */

    get connector() {
        return store.getState()?.application?.connector;
    }

    get isFullAppLoading() {
        return this._isFullAppLoading || !this.pageHasLoaded;
    }

    get fullAppLoadingMessageFormatted() {
        return this._fullAppLoadingMessage || 'Loading Page ...';
    }

    get isSFDXMissing() {
        return isElectronApp() && !this.isSalesforceCliInstalled && this.isCommandCheckFinished;
    }

    get isLimitedMode() {
        return this.mode === LIMITED;
    }

    get isAnnouncementBannerDisplayed() {
        return !this.isLimitedMode;
    }

    get dynamicAppContainerClass() {
        return this.isUserLoggedIn
            ? 'app-container-logged-in slds-full-height'
            : 'app-container slds-full-height';
    }

    get currentApplicationRequiresConnection() {
        const currentApplication = this.applications.find(
            application => application.id === this.currentApplicationId
        );
        return Boolean(currentApplication?.requireConnection);
    }

    get isLogoutDisplayed() {
        return !this.isLimitedMode;
    }

    get formattedAlias() {
        if (isUndefinedOrNull(this.connector?.configuration?.alias)) {
            return 'No Alias : ';
        } else if (
            this.connector?.configuration?.username == this.connector?.configuration?.alias
        ) {
            return '';
        } else {
            return `${this.connector.configuration?.alias} : `;
        }
    }

    get loggedInMessage() {
        return `Logged in as ${this.connector?.configuration?.userInfo?.display_name || 'User'} (${
            this.formattedAlias
        }${this.connector?.configuration?.username}). `;
    }

    get isUserLoggedIn() {
        return this._isLoggedIn;
    }

    get defaultLandingTarget() {
        return this.isUserLoggedIn ? 'org/app' : 'home/app';
    }

    get menuClass() {
        return classSet('l-cell-content-size home__navigation slds-is-relative')
            .add({
                'slds-hide': this.isMenuHidden,
                'slds-menu-collapsed': this.layout.menuCollapsed,
            })
            .toString();
    }

    get uiMenuClass() {
        return classSet('l-container-vertical')
            .add({
                'slds-fill-height': !this.isMenuCollapsed,
            })
            .toString();
    }

    get applicationPreFormatted() {
        return this.applications.map(x => ({
            ...x,
            ...{
                isActive: false,
                class: 'slds-context-bar__item',
                classVisibility: 'slds-hide slds-full-height',
            },
        }));
    }

    get isElectronApp() {
        return isElectronApp();
    }

    get isAgentVisible() {
        return isChromeExtension() || isElectronApp();
    }

    /** Dynamic Loading */

    loadModule = (target, isFirst = false) => {
        if (target === 'smartinput/app' && !this.betaSmartInputEnabled) {
            LOGGER.warn('Smart Input is disabled by beta feature flag');
            target = 'home/app';
        }
        const settings = APP_LIST.find(x => x.name === target);

        if (!settings) {
            LOGGER.warn(`Unknown app type: ${target}`);
            // Run Manual Mode
        } else {
            const existingApp = this.applications.find(x => x.name === target);
            if (existingApp) {
                this.loadSpecificTab(existingApp.id);
                return;
            }
            const application = {
                name: settings.name,
                constructor: settings.module,
                path: settings.path,
                id: guid(),
                label: settings.label,
                isActive: true,
                class: 'slds-context-bar__item slds-is-active',
                classVisibility: 'slds-show slds-full-height',
                isFullHeight: settings.isFullHeight,
                isDeletable: settings.isDeletable,
                requireConnection: !settings.isOfflineAvailable,
                isTabVisible: settings.isTabVisible,
                attributes: {
                    applicationName: settings.name,
                    //connector:this.connector
                    isActive: true,
                },
            };
            // Store current Application in the store
            store.dispatch(
                APPLICATION.reduxSlice.actions.updateCurrentApplication({
                    application: settings.name,
                })
            );
            const _applications = this.applicationPreFormatted;
            if (isFirst) {
                _applications.unshift(application);
            } else {
                _applications.push(application);
            }

            this.applications = _applications;
            this.currentApplicationId = application.id;
        }
    };

    /** Shortcuts **/
    initShortcuts = async () => {
        await initShortcuts({ navContext: this.navContext });
    };
}
