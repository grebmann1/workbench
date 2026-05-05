"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDesktopMenu = registerDesktopMenu;
const electron_1 = require("electron");
function registerDesktopMenu(options) {
    const isMac = process.platform === 'darwin';
    const reportIssueUrl = options.reportIssueUrl || 'https://github.com/grebmann/workbench/issues';
    const appMenu = isMac
        ? [
            {
                label: electron_1.app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' },
                ],
            },
        ]
        : [];
    const fileQuitItems = isMac ? [] : [{ role: 'quit' }];
    const editPlatformItems = isMac
        ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }]
        : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }];
    const windowPlatformItems = isMac
        ? [{ type: 'separator' }, { role: 'front' }]
        : [{ role: 'close' }];
    const template = [
        ...appMenu,
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Home Window',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        void options.createHomeWindow();
                    },
                },
                { type: 'separator' },
                { role: 'close' },
                ...fileQuitItems,
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                ...editPlatformItems,
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Window',
            submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...windowPlatformItems],
        },
        {
            label: 'Automation',
            submenu: [
                {
                    label: options.apiBaseUrl
                        ? `Open Desktop API (${options.apiBaseUrl})`
                        : 'Desktop API unavailable',
                    enabled: Boolean(options.apiBaseUrl),
                    click: () => {
                        if (options.apiBaseUrl) {
                            void electron_1.shell.openExternal(options.apiBaseUrl);
                        }
                    },
                },
                {
                    label: 'Copy MCP Config',
                    enabled: Boolean(options.apiBaseUrl),
                    click: () => {
                        electron_1.clipboard.writeText(buildMcpConfig(options));
                    },
                },
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Workbench Web',
                    click: () => {
                        void electron_1.shell.openExternal('https://www.sf-workbench.com');
                    },
                },
                {
                    label: 'Open Logs Folder',
                    click: () => {
                        void electron_1.shell.openPath(electron_1.app.getPath('logs'));
                    },
                },
                {
                    label: options.updateMode === 'script-managed'
                        ? 'Open Installer Update'
                        : 'Check for Updates',
                    enabled: Boolean(options.checkForUpdates) && options.updateMode !== 'disabled',
                    click: () => {
                        options.checkForUpdates?.();
                    },
                },
                {
                    label: 'Report Issue',
                    click: () => {
                        void electron_1.shell.openExternal(reportIssueUrl);
                    },
                },
            ],
        },
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
function buildMcpConfig(options) {
    if (options.mcpConfigPath) {
        return `"sf-toolkit-mcp": {
  "command": "node",
  "args": ["${options.mcpConfigPath}"],
  "env": {
    "SF_TOOLKIT_DESKTOP_API_URL": "${options.apiBaseUrl || ''}"
  }
}`;
    }
    return `"sf-toolkit-desktop-api": {
  "url": "${options.apiBaseUrl || ''}"
}`;
}
