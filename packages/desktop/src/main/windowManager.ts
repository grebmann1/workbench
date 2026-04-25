import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

import { desktopLog } from './desktopLogger';
import { getDesktopIconPath } from './desktopPaths';
import type { DesktopLaunchIntent } from './launchIntent';

type WindowManagerOptions = {
    preloadPath: string;
    rendererUrl: string;
};

function redactRendererMessage(message: string): string {
    return message
        .replace(/force:\/\/[^@\s]+@[^\s]+/g, 'force://<redacted>@<redacted>')
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
        .replace(/(accessToken|refreshToken|sessionId)["':=\s]+[A-Za-z0-9._~!+/=-]+/gi, '$1=<redacted>');
}

export class WindowManager {
    private readonly preloadPath: string;
    private rendererUrl: string;
    private mainWindow: BrowserWindow | null = null;
    private readonly instanceWindows = new Map<string, BrowserWindow>();
    private readonly instanceLoginStatus = new Map<string, boolean>();
    private readonly instanceLoginWaiters = new Map<
        string,
        Array<(status: boolean) => void>
    >();

    constructor({ preloadPath, rendererUrl }: WindowManagerOptions) {
        this.preloadPath = preloadPath;
        this.rendererUrl = rendererUrl;
    }

    setRendererUrl(rendererUrl: string): void {
        this.rendererUrl = rendererUrl;
    }

    getMainWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    getWindowByAlias(alias: string): BrowserWindow | null {
        return this.instanceWindows.get(alias) || null;
    }

    getHomeWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    listWindowAliases(): string[] {
        return Array.from(this.instanceWindows.keys()).sort((left, right) =>
            left.localeCompare(right)
        );
    }

    focusMainWindow(): void {
        if (!this.mainWindow) {
            return;
        }

        if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
        }

        this.mainWindow.focus();
    }

    async ensureMainWindow(initialLaunchIntent: DesktopLaunchIntent): Promise<BrowserWindow> {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.focusMainWindow();
            return this.mainWindow;
        }

        const browserWindowOptions: BrowserWindowConstructorOptions = {
            width: 1440,
            height: 960,
            minWidth: 1100,
            minHeight: 700,
            title: 'Workbench Desktop',
            icon: getDesktopIconPath('png'),
            show: false,
            autoHideMenuBar: false,
            webPreferences: {
                preload: this.preloadPath,
                contextIsolation: true,
                sandbox: true,
                nodeIntegration: false,
                spellcheck: false,
                webSecurity: false,
            },
        };

        this.mainWindow = new BrowserWindow(browserWindowOptions);
        this.registerWindowDiagnostics(this.mainWindow, 'home');

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        this.mainWindow.webContents.once('did-finish-load', () => {
            this.dispatchLaunchIntent(initialLaunchIntent);
            this.mainWindow?.show();
        });

        await this.mainWindow.loadURL(this.rendererUrl);

        return this.mainWindow;
    }

    async openInstanceWindow(payload: Record<string, any>): Promise<BrowserWindow> {
        const instanceKey = this.getInstanceWindowKey(payload);
        if (!instanceKey) {
            throw new Error('An alias, username, or session is required to open an org window.');
        }

        const existingWindow = this.instanceWindows.get(instanceKey);
        if (existingWindow && !existingWindow.isDestroyed()) {
            this.focusWindow(existingWindow);
            return existingWindow;
        }

        const browserWindowOptions: BrowserWindowConstructorOptions = {
            width: 1400,
            height: 920,
            minWidth: 1100,
            minHeight: 700,
            title: this.formatInstanceTitle(payload),
            icon: getDesktopIconPath('png'),
            show: false,
            autoHideMenuBar: false,
            parent: this.mainWindow || undefined,
            webPreferences: {
                preload: this.preloadPath,
                contextIsolation: true,
                sandbox: true,
                nodeIntegration: false,
                spellcheck: false,
                webSecurity: false,
            },
        };

        const instanceWindow = new BrowserWindow(browserWindowOptions);
        this.registerWindowDiagnostics(instanceWindow, instanceKey);
        this.instanceWindows.set(instanceKey, instanceWindow);

        instanceWindow.on('closed', () => {
            this.instanceWindows.delete(instanceKey);
            this.instanceLoginStatus.delete(instanceKey);
        });

        instanceWindow.webContents.once('did-finish-load', () => {
            instanceWindow.show();
            this.focusWindow(instanceWindow);
        });

        await instanceWindow.loadURL(this.buildInstanceRendererUrl(payload));
        return instanceWindow;
    }

    dispatchLaunchIntent(intent: DesktopLaunchIntent): void {
        this.mainWindow?.webContents.send('desktop:launch-intent', intent);
    }

    updateInstanceWindowStatus(sender: Electron.WebContents, payload: Record<string, any>): void {
        desktopLog.info('Instance window status update', {
            isLoggedIn: payload.isLoggedIn,
            message: payload.message,
            username: payload.username,
            webContentsId: sender.id,
        });

        const matchingEntry = Array.from(this.instanceWindows.entries()).find(([_key, window]) => {
            return !window.isDestroyed() && window.webContents.id === sender.id;
        });
        const matchingWindow = matchingEntry?.[1] || null;
        const matchingKey = matchingEntry?.[0] || null;

        if (!matchingWindow) {
            return;
        }

        const username = String(payload.username || '').trim();
        const message = String(payload.message || '').trim();
        if (payload.isLoggedIn === true && username) {
            if (matchingKey) {
                this.setInstanceLoginStatus(matchingKey, true);
            }
            matchingWindow.setTitle(`Workbench Desktop - ${username}`);
            return;
        }

        if (payload.isLoggedIn === false && message) {
            if (matchingKey) {
                this.setInstanceLoginStatus(matchingKey, false);
            }
            matchingWindow.setTitle(`Workbench Desktop - ${message}`);
        }
    }

    async waitForInstanceLogin(payload: Record<string, any>, timeoutMs = 15_000): Promise<boolean> {
        const instanceKey = this.getInstanceWindowKey(payload);
        if (!instanceKey) {
            return false;
        }

        if (this.instanceLoginStatus.get(instanceKey) === true) {
            return true;
        }

        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                const waiters = this.instanceLoginWaiters.get(instanceKey) || [];
                this.instanceLoginWaiters.set(
                    instanceKey,
                    waiters.filter(candidate => candidate !== waiter)
                );
                resolve(false);
            }, timeoutMs);

            const waiter = (status: boolean) => {
                clearTimeout(timeout);
                resolve(status);
            };
            this.instanceLoginWaiters.set(instanceKey, [
                ...(this.instanceLoginWaiters.get(instanceKey) || []),
                waiter,
            ]);
        });
    }

    private buildInstanceRendererUrl(payload: Record<string, any>): string {
        const url = new URL('/views/direct.html', this.rendererUrl);

        const alias = String(payload.alias || '').trim();
        const sessionId = String(payload.sessionId || '').trim();
        const serverUrl = String(payload.serverUrl || '').trim();
        const redirectUrl = String(payload.redirectUrl || '').trim();
        const sourceTabId = String(payload.sourceTabId || '').trim();
        const variant = String(payload.variant || '').trim();

        if (alias) {
            url.searchParams.set('alias', alias);
        }
        if (sessionId) {
            url.searchParams.set('sessionId', sessionId);
        }
        if (serverUrl) {
            url.searchParams.set('serverUrl', serverUrl);
        }
        if (redirectUrl) {
            url.searchParams.set('redirectUrl', redirectUrl);
        }
        if (sourceTabId) {
            url.searchParams.set('sourceTabId', sourceTabId);
        }
        if (variant) {
            url.searchParams.set('variant', variant);
        }

        return url.toString();
    }

    private formatInstanceTitle(payload: Record<string, any>): string {
        const alias = String(payload.alias || '').trim();
        const username = String(payload.username || '').trim();
        const titleSuffix = alias || username;

        return titleSuffix ? `Workbench Desktop - ${titleSuffix}` : 'Workbench Desktop';
    }

    private focusWindow(window: BrowserWindow): void {
        if (window.isMinimized()) {
            window.restore();
        }

        window.focus();
    }

    private getInstanceWindowKey(payload: Record<string, any>): string | null {
        const alias = String(payload.alias || '').trim();
        if (alias) {
            return alias;
        }

        const username = String(payload.username || '').trim();
        if (username) {
            return username;
        }

        const sessionId = String(payload.sessionId || '').trim();
        if (sessionId) {
            return `session:${sessionId}`;
        }

        return null;
    }

    private setInstanceLoginStatus(instanceKey: string, status: boolean): void {
        this.instanceLoginStatus.set(instanceKey, status);
        const waiters = this.instanceLoginWaiters.get(instanceKey) || [];
        this.instanceLoginWaiters.delete(instanceKey);
        waiters.forEach(waiter => waiter(status));
    }

    private registerWindowDiagnostics(window: BrowserWindow, windowKey: string): void {
        window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
            desktopLog.info('Renderer console message', {
                level,
                line,
                message: redactRendererMessage(message),
                sourceId,
                windowKey,
            });
        });

        window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            desktopLog.error('Renderer failed to load', {
                errorCode,
                errorDescription,
                validatedURL,
                windowKey,
            });
        });
    }
}
