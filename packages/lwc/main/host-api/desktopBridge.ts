/**
 * Host-owned desktop bridge. Re-exports the `core/desktopBridge` surface so
 * extension Apps can reach the Electron/desktop integration without
 * importing from `core/*` directly.
 */
export {
    hasDesktopBridge,
    getDesktopLaunchIntent,
    onDesktopLaunchIntent,
    checkDesktopCommands,
    openDesktopInstance,
    openDesktopOrgUrl,
    setDesktopStoredOrg,
    startDesktopOAuth,
    onDesktopOAuth,
    getDesktopStoredOrg,
    getDesktopOrgs,
    getDesktopCodeInitialConfig,
    selectDesktopCodeProject,
    openDesktopVSCodeProject,
    getDesktopPmdInstallation,
    installDesktopLatestPmd,
    retrieveDesktopCode,
    exportDesktopMetadata,
    runDesktopShell,
    runDesktopSfdxAnalyzer,
    onDesktopLegacyChannel,
    renameDesktopStoredOrg,
    removeDesktopStoredOrg,
    notifyDesktopLimitedModeStatus,
} from 'core/desktopBridge';
