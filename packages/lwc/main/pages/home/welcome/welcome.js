import { APP_LIST } from 'core/applications';
import { getConfigurations, listOrgSessionsViaBackground } from 'core/connector';
import { connectStore, store } from 'core/store';
import ToolkitElement from 'core/toolkitElement';
import { wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import { buildAvailableAgentModelOptions } from 'shared/llm';
import { isChromeExtension, isElectronApp } from 'shared/utils';

import { GITHUB_DISCUSSIONS_URL, QUICK_TIPS, HOME_TASKS } from './constants.js';

export default class Welcome extends ToolkitElement {
    @wire(NavigationContext) navContext;
    sessions = [];
    savedCount = 0;
    isLoadingSessions = false;
    isLoadingSaved = true;
    sessionsError = false;
    savedError = false;
    isAiConfigured = false;
    latestRelease = null;
    get tips() {
        return QUICK_TIPS.filter(
            tip => this.isBrowserSessionsVisible || tip.id !== 'tip-browser-sessions'
        ).slice(0, 2);
    }
    _wasHomeActive = false;

    @wire(connectStore, { store })
    handleStore({ application }) {
        this.isLoggedIn = Boolean(application?.isLoggedIn);
        this.isAiConfigured =
            buildAvailableAgentModelOptions({
                availableModelsByProvider: application?.availableModelsByProvider,
                subscriptionModelsByProvider: application?.subscriptionModelsByProvider,
                providerConfigs: application?.providerConfigs,
            }).length > 0;
        const isHome = application?.currentApplication === 'home/app';
        if (isHome && !this._wasHomeActive && this.isConnected) this.refreshConnections();
        this._wasHomeActive = isHome;
    }

    connectedCallback() {
        this.refreshConnections();
        this._loadLatestRelease();
    }

    refreshConnections = () => Promise.all([this._loadSessions(), this._loadSaved()]);

    async _loadSessions() {
        if (!this.isBrowserSessionsVisible) return;
        this.isLoadingSessions = true;
        this.sessionsError = false;
        try {
            const result = await listOrgSessionsViaBackground();
            if (!Array.isArray(result)) throw new Error('Sessions unavailable');
            this.sessions = result.map(session => ({
                ...session,
                openLabel: `Open ${session.label || session.serverUrl} in Workbench`,
            }));
        } catch {
            this.sessionsError = true;
            this.sessions = [];
        } finally {
            this.isLoadingSessions = false;
        }
    }

    async _loadSaved() {
        this.isLoadingSaved = true;
        this.savedError = false;
        try {
            this.savedCount = (await getConfigurations()).length;
        } catch {
            this.savedError = true;
        } finally {
            this.isLoadingSaved = false;
        }
    }

    async _loadLatestRelease() {
        try {
            const url =
                isChromeExtension() || isElectronApp()
                    ? chrome.runtime.getURL('releaseNotes.json')
                    : '/public/releaseNotes.json';
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data) && data.length) this.latestRelease = data[0];
        } catch {
            /* Release notes must not prevent connection. */
        }
    }

    get hasSessions() {
        return this.sessions.length > 0;
    }
    get isBrowserSessionsVisible() {
        return isChromeExtension() && !isElectronApp();
    }
    get hasLatestRelease() {
        return this.latestRelease != null;
    }
    get latestReleaseLabel() {
        return this.latestRelease ? `What's new in v${this.latestRelease.version}` : '';
    }
    get heading() {
        return this.isUserLoggedIn
            ? 'What would you like to do?'
            : 'Connect your org. Get to work.';
    }
    get subtitle() {
        return this.isUserLoggedIn
            ? 'Explore data, inspect objects, and work with Apex.'
            : 'Choose a Salesforce org to start exploring your data and tools.';
    }
    get connectLabel() {
        return this.isUserLoggedIn ? 'Connect another org' : 'Connect a Salesforce org';
    }
    get savedSummary() {
        if (this.savedError) return 'Saved connections could not be loaded.';
        if (this.savedCount === 0)
            return 'No saved orgs yet. Save an org in Connections to find it here next time.';
        return `${this.savedCount} saved ${this.savedCount === 1 ? 'org' : 'orgs'} available. Choose one in Connections to log in.`;
    }
    get aiTitle() {
        return this.isAiConfigured
            ? 'Your AI assistant is ready'
            : 'Optional: set up your AI assistant';
    }
    get aiDescription() {
        return this.isAiConfigured
            ? 'Manage your provider and model preferences.'
            : 'Add an AI provider when you want help with queries, code, and Salesforce tasks.';
    }
    get aiActionLabel() {
        return this.isAiConfigured ? 'AI settings' : 'Set up AI provider';
    }
    get taskHint() {
        return this.isUserLoggedIn ? 'Open tool' : 'Connect to open';
    }
    get tasks() {
        return HOME_TASKS.map(task => {
            const app = APP_LIST.find(item => item.path === task.path);
            if (
                !app ||
                (app.isElectronOnly && !isElectronApp()) ||
                (app.isChromeOnly && !isChromeExtension())
            )
                return null;
            return {
                ...task,
                label: app.label,
                description: app.description,
                icon: app.quickActionIcon,
            };
        }).filter(Boolean);
    }
    handleConnect = () => this.requestConnection();
    handleTask = event => this.requestConnection(event.currentTarget.dataset.path);
    requestConnection(path) {
        this.dispatchEvent(
            new CustomEvent('requestconnection', {
                detail: { path },
                bubbles: true,
                composed: true,
            })
        );
    }
    handleSessionOpen = event => {
        const { serverUrl, sessionId } = event.currentTarget.dataset;
        if (!serverUrl || !sessionId) return;
        const appUrl = new URL(chrome.runtime.getURL('/views/app.html'));
        appUrl.searchParams.set('sessionId', sessionId);
        appUrl.searchParams.set('serverUrl', serverUrl);
        window.location.assign(appUrl.toString());
    };
    handleSessionKeydown = event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.handleSessionOpen(event);
    };
    handleGoToConnections = () =>
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'connections' },
        });
    handleOpenSettings = () =>
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'settings', tab: 'ai' },
        });
    handleViewReleaseNotes = () =>
        navigate(this.navContext, { type: 'application', state: { applicationName: 'release' } });
    handleGitHub = () => window.open(GITHUB_DISCUSSIONS_URL, '_blank', 'noopener,noreferrer');
}
