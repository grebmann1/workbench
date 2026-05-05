import { app, ipcMain, shell } from 'electron';

import {
    exportCodeWorkspace,
    getCodeInitialConfig,
    getConfigValue,
    getAllOrgs,
    getCommandAvailability,
    installLatestPmd,
    getPmdInstallation,
    openOrgUrl,
    openVSCodeProject,
    removeStoredOrg,
    renameStoredOrg,
    retrieveCodeWorkspace,
    runSfdxAnalyzerCommand,
    runShellCommand,
    saveStoredOrg,
    selectCodeProject,
    setConfigValue,
    seeOrgDetails,
} from './desktopServices';
import type { DesktopLaunchIntent } from './launchIntent';

type DesktopIpcRouterOptions = {
    getLaunchIntent: () => DesktopLaunchIntent;
    getRendererUrl: () => string;
    handleLegacyMessage: (payload: { channel?: string; args?: unknown }) => boolean;
    openInstance: (payload: Record<string, any>) => Promise<void>;
    updateLimitedModeStatus: (sender: Electron.WebContents, payload: Record<string, any>) => void;
};

function isSafeExternalUrl(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:';
    } catch {
        return false;
    }
}

function assertTrustedSender(
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
    rendererUrl: string
): void {
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    const expectedOrigin = new URL(rendererUrl).origin;
    const senderOrigin = new URL(senderUrl).origin;
    if (senderOrigin !== expectedOrigin) {
        throw new Error('Rejected desktop IPC from an untrusted origin.');
    }
}

export function registerDesktopIpcRouter({
    getLaunchIntent,
    getRendererUrl,
    handleLegacyMessage,
    openInstance,
    updateLimitedModeStatus,
}: DesktopIpcRouterOptions): void {
    const sendLegacyEvent = (
        event: Electron.IpcMainInvokeEvent,
        channel: string,
        payload: Record<string, unknown>
    ) => {
        event.sender.send(`desktop:legacy:${channel}`, payload);
    };

    const trustedHandler =
        <T extends unknown[], R>(
            handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => R | Promise<R>
        ) =>
        async (event: Electron.IpcMainInvokeEvent, ...args: T): Promise<R> => {
            assertTrustedSender(event, getRendererUrl());
            return handler(event, ...args);
        };

    ipcMain.handle(
        'desktop:get-app-info',
        trustedHandler(() => ({
            appName: app.getName(),
            appVersion: app.getVersion(),
            isPackaged: app.isPackaged,
            platform: process.platform,
            rendererUrl: getRendererUrl(),
        }))
    );

    ipcMain.handle(
        'desktop:get-launch-intent',
        trustedHandler(() => getLaunchIntent())
    );
    ipcMain.handle(
        'desktop:check-commands',
        trustedHandler(async () => getCommandAvailability())
    );
    ipcMain.handle(
        'desktop:open-external',
        trustedHandler(async (_event, url: string) => {
            if (!isSafeExternalUrl(url)) {
                throw new Error('Only https: and mailto: URLs can be opened externally.');
            }

            await shell.openExternal(url);
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:open-logs-folder',
        trustedHandler(async () => {
            await shell.openPath(app.getPath('logs'));
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:open-instance',
        trustedHandler(async (_event, payload: Record<string, any>) => {
            await openInstance(payload);
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:open-org-url',
        trustedHandler(async (_event, payload: Record<string, any>) => {
            await openOrgUrl(payload);
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:set-stored-org',
        trustedHandler(async (_event, payload: Record<string, any>) => {
            return saveStoredOrg(payload.alias, payload.configuration);
        })
    );
    ipcMain.handle(
        'desktop:get-stored-org',
        trustedHandler(async (_event, alias: string) => {
            return seeOrgDetails(alias);
        })
    );
    ipcMain.handle(
        'desktop:get-all-orgs',
        trustedHandler(async () => getAllOrgs())
    );
    ipcMain.handle(
        'desktop:get-code-initial-config',
        trustedHandler(async (_event, alias: string) => {
            return getCodeInitialConfig(alias);
        })
    );
    ipcMain.handle(
        'desktop:select-code-project',
        trustedHandler(async (_event, payload: { alias: string; defaultPath?: string | null }) => {
            return selectCodeProject(payload);
        })
    );
    ipcMain.handle(
        'desktop:open-vscode-project',
        trustedHandler(async (_event, projectPath: string | null) => {
            await openVSCodeProject(projectPath);
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:get-pmd-installation',
        trustedHandler(async (_event, projectPath: string | null) => {
            return getPmdInstallation(projectPath);
        })
    );
    ipcMain.handle(
        'desktop:install-latest-pmd',
        trustedHandler(async (_event, projectPath: string | null) => {
            return installLatestPmd(projectPath);
        })
    );
    ipcMain.handle(
        'desktop:retrieve-code',
        trustedHandler(async (_event, payload: Record<string, any>) => {
            return {
                runInWorker: false,
                res: await retrieveCodeWorkspace({
                    alias: payload.alias,
                    targetPath: payload.targetPath,
                    refresh: payload.refresh,
                }),
            };
        })
    );
    ipcMain.handle(
        'desktop:export-metadata',
        trustedHandler(async (_event, payload: Record<string, any>) => {
            void exportCodeWorkspace(
                {
                    alias: payload.alias,
                    targetPath: payload.targetPath,
                },
                eventPayload => sendLegacyEvent(_event, 'metadata', eventPayload)
            );
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:run-shell',
        trustedHandler(async (_event, payload: Record<string, any>) => {
            void runShellCommand(
                {
                    targetPath: payload.targetPath,
                    command: payload.command,
                },
                eventPayload =>
                    sendLegacyEvent(_event, String(payload.listenerName || ''), eventPayload)
            );
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:run-sfdx-analyzer',
        trustedHandler(async (_event, payload: Record<string, any>) => {
            void runSfdxAnalyzerCommand(
                {
                    alias: payload.alias,
                    command: payload.command,
                },
                eventPayload =>
                    sendLegacyEvent(_event, String(payload.listenerName || ''), eventPayload)
            );
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:rename-stored-org',
        trustedHandler(async (_event, payload: { oldAlias: string; newAlias: string }) => {
            await renameStoredOrg(payload.oldAlias, payload.newAlias);
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:remove-stored-org',
        trustedHandler(async (_event, alias: string) => {
            await removeStoredOrg(alias);
            return { success: true };
        })
    );
    ipcMain.handle(
        'desktop:notify-limited-mode-status',
        trustedHandler(async (event, payload: Record<string, any>) => {
            updateLimitedModeStatus(event.sender, payload);
            return { success: true };
        })
    );

    ipcMain.handle(
        'desktop:invoke-legacy',
        trustedHandler(async (_event, payload: { channel: string; args?: Record<string, any> }) => {
            const args = payload.args || {};

            switch (payload.channel) {
                case 'util-checkCommands':
                    return { error: null, result: await getCommandAvailability() };
                case 'OPEN_INSTANCE':
                    await openInstance(args);
                    return { error: null, result: { success: true } };
                case 'org-openOrgUrl':
                    await openOrgUrl(args);
                    return { error: null, result: { success: true } };
                case 'org-setStoredOrg':
                    return {
                        error: null,
                        result: await saveStoredOrg(args.alias, args.configuration),
                    };
                case 'org-seeDetails':
                    return { error: null, res: await seeOrgDetails(args.alias) };
                case 'org-getAllOrgs':
                    return await getAllOrgs();
                case 'org-renameStoredOrg':
                    await renameStoredOrg(args.alias, args.newAlias);
                    return { error: null, result: { success: true } };
                case 'org-removeStoredOrg':
                    await removeStoredOrg(args.alias);
                    return { error: null, result: { success: true } };
                case 'util-getConfig':
                    return {
                        error: null,
                        result: await getConfigValue(args.key, args.configName),
                    };
                case 'util-setConfig':
                    return {
                        error: null,
                        result: await setConfigValue(args.key, args.value, args.configName),
                    };
                case 'code-getInitialConfig':
                    return {
                        error: null,
                        result: await getCodeInitialConfig(args.alias),
                    };
                case 'code-createVSCodeProject':
                    return {
                        error: null,
                        result: await selectCodeProject({
                            alias: args.alias,
                            defaultPath: args.defaultPath,
                        }),
                    };
                case 'code-openVSCodeProject':
                    await openVSCodeProject(args.path);
                    return { error: null, result: { success: true } };
                case 'code-isPmdInstalled':
                    return {
                        error: null,
                        result: await getPmdInstallation(args.projectPath),
                    };
                case 'code-installLatestPmd':
                    return {
                        error: null,
                        result: await installLatestPmd(args.projectPath),
                    };
                case 'code-retrieveCode':
                    return {
                        error: null,
                        result: {
                            runInWorker: false,
                            res: await retrieveCodeWorkspace({
                                alias: args.alias,
                                targetPath: args.targetPath,
                                refresh: args.refresh,
                            }),
                        },
                    };
                case 'code-exportMetadata':
                    void exportCodeWorkspace(
                        {
                            alias: args.alias,
                            targetPath: args.targetPath,
                        },
                        payload => sendLegacyEvent(_event, 'metadata', payload)
                    );
                    return { error: null, result: { success: true } };
                case 'code-runShell':
                    void runShellCommand(
                        {
                            targetPath: args.targetPath,
                            command: args.command,
                        },
                        payload => sendLegacyEvent(_event, args.listenerName, payload)
                    );
                    return { error: null, result: { success: true } };
                case 'code-runSfdxAnalyzer':
                    void runSfdxAnalyzerCommand(
                        {
                            alias: args.alias,
                            command: args.command,
                        },
                        payload => sendLegacyEvent(_event, args.listenerName, payload)
                    );
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
        })
    );

    ipcMain.on('desktop:send-legacy', (_event, payload: { channel?: string; args?: unknown }) => {
        assertTrustedSender(_event, getRendererUrl());
        handleLegacyMessage(payload);
    });
}
