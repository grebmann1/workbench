import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
    createDesktopUpdater,
    resolveDesktopUpdateConfig,
    type DesktopAutoUpdaterLike,
} from './desktopUpdater';

test('resolveDesktopUpdateConfig disables updater in development by default', () => {
    assert.deepEqual(
        resolveDesktopUpdateConfig({
            env: {},
            isPackaged: false,
            platform: 'darwin',
        }),
        {
            enabled: false,
            reason: 'disabled-development',
            mode: 'disabled',
        }
    );
});

test('resolveDesktopUpdateConfig enables GitHub updater for packaged macOS and Windows builds', () => {
    assert.deepEqual(
        resolveDesktopUpdateConfig({
            env: {
                WORKBENCH_DESKTOP_UPDATE_REPO: 'acme/workbench',
            },
            isPackaged: true,
            platform: 'win32',
        }),
        {
            enabled: true,
            mode: 'auto',
            options: {
                notifyUser: true,
                updateInterval: '10 minutes',
                updateSource: {
                    repo: 'acme/workbench',
                    type: 0,
                },
            },
        }
    );
});

test('resolveDesktopUpdateConfig treats Linux as script-managed', () => {
    assert.deepEqual(
        resolveDesktopUpdateConfig({
            env: {
                WORKBENCH_DESKTOP_INSTALLER_URL: 'https://example.com/install.sh',
            },
            isPackaged: true,
            platform: 'linux',
        }),
        {
            enabled: false,
            mode: 'script-managed',
            reason: 'linux-script-managed',
            scriptUrl: 'https://example.com/install.sh',
        }
    );
});

test('createDesktopUpdater starts update-electron-app and delegates manual checks', () => {
    const events: Array<unknown> = [];
    const autoUpdater = new EventEmitter() as DesktopAutoUpdaterLike;
    autoUpdater.checkForUpdates = () => {
        events.push('check');
    };
    const controller = createDesktopUpdater({
        autoUpdater,
        config: resolveDesktopUpdateConfig({
            env: {},
            isPackaged: true,
            platform: 'darwin',
        }),
        log: (...parts: unknown[]) => events.push(parts),
        updateElectronApp: options => events.push(options),
    });

    assert.equal(controller.status.mode, 'auto');
    controller.checkForUpdates();
    assert.deepEqual(events.at(-1), 'check');
    assert.equal(events.length >= 2, true);
});

test('createDesktopUpdater opens script-managed installer URL when configured', () => {
    const events: Array<unknown> = [];
    const autoUpdater = new EventEmitter() as DesktopAutoUpdaterLike;
    const controller = createDesktopUpdater({
        autoUpdater,
        config: {
            enabled: false,
            mode: 'script-managed',
            reason: 'linux-script-managed',
            scriptUrl: 'https://example.com/install.sh',
        },
        log: (...parts: unknown[]) => events.push(parts),
        openExternal: url => events.push(['openExternal', url]),
        updateElectronApp: options => events.push(options),
    });

    controller.checkForUpdates();
    assert.deepEqual(events.at(-1), ['openExternal', 'https://example.com/install.sh']);
});
