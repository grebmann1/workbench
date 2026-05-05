import fs from 'node:fs';
import path from 'node:path';

import { app, autoUpdater, dialog, nativeImage, shell, session, type WebContents } from 'electron';
import { updateElectronApp } from 'update-electron-app';
import startedBySquirrel from 'electron-squirrel-startup';

import { DesktopAutomationServer } from './desktopAutomationServer';
import { ensureAutomationToken, normalizeAutomationHost } from './desktopAutomationSecurity';
import { DesktopLegacyBus } from './desktopLegacyBus';
import { desktopLog, registerDesktopLoggerProcessHandlers } from './desktopLogger';
import { registerDesktopMenu } from './desktopMenu';
import { getDesktopIconPath, getPackagedWebRoot } from './desktopPaths';
import { DesktopRendererServer } from './desktopRendererServer';
import { saveSfdxAuthUrlOrg } from './desktopServices';
import { createDesktopUpdater, resolveDesktopUpdateConfig } from './desktopUpdater';
import { registerDesktopIpcRouter } from './ipcRouter';
import {
    createDefaultLaunchIntent,
    normalizeDesktopCommand,
    parseLaunchIntent,
    type DesktopCommand,
    type DesktopLaunchIntent,
} from './launchIntent';
import { WindowManager } from './windowManager';

if (startedBySquirrel) {
    app.quit();
}

const preloadPath = path.join(__dirname, '../preload/desktopPreload.js');
const legacyBus = new DesktopLegacyBus();

let lastLaunchIntent: DesktopLaunchIntent = parseLaunchIntent(process.argv);
let rendererUrl = '';
let automationServer: DesktopAutomationServer | null = null;
let rendererServer: DesktopRendererServer | null = null;

const windowManager = new WindowManager({ preloadPath, rendererUrl });

function isSafeExternalUrl(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:';
    } catch {
        return false;
    }
}

function isAllowedNavigation(url: string, rendererUrl: string): boolean {
    if (url === 'about:blank') {
        return true;
    }

    try {
        const targetUrl = new URL(url);
        const expectedUrl = new URL(rendererUrl);
        return targetUrl.origin === expectedUrl.origin;
    } catch {
        return false;
    }
}

function registerWebContentsGuards(rendererUrl: string): void {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
    });

    app.on('web-contents-created', (_event, webContents: WebContents) => {
        webContents.setWindowOpenHandler(({ url }) => {
            if (isSafeExternalUrl(url)) {
                void shell.openExternal(url);
            }

            return { action: 'deny' };
        });

        webContents.on('will-navigate', (event, url) => {
            if (!isAllowedNavigation(url, rendererUrl)) {
                event.preventDefault();
            }
        });
    });
}

function getBundledMcpPath(): string | null {
    const mcpPath = path.join(process.resourcesPath, 'mcp.js');
    return app.isPackaged && fs.existsSync(mcpPath) ? mcpPath : null;
}

app.setName('Workbench Desktop');
app.setAppUserModelId('com.sftoolkit.desktop');
registerDesktopLoggerProcessHandlers();

async function openInstance(payload: Record<string, any>): Promise<void> {
    try {
        const sfdxAuthUrl =
            typeof payload.sfdxAuthUrl === 'string' ? payload.sfdxAuthUrl.trim() : '';
        if (sfdxAuthUrl) {
            const alias = String(payload.alias || '').trim();
            if (!alias) {
                throw new Error('Alias is required when opening an org from sfdxAuthUrl.');
            }

            await saveSfdxAuthUrlOrg(alias, sfdxAuthUrl);
            delete payload.sfdxAuthUrl;
        }

        const orgAlias =
            typeof payload.alias === 'string' && payload.alias.trim()
                ? payload.alias
                : typeof payload.username === 'string' && payload.username.trim()
                  ? payload.username
                  : null;

        lastLaunchIntent = orgAlias
            ? {
                  target: 'org',
                  orgAlias,
              }
            : createDefaultLaunchIntent();

        await windowManager.ensureMainWindow(createDefaultLaunchIntent());
        await windowManager.openInstanceWindow(payload);
    } catch (error) {
        desktopLog.error('openInstance failed', error);
        await dialog.showMessageBox({
            type: 'error',
            title: 'Unable to open org',
            message: error instanceof Error ? error.message : 'Unknown error',
            detail: 'The org was not opened. See Help -> Open Logs Folder for details.',
            buttons: ['OK'],
        });
        throw error;
    }
}

function getOpenInstancePayload(
    command: Extract<DesktopCommand, { type: 'execute' | 'openOrg' | 'openPage' }>
): Record<string, any> {
    const payload: Record<string, any> = {};
    if (command.org.kind === 'alias') {
        payload.alias = command.org.alias;
    } else if (command.org.kind === 'session') {
        payload.alias = command.org.alias;
        payload.sessionId = command.org.sessionId;
        payload.serverUrl = command.org.serverUrl;
    } else if (command.org.kind === 'sfdxAuthUrl') {
        payload.alias = command.org.alias;
        payload.sfdxAuthUrl = command.org.sfdxAuthUrl;
    }

    const route =
        command.type === 'openOrg'
            ? command.route
            : command.type === 'openPage'
              ? command.route
              : command.action.kind === 'navigate'
                ? { applicationName: command.action.applicationName, state: command.action.state }
                : undefined;
    if (route?.applicationName) {
        const routeParams = new URLSearchParams({
            applicationName: route.applicationName,
            ...(route.state || {}),
        });
        payload.redirectUrl = routeParams.toString();
    }

    return payload;
}

async function handleLaunchIntent(intent: DesktopLaunchIntent): Promise<void> {
    const command = normalizeDesktopCommand(intent);
    if (command.type === 'openOrg' || command.type === 'openPage' || command.type === 'execute') {
        await openInstance(getOpenInstancePayload(command));
        return;
    }

    windowManager.focusMainWindow();
    windowManager.dispatchLaunchIntent(intent);
}

registerDesktopIpcRouter({
    getLaunchIntent: () => lastLaunchIntent,
    getRendererUrl: () => rendererUrl,
    handleLegacyMessage: payload => legacyBus.handleRendererMessage(payload),
    openInstance,
    updateLimitedModeStatus: (sender, payload) => {
        windowManager.updateInstanceWindowStatus(sender, payload);
    },
});

const singleInstanceLock = app.requestSingleInstanceLock(lastLaunchIntent);

if (!singleInstanceLock) {
    app.quit();
}

app.on('second-instance', async (_event, argv, _workingDirectory, additionalData) => {
    lastLaunchIntent =
        additionalData && typeof additionalData === 'object'
            ? (additionalData as DesktopLaunchIntent)
            : parseLaunchIntent(argv);

    await windowManager.ensureMainWindow(createDefaultLaunchIntent());

    await handleLaunchIntent(lastLaunchIntent);
});

app.whenReady().then(async () => {
    desktopLog.info('Workbench Desktop starting');

    if (process.platform === 'darwin') {
        app.dock?.setIcon(nativeImage.createFromPath(getDesktopIconPath('png')));
    }
    await session.defaultSession.clearCache();

    rendererServer = new DesktopRendererServer({
        webRoot: getPackagedWebRoot(),
        appVersion: app.getVersion(),
    });
    const baseUrl = await rendererServer.start();
    rendererUrl = `${baseUrl}/views/app.html`;
    windowManager.setRendererUrl(rendererUrl);
    registerWebContentsGuards(rendererUrl);

    const desktopUpdater = createDesktopUpdater({
        autoUpdater,
        config: resolveDesktopUpdateConfig({
            env: process.env,
            isPackaged: app.isPackaged,
            platform: process.platform,
        }),
        log: (...parts) => desktopLog.info(...parts),
        openExternal: url => {
            void shell.openExternal(url);
        },
        updateElectronApp,
    });

    let automationBaseUrl: string | null = null;
    try {
        const automationToken = await ensureAutomationToken(app.getPath('userData'));
        automationServer = new DesktopAutomationServer({
            host: normalizeAutomationHost(process.env.API_HOST),
            legacyBus,
            openInstance,
            port: Number(process.env.API_PORT || '12346'),
            token: automationToken,
            windowManager,
        });
        automationBaseUrl = await automationServer.start();
    } catch (error) {
        desktopLog.error('Failed to start desktop automation server', error);
        automationBaseUrl = null;
    }

    registerDesktopMenu({
        apiBaseUrl: automationBaseUrl,
        checkForUpdates: desktopUpdater.checkForUpdates,
        createHomeWindow: () => windowManager.ensureMainWindow(createDefaultLaunchIntent()),
        mcpConfigPath: getBundledMcpPath(),
        updateMode: desktopUpdater.status.mode,
    });
    await windowManager.ensureMainWindow(createDefaultLaunchIntent());

    await handleLaunchIntent(lastLaunchIntent);

    desktopLog.info('Workbench Desktop ready', { automationBaseUrl, rendererUrl });

    app.on('activate', async () => {
        await windowManager.ensureMainWindow(createDefaultLaunchIntent());
    });
});

app.on('before-quit', async () => {
    desktopLog.info('Workbench Desktop shutting down');
    legacyBus.rejectAll('The desktop app is shutting down.');
    await automationServer?.stop();
    await rendererServer?.stop();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
