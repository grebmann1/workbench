import path from 'node:path';

import { app, shell, session, type WebContents } from 'electron';

import { DesktopAutomationServer } from './desktopAutomationServer';
import { DesktopLegacyBus } from './desktopLegacyBus';
import { registerDesktopMenu } from './desktopMenu';
import { getPackagedWebRoot } from './desktopPaths';
import { DesktopRendererServer } from './desktopRendererServer';
import { registerDesktopIpcRouter } from './ipcRouter';
import {
    createDefaultLaunchIntent,
    parseLaunchIntent,
    type DesktopLaunchIntent,
} from './launchIntent';
import { WindowManager } from './windowManager';

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

app.setName('Workbench Desktop');

async function openInstance(payload: Record<string, any>): Promise<void> {
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

    if (lastLaunchIntent.target === 'org') {
        await openInstance({ alias: lastLaunchIntent.orgAlias });
        return;
    }

    windowManager.focusMainWindow();
    windowManager.dispatchLaunchIntent(lastLaunchIntent);
});

app.whenReady().then(async () => {
    rendererServer = new DesktopRendererServer({
        webRoot: getPackagedWebRoot(),
        appVersion: app.getVersion(),
    });
    const baseUrl = await rendererServer.start();
    rendererUrl = `${baseUrl}/views/app.html`;
    windowManager.setRendererUrl(rendererUrl);
    registerWebContentsGuards(rendererUrl);

    automationServer = new DesktopAutomationServer({
        host: process.env.API_HOST?.replace(/^https?:\/\//, '') || '127.0.0.1',
        legacyBus,
        openInstance,
        port: Number(process.env.API_PORT || '12346'),
        windowManager,
    });

    let automationBaseUrl: string | null = null;
    try {
        automationBaseUrl = await automationServer.start();
    } catch {
        automationBaseUrl = null;
    }

    registerDesktopMenu({ apiBaseUrl: automationBaseUrl });
    await windowManager.ensureMainWindow(createDefaultLaunchIntent());

    if (lastLaunchIntent.target === 'org') {
        await openInstance({ alias: lastLaunchIntent.orgAlias });
    } else {
        windowManager.dispatchLaunchIntent(lastLaunchIntent);
    }

    app.on('activate', async () => {
        await windowManager.ensureMainWindow(createDefaultLaunchIntent());
    });
});

app.on('before-quit', async () => {
    legacyBus.rejectAll('The desktop app is shutting down.');
    await automationServer?.stop();
    await rendererServer?.stop();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
