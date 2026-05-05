import { app, clipboard, Menu, shell } from 'electron';

type DesktopMenuOptions = {
    apiBaseUrl: string | null;
    checkForUpdates?: () => void;
    createHomeWindow: () => Promise<unknown>;
    mcpConfigPath?: string | null;
    reportIssueUrl?: string;
    updateMode?: 'auto' | 'disabled' | 'script-managed';
};

export function registerDesktopMenu(options: DesktopMenuOptions): void {
    const isMac = process.platform === 'darwin';
    const reportIssueUrl = options.reportIssueUrl || 'https://github.com/grebmann/workbench/issues';
    const appMenu: Electron.MenuItemConstructorOptions[] = isMac
        ? [
              {
                  label: app.name,
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
    const fileQuitItems: Electron.MenuItemConstructorOptions[] = isMac ? [] : [{ role: 'quit' }];
    const editPlatformItems: Electron.MenuItemConstructorOptions[] = isMac
        ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }]
        : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }];
    const windowPlatformItems: Electron.MenuItemConstructorOptions[] = isMac
        ? [{ type: 'separator' }, { role: 'front' }]
        : [{ role: 'close' }];
    const template: Electron.MenuItemConstructorOptions[] = [
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
                            void shell.openExternal(options.apiBaseUrl);
                        }
                    },
                },
                {
                    label: 'Copy MCP Config',
                    enabled: Boolean(options.apiBaseUrl),
                    click: () => {
                        clipboard.writeText(buildMcpConfig(options));
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
                        void shell.openExternal('https://www.sf-workbench.com');
                    },
                },
                {
                    label: 'Open Logs Folder',
                    click: () => {
                        void shell.openPath(app.getPath('logs'));
                    },
                },
                {
                    label:
                        options.updateMode === 'script-managed'
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
                        void shell.openExternal(reportIssueUrl);
                    },
                },
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildMcpConfig(options: DesktopMenuOptions): string {
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
