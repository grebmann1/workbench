import type { EventEmitter } from 'node:events';

import {
    UpdateSourceType,
    type IUpdateElectronAppOptions,
    type updateElectronApp as updateElectronAppType,
} from 'update-electron-app';

export type DesktopAutoUpdaterLike = Pick<EventEmitter, 'on'> & {
    checkForUpdates?: () => void;
};

export type DesktopUpdateMode = 'auto' | 'disabled' | 'script-managed';

export type DesktopUpdateStatus = {
    enabled: boolean;
    mode: DesktopUpdateMode;
    reason?: string;
    options?: IUpdateElectronAppOptions;
    scriptUrl?: string;
};

export type DesktopUpdateConfigInput = {
    env: NodeJS.ProcessEnv;
    isPackaged: boolean;
    platform: NodeJS.Platform;
    arch?: string;
};

export type DesktopUpdaterController = {
    status: DesktopUpdateStatus;
    checkForUpdates: () => void;
};

type DesktopUpdaterFactory = typeof updateElectronAppType;
type DesktopUpdateLogger = (...parts: unknown[]) => void;

const DEFAULT_UPDATE_REPO = 'grebmann1/workbench';
const DEFAULT_UPDATE_INTERVAL = '10 minutes';

function isTruthy(value: string | undefined): boolean {
    return value === '1' || value === 'true';
}

export function resolveDesktopUpdateConfig({
    env,
    isPackaged,
    platform,
    arch = process.arch,
}: DesktopUpdateConfigInput): DesktopUpdateStatus {
    if (isTruthy(env.WORKBENCH_DESKTOP_DISABLE_AUTO_UPDATE)) {
        return {
            enabled: false,
            mode: 'disabled',
            reason: 'disabled-by-env',
        };
    }

    if (platform === 'linux') {
        return {
            enabled: false,
            mode: 'script-managed',
            reason: 'linux-script-managed',
            scriptUrl:
                env.WORKBENCH_DESKTOP_LINUX_INSTALLER_URL || env.WORKBENCH_DESKTOP_INSTALLER_URL,
        };
    }

    if (platform !== 'darwin' && platform !== 'win32') {
        return {
            enabled: false,
            mode: 'disabled',
            reason: 'unsupported-platform',
        };
    }

    if (!isPackaged && !isTruthy(env.WORKBENCH_DESKTOP_ENABLE_AUTO_UPDATE)) {
        return {
            enabled: false,
            mode: 'disabled',
            reason: 'disabled-development',
        };
    }

    const updateInterval = env.WORKBENCH_DESKTOP_UPDATE_INTERVAL || DEFAULT_UPDATE_INTERVAL;
    const staticBaseUrl = env.WORKBENCH_DESKTOP_UPDATE_BASE_URL;
    if (staticBaseUrl) {
        return {
            enabled: true,
            mode: 'auto',
            options: {
                notifyUser: true,
                updateInterval,
                updateSource: {
                    baseUrl: `${staticBaseUrl.replace(/\/+$/, '')}/${platform}/${arch}`,
                    type: UpdateSourceType.StaticStorage,
                },
            },
        };
    }

    return {
        enabled: true,
        mode: 'auto',
        options: {
            notifyUser: true,
            updateInterval,
            updateSource: {
                repo:
                    env.WORKBENCH_DESKTOP_UPDATE_REPO ||
                    env.GITHUB_REPOSITORY ||
                    DEFAULT_UPDATE_REPO,
                type: UpdateSourceType.ElectronPublicUpdateService,
            },
        },
    };
}

function createUpdateLogger(log: DesktopUpdateLogger) {
    return {
        error: (message: string): void => log('Desktop updater error', message),
        info: (message: string): void => log('Desktop updater info', message),
        log: (message: string): void => log('Desktop updater', message),
        warn: (message: string): void => log('Desktop updater warning', message),
    };
}

function registerUpdaterEventLogging(
    autoUpdater: DesktopAutoUpdaterLike,
    log: DesktopUpdateLogger
): void {
    autoUpdater.on('checking-for-update', () => log('Desktop updater checking for update'));
    autoUpdater.on('update-available', () => log('Desktop updater update available'));
    autoUpdater.on('update-not-available', () => log('Desktop updater update not available'));
    autoUpdater.on('update-downloaded', () => log('Desktop updater update downloaded'));
    autoUpdater.on('error', error => log('Desktop updater event error', error));
}

export function createDesktopUpdater({
    autoUpdater,
    config,
    log,
    openExternal,
    updateElectronApp,
}: {
    autoUpdater: DesktopAutoUpdaterLike;
    config: DesktopUpdateStatus;
    log: DesktopUpdateLogger;
    openExternal?: (url: string) => void;
    updateElectronApp: DesktopUpdaterFactory;
}): DesktopUpdaterController {
    registerUpdaterEventLogging(autoUpdater, log);

    if (config.enabled && config.mode === 'auto' && config.options) {
        updateElectronApp({
            ...config.options,
            logger: createUpdateLogger(log),
        });
    } else {
        log('Desktop updater disabled', config);
    }

    return {
        status: config,
        checkForUpdates: () => {
            if (config.enabled && config.mode === 'auto' && autoUpdater.checkForUpdates) {
                log('Desktop updater manual check requested');
                autoUpdater.checkForUpdates();
                return;
            }

            if (config.mode === 'script-managed' && config.scriptUrl && openExternal) {
                log('Desktop updater opening installer URL', config.scriptUrl);
                openExternal(config.scriptUrl);
                return;
            }

            log('Desktop updater manual check unavailable', config);
        },
    };
}
