"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDesktopIpcRouter = registerDesktopIpcRouter;
const electron_1 = require("electron");
const desktopServices_1 = require("./desktopServices");
function isSafeExternalUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:';
    }
    catch {
        return false;
    }
}
function assertTrustedSender(event, rendererUrl) {
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    const expectedOrigin = new URL(rendererUrl).origin;
    const senderOrigin = new URL(senderUrl).origin;
    if (senderOrigin !== expectedOrigin) {
        throw new Error('Rejected desktop IPC from an untrusted origin.');
    }
}
function registerDesktopIpcRouter({ getLaunchIntent, getRendererUrl, handleLegacyMessage, openInstance, updateLimitedModeStatus, }) {
    const sendLegacyEvent = (event, channel, payload) => {
        event.sender.send(`desktop:legacy:${channel}`, payload);
    };
    const sendOAuthEvent = (event, payload) => {
        event.sender.send('desktop:oauth', payload);
        sendLegacyEvent(event, 'oauth', payload);
    };
    const trustedHandler = (handler) => async (event, ...args) => {
        assertTrustedSender(event, getRendererUrl());
        return handler(event, ...args);
    };
    electron_1.ipcMain.handle('desktop:get-app-info', trustedHandler(() => ({
        appName: electron_1.app.getName(),
        appVersion: electron_1.app.getVersion(),
        isPackaged: electron_1.app.isPackaged,
        platform: process.platform,
        rendererUrl: getRendererUrl(),
    })));
    electron_1.ipcMain.handle('desktop:get-launch-intent', trustedHandler(() => getLaunchIntent()));
    electron_1.ipcMain.handle('desktop:check-commands', trustedHandler(async () => (0, desktopServices_1.getCommandAvailability)()));
    electron_1.ipcMain.handle('desktop:open-external', trustedHandler(async (_event, url) => {
        if (!isSafeExternalUrl(url)) {
            throw new Error('Only https: and mailto: URLs can be opened externally.');
        }
        await electron_1.shell.openExternal(url);
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:open-logs-folder', trustedHandler(async () => {
        await electron_1.shell.openPath(electron_1.app.getPath('logs'));
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:open-instance', trustedHandler(async (_event, payload) => {
        await openInstance(payload);
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:open-org-url', trustedHandler(async (_event, payload) => {
        await (0, desktopServices_1.openOrgUrl)(payload);
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:set-stored-org', trustedHandler(async (_event, payload) => {
        return (0, desktopServices_1.saveStoredOrg)(payload.alias, payload.configuration);
    }));
    electron_1.ipcMain.handle('desktop:start-oauth', trustedHandler(async (_event, payload) => {
        return (0, desktopServices_1.startOAuthLogin)(payload, eventPayload => sendOAuthEvent(_event, eventPayload));
    }));
    electron_1.ipcMain.handle('desktop:get-stored-org', trustedHandler(async (_event, alias) => {
        return (0, desktopServices_1.seeOrgDetails)(alias);
    }));
    electron_1.ipcMain.handle('desktop:get-all-orgs', trustedHandler(async () => (0, desktopServices_1.getAllOrgs)()));
    electron_1.ipcMain.handle('desktop:get-code-initial-config', trustedHandler(async (_event, alias) => {
        return (0, desktopServices_1.getCodeInitialConfig)(alias);
    }));
    electron_1.ipcMain.handle('desktop:select-code-project', trustedHandler(async (_event, payload) => {
        return (0, desktopServices_1.selectCodeProject)(payload);
    }));
    electron_1.ipcMain.handle('desktop:open-vscode-project', trustedHandler(async (_event, projectPath) => {
        await (0, desktopServices_1.openVSCodeProject)(projectPath);
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:get-pmd-installation', trustedHandler(async (_event, projectPath) => {
        return (0, desktopServices_1.getPmdInstallation)(projectPath);
    }));
    electron_1.ipcMain.handle('desktop:install-latest-pmd', trustedHandler(async (_event, projectPath) => {
        return (0, desktopServices_1.installLatestPmd)(projectPath);
    }));
    electron_1.ipcMain.handle('desktop:retrieve-code', trustedHandler(async (_event, payload) => {
        return {
            runInWorker: false,
            res: await (0, desktopServices_1.retrieveCodeWorkspace)({
                alias: payload.alias,
                targetPath: payload.targetPath,
                refresh: payload.refresh,
            }),
        };
    }));
    electron_1.ipcMain.handle('desktop:export-metadata', trustedHandler(async (_event, payload) => {
        void (0, desktopServices_1.exportCodeWorkspace)({
            alias: payload.alias,
            targetPath: payload.targetPath,
        }, eventPayload => sendLegacyEvent(_event, 'metadata', eventPayload));
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:run-shell', trustedHandler(async (_event, payload) => {
        void (0, desktopServices_1.runShellCommand)({
            targetPath: payload.targetPath,
            command: payload.command,
        }, eventPayload => sendLegacyEvent(_event, String(payload.listenerName || ''), eventPayload));
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:run-sfdx-analyzer', trustedHandler(async (_event, payload) => {
        void (0, desktopServices_1.runSfdxAnalyzerCommand)({
            alias: payload.alias,
            command: payload.command,
        }, eventPayload => sendLegacyEvent(_event, String(payload.listenerName || ''), eventPayload));
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:rename-stored-org', trustedHandler(async (_event, payload) => {
        await (0, desktopServices_1.renameStoredOrg)(payload.oldAlias, payload.newAlias);
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:remove-stored-org', trustedHandler(async (_event, alias) => {
        await (0, desktopServices_1.removeStoredOrg)(alias);
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:notify-limited-mode-status', trustedHandler(async (event, payload) => {
        updateLimitedModeStatus(event.sender, payload);
        return { success: true };
    }));
    electron_1.ipcMain.handle('desktop:invoke-legacy', trustedHandler(async (_event, payload) => {
        const args = payload.args || {};
        switch (payload.channel) {
            case 'util-checkCommands':
                return { error: null, result: await (0, desktopServices_1.getCommandAvailability)() };
            case 'OPEN_INSTANCE':
                await openInstance(args);
                return { error: null, result: { success: true } };
            case 'org-openOrgUrl':
                await (0, desktopServices_1.openOrgUrl)(args);
                return { error: null, result: { success: true } };
            case 'org-setStoredOrg':
                return {
                    error: null,
                    result: await (0, desktopServices_1.saveStoredOrg)(args.alias, args.configuration),
                };
            case 'org-createNewOrgAlias':
                return {
                    error: null,
                    result: await (0, desktopServices_1.startOAuthLogin)({
                        alias: args.alias,
                        loginUrl: args.instanceurl || args.loginUrl,
                    }, eventPayload => sendOAuthEvent(_event, eventPayload)),
                };
            case 'org-seeDetails':
                return { error: null, res: await (0, desktopServices_1.seeOrgDetails)(args.alias) };
            case 'org-getAllOrgs':
                return await (0, desktopServices_1.getAllOrgs)();
            case 'org-renameStoredOrg':
                await (0, desktopServices_1.renameStoredOrg)(args.alias, args.newAlias);
                return { error: null, result: { success: true } };
            case 'org-removeStoredOrg':
                await (0, desktopServices_1.removeStoredOrg)(args.alias);
                return { error: null, result: { success: true } };
            case 'util-getConfig':
                return {
                    error: null,
                    result: await (0, desktopServices_1.getConfigValue)(args.key, args.configName),
                };
            case 'util-setConfig':
                return {
                    error: null,
                    result: await (0, desktopServices_1.setConfigValue)(args.key, args.value, args.configName),
                };
            case 'code-getInitialConfig':
                return {
                    error: null,
                    result: await (0, desktopServices_1.getCodeInitialConfig)(args.alias),
                };
            case 'code-createVSCodeProject':
                return {
                    error: null,
                    result: await (0, desktopServices_1.selectCodeProject)({
                        alias: args.alias,
                        defaultPath: args.defaultPath,
                    }),
                };
            case 'code-openVSCodeProject':
                await (0, desktopServices_1.openVSCodeProject)(args.path);
                return { error: null, result: { success: true } };
            case 'code-isPmdInstalled':
                return {
                    error: null,
                    result: await (0, desktopServices_1.getPmdInstallation)(args.projectPath),
                };
            case 'code-installLatestPmd':
                return {
                    error: null,
                    result: await (0, desktopServices_1.installLatestPmd)(args.projectPath),
                };
            case 'code-retrieveCode':
                return {
                    error: null,
                    result: {
                        runInWorker: false,
                        res: await (0, desktopServices_1.retrieveCodeWorkspace)({
                            alias: args.alias,
                            targetPath: args.targetPath,
                            refresh: args.refresh,
                        }),
                    },
                };
            case 'code-exportMetadata':
                void (0, desktopServices_1.exportCodeWorkspace)({
                    alias: args.alias,
                    targetPath: args.targetPath,
                }, payload => sendLegacyEvent(_event, 'metadata', payload));
                return { error: null, result: { success: true } };
            case 'code-runShell':
                void (0, desktopServices_1.runShellCommand)({
                    targetPath: args.targetPath,
                    command: args.command,
                }, payload => sendLegacyEvent(_event, args.listenerName, payload));
                return { error: null, result: { success: true } };
            case 'code-runSfdxAnalyzer':
                void (0, desktopServices_1.runSfdxAnalyzerCommand)({
                    alias: args.alias,
                    command: args.command,
                }, payload => sendLegacyEvent(_event, args.listenerName, payload));
                return { error: null, result: { success: true } };
            case 'org-killOauth':
                return { error: null, result: { success: true } };
            default:
                return {
                    error: {
                        message: `Unsupported desktop legacy invoke channel: ${payload.channel}`,
                    },
                };
        }
    }));
    electron_1.ipcMain.on('desktop:send-legacy', (_event, payload) => {
        assertTrustedSender(_event, getRendererUrl());
        handleLegacyMessage(payload);
    });
}
