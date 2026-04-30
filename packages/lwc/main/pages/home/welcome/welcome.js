import { listOrgSessionsViaBackground } from 'core/connector';
import ToolkitElement from 'core/toolkitElement';
import { wire } from 'lwc';
import { NavigationContext, navigate } from 'lwr/navigation';
import { isChromeExtension, isElectronApp } from 'shared/utils';

import { GITHUB_DISCUSSIONS_URL, QUICK_TIPS } from './constants.js';

export default class Welcome extends ToolkitElement {
    @wire(NavigationContext)
    navContext;

    sessions = [];
    isLoadingSessions = true;

    latestRelease = null;
    tips = QUICK_TIPS;

    async connectedCallback() {
        await Promise.all([this._loadSessions(), this._loadLatestRelease()]);
    }

    async _loadSessions() {
        this.isLoadingSessions = true;
        try {
            const result = await listOrgSessionsViaBackground();
            this.sessions = Array.isArray(result) ? result : [];
        } catch {
            this.sessions = [];
        } finally {
            this.isLoadingSessions = false;
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
            if (Array.isArray(data) && data.length > 0) {
                this.latestRelease = data[0];
            }
        } catch {
            // Non-blocking.
        }
    }

    /** Getters */

    get hasSessions() {
        return this.sessions.length > 0;
    }

    get isBrowserSessionsVisible() {
        return !isElectronApp();
    }

    get hasLatestRelease() {
        return this.latestRelease != null;
    }

    get latestReleaseLabel() {
        if (!this.latestRelease) return '';
        return `v${this.latestRelease.version} — ${this.latestRelease.date}`;
    }

    get latestReleaseSummary() {
        if (!this.latestRelease?.sections?.length) return '';
        const first = this.latestRelease.sections[0];
        const cats = first?.categories ?? [];
        const total = cats.reduce((n, c) => n + (c.items?.length ?? 0), 0);
        return `${first.title}: ${total} change${total !== 1 ? 's' : ''}`;
    }

    /** Events */

    handleSessionOpen = event => {
        const el = event.currentTarget;
        const serverUrl = el.dataset.serverUrl;
        const sessionId = el.dataset.sessionId;
        if (!serverUrl || !sessionId) return;

        if (isChromeExtension()) {
            const appUrl = new URL(chrome.runtime.getURL('/views/app.html'));
            appUrl.searchParams.set('sessionId', sessionId);
            appUrl.searchParams.set('serverUrl', serverUrl);
            window.location.assign(appUrl.toString());
            return;
        }

        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'home', sessionId, serverUrl },
        });
    };

    handleGoToConnections = () => {
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'connections' },
        });
    };

    handleOpenSettings = () => {
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'settings' },
        });
    };

    handleViewReleaseNotes = () => {
        navigate(this.navContext, {
            type: 'application',
            state: { applicationName: 'release' },
        });
    };

    handleGitHub = () => {
        window.open(GITHUB_DISCUSSIONS_URL, '_blank', 'noopener,noreferrer');
    };
}
