"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const desktopAutomationServer_1 = require("./desktopAutomationServer");
const desktopAutomationSecurity_1 = require("./desktopAutomationSecurity");
const desktopLegacyBus_1 = require("./desktopLegacyBus");
const desktopLogger_1 = require("./desktopLogger");
const desktopMenu_1 = require("./desktopMenu");
const desktopPaths_1 = require("./desktopPaths");
const desktopRendererServer_1 = require("./desktopRendererServer");
const desktopServices_1 = require("./desktopServices");
const ipcRouter_1 = require("./ipcRouter");
const launchIntent_1 = require("./launchIntent");
const windowManager_1 = require("./windowManager");
const preloadPath = node_path_1.default.join(__dirname, '../preload/desktopPreload.js');
const legacyBus = new desktopLegacyBus_1.DesktopLegacyBus();
let lastLaunchIntent = (0, launchIntent_1.parseLaunchIntent)(process.argv);
let rendererUrl = '';
let automationServer = null;
let rendererServer = null;
const windowManager = new windowManager_1.WindowManager({ preloadPath, rendererUrl });
function isSafeExternalUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:';
    }
    catch {
        return false;
    }
}
function isAllowedNavigation(url, rendererUrl) {
    if (url === 'about:blank') {
        return true;
    }
    try {
        const targetUrl = new URL(url);
        const expectedUrl = new URL(rendererUrl);
        return targetUrl.origin === expectedUrl.origin;
    }
    catch {
        return false;
    }
}
function registerWebContentsGuards(rendererUrl) {
    electron_1.session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
    });
    electron_1.app.on('web-contents-created', (_event, webContents) => {
        webContents.setWindowOpenHandler(({ url }) => {
            if (isSafeExternalUrl(url)) {
                void electron_1.shell.openExternal(url);
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
function getBundledMcpPath() {
    const mcpPath = node_path_1.default.join(process.resourcesPath, 'mcp.js');
    return electron_1.app.isPackaged && node_fs_1.default.existsSync(mcpPath) ? mcpPath : null;
}
electron_1.app.setName('Workbench Desktop');
electron_1.app.setAppUserModelId('com.sftoolkit.desktop');
(0, desktopLogger_1.registerDesktopLoggerProcessHandlers)();
async function openInstance(payload) {
    try {
        const sfdxAuthUrl = typeof payload.sfdxAuthUrl === 'string' ? payload.sfdxAuthUrl.trim() : '';
        if (sfdxAuthUrl) {
            const alias = String(payload.alias || '').trim();
            if (!alias) {
                throw new Error('Alias is required when opening an org from sfdxAuthUrl.');
            }
            await (0, desktopServices_1.saveSfdxAuthUrlOrg)(alias, sfdxAuthUrl);
            delete payload.sfdxAuthUrl;
        }
        const orgAlias = typeof payload.alias === 'string' && payload.alias.trim()
            ? payload.alias
            : typeof payload.username === 'string' && payload.username.trim()
                ? payload.username
                : null;
        lastLaunchIntent = orgAlias
            ? {
                target: 'org',
                orgAlias,
            }
            : (0, launchIntent_1.createDefaultLaunchIntent)();
        await windowManager.ensureMainWindow((0, launchIntent_1.createDefaultLaunchIntent)());
        await windowManager.openInstanceWindow(payload);
    }
    catch (error) {
        desktopLogger_1.desktopLog.error('openInstance failed', error);
        await electron_1.dialog.showMessageBox({
            type: 'error',
            title: 'Unable to open org',
            message: error instanceof Error ? error.message : 'Unknown error',
            detail: 'The org was not opened. See Help -> Open Logs Folder for details.',
            buttons: ['OK'],
        });
        throw error;
    }
}
function getOpenInstancePayload(command) {
    const payload = {};
    if (command.org.kind === 'alias') {
        payload.alias = command.org.alias;
    }
    else if (command.org.kind === 'session') {
        payload.alias = command.org.alias;
        payload.sessionId = command.org.sessionId;
        payload.serverUrl = command.org.serverUrl;
    }
    else if (command.org.kind === 'sfdxAuthUrl') {
        payload.alias = command.org.alias;
        payload.sfdxAuthUrl = command.org.sfdxAuthUrl;
    }
    const route = command.type === 'openOrg'
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
async function handleLaunchIntent(intent) {
    const command = (0, launchIntent_1.normalizeDesktopCommand)(intent);
    if (command.type === 'openOrg' || command.type === 'openPage' || command.type === 'execute') {
        await openInstance(getOpenInstancePayload(command));
        return;
    }
    windowManager.focusMainWindow();
    windowManager.dispatchLaunchIntent(intent);
}
(0, ipcRouter_1.registerDesktopIpcRouter)({
    getLaunchIntent: () => lastLaunchIntent,
    getRendererUrl: () => rendererUrl,
    handleLegacyMessage: payload => legacyBus.handleRendererMessage(payload),
    openInstance,
    updateLimitedModeStatus: (sender, payload) => {
        windowManager.updateInstanceWindowStatus(sender, payload);
    },
});
const singleInstanceLock = electron_1.app.requestSingleInstanceLock(lastLaunchIntent);
if (!singleInstanceLock) {
    electron_1.app.quit();
}
electron_1.app.on('second-instance', async (_event, argv, _workingDirectory, additionalData) => {
    lastLaunchIntent =
        additionalData && typeof additionalData === 'object'
            ? additionalData
            : (0, launchIntent_1.parseLaunchIntent)(argv);
    await windowManager.ensureMainWindow((0, launchIntent_1.createDefaultLaunchIntent)());
    await handleLaunchIntent(lastLaunchIntent);
});
electron_1.app.whenReady().then(async () => {
    desktopLogger_1.desktopLog.info('Workbench Desktop starting');
    if (process.platform === 'darwin') {
        electron_1.app.dock?.setIcon(electron_1.nativeImage.createFromPath((0, desktopPaths_1.getDesktopIconPath)('png')));
    }
    await electron_1.session.defaultSession.clearCache();
    rendererServer = new desktopRendererServer_1.DesktopRendererServer({
        webRoot: (0, desktopPaths_1.getPackagedWebRoot)(),
        appVersion: electron_1.app.getVersion(),
    });
    const baseUrl = await rendererServer.start();
    rendererUrl = `${baseUrl}/views/app.html`;
    windowManager.setRendererUrl(rendererUrl);
    registerWebContentsGuards(rendererUrl);
    let automationBaseUrl = null;
    try {
        const automationToken = await (0, desktopAutomationSecurity_1.ensureAutomationToken)(electron_1.app.getPath('userData'));
        automationServer = new desktopAutomationServer_1.DesktopAutomationServer({
            host: (0, desktopAutomationSecurity_1.normalizeAutomationHost)(process.env.API_HOST),
            legacyBus,
            openInstance,
            port: Number(process.env.API_PORT || '12346'),
            token: automationToken,
            windowManager,
        });
        automationBaseUrl = await automationServer.start();
    }
    catch (error) {
        desktopLogger_1.desktopLog.error('Failed to start desktop automation server', error);
        automationBaseUrl = null;
    }
    (0, desktopMenu_1.registerDesktopMenu)({
        apiBaseUrl: automationBaseUrl,
        createHomeWindow: () => windowManager.ensureMainWindow((0, launchIntent_1.createDefaultLaunchIntent)()),
        mcpConfigPath: getBundledMcpPath(),
    });
    await windowManager.ensureMainWindow((0, launchIntent_1.createDefaultLaunchIntent)());
    await handleLaunchIntent(lastLaunchIntent);
    desktopLogger_1.desktopLog.info('Workbench Desktop ready', { automationBaseUrl, rendererUrl });
    electron_1.app.on('activate', async () => {
        await windowManager.ensureMainWindow((0, launchIntent_1.createDefaultLaunchIntent)());
    });
});
electron_1.app.on('before-quit', async () => {
    desktopLogger_1.desktopLog.info('Workbench Desktop shutting down');
    legacyBus.rejectAll('The desktop app is shutting down.');
    await automationServer?.stop();
    await rendererServer?.stop();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
