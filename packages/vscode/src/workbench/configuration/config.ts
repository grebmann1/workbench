import { LIGHT_COLOR_THEME } from '../constants';
import { buildWorkbenchDefaultChatAgent } from './workbenchAiOverrides';
import baseConfigurationJson from '../../user/configuration.json';
import defaultKeybindingsRaw from '../../user/keybindings.json?raw';
import { DEFAULT_WORKSPACE_ROOT } from './constants';

export { defaultKeybindingsRaw as defaultKeybindingsJson };

export const buildCustomUserConfiguration = () => ({
    'workbench.colorTheme': LIGHT_COLOR_THEME,
    // Suppress VS Code's default "Get Started" welcome tab; the custom
    // Salesforce walkthrough is the only welcome surface we want on startup.
    'workbench.startupEditor': 'none',
});

/**
 * Returns a JSON string suitable for initUserConfiguration.
 * Merges the base configuration.json defaults with workbench-specific overrides.
 */
export function buildUserConfigurationJson(): string {
    const merged = {
        ...baseConfigurationJson,
        ...buildCustomUserConfiguration(),
    };
    return JSON.stringify(merged, null, 2);
}

/**
 * Builds workspace construction options (workspaceProvider + productConfiguration).
 * @param uriFile  Factory to create a URI from a file path, e.g. `monaco.Uri.file`.
 */
export const buildWorkspaceConfig = (
    uriFile: (path: string) => unknown,
    workspaceRoot = DEFAULT_WORKSPACE_ROOT
) => ({
    workspaceProvider: {
        trusted: true,
        workspace: {
            folderUri: uriFile(workspaceRoot),
        },
        async open() {
            window.open(window.location.href);
            return true;
        },
    },
    productConfiguration: {
        nameShort: 'Salesforce Workbench',
        nameLong: 'Salesforce Workbench',
        defaultChatAgent: buildWorkbenchDefaultChatAgent(),
    },
});
