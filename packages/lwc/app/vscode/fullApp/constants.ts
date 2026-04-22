import {
    IFRAME_FS_BRIDGE_QUERY_FLAG,
    IFRAME_FS_BRIDGE_QUERY_PARENT_ORIGIN_PARAM,
    IFRAME_FS_BRIDGE_QUERY_VERSION_PARAM,
    IFRAME_FS_BRIDGE_QUERY_WORKSPACE_ROOT_PARAM,
} from './bridge/iframeFsBridgeContract';
import {
    IFRAME_JSFORCE_BRIDGE_QUERY_FLAG,
    IFRAME_JSFORCE_BRIDGE_QUERY_VERSION_PARAM,
} from './bridge/iframeJsforceBridgeContract';
import {
    IFRAME_AI_BRIDGE_QUERY_FLAG,
    IFRAME_AI_BRIDGE_QUERY_VERSION_PARAM,
} from './bridge/iframeAiBridgeContract';

export const CHAT_MODEL_STORAGE_PREFIX = 'chat.currentLanguageModel.';
export const WORKBENCH_CHAT_EXTENSION_ID = 'salesforce.workbench-ai';
export const WORKBENCH_CHAT_PARTICIPANT_ID = 'salesforce.workbench.agent';
export const WORKBENCH_CHAT_MODEL_VENDOR = 'copilot';
export const WORKBENCH_CHAT_MODEL_ID = 'workbench-agent';
export const WORKBENCH_CHAT_MODEL_FAMILY = 'salesforce-workbench-agent';
export const WORKBENCH_CHAT_MODEL_NAME = 'Workbench Agent';
export const WORKBENCH_CHAT_PROVIDER_ID = 'workbench';
export const WORKBENCH_CHAT_PROVIDER_NAME = 'Workbench AI';
export const WORKBENCH_AI_COMPLETIONS_SETTING = 'workbenchAICompletionsEnabled';
export const WORKBENCH_AI_NEXT_EDIT_SUGGESTIONS_SETTING = 'workbenchAINextEditSuggestionsEnabled';
export const LIGHT_COLOR_THEME = 'Default Light+';
export const DARK_COLOR_THEME = 'Default Dark+';
export const WORKBENCH_THEME_STORAGE_KEY = 'vscode.workbench.themeMode';
// In development the VS Code web server runs at localhost:5173.
// In production the iframe is served from WORKBENCH_VSCODE_URL (the dedicated VS Code web app
// host, e.g. vscode.workbench-salesforce.com). WORKBENCH_BASE_URL is the API server and must not
// be used as the iframe origin. Both values must stay in sync with the manifest's
// `frame-src __buildWorkbenchOrigin__`.
export const WORKBENCH_IFRAME_ORIGIN =
    process.env.NODE_ENV === 'production'
        ? process.env.WORKBENCH_VSCODE_URL || process.env.WORKBENCH_BASE_URL
        : 'http://localhost:5173';
export const WORKBENCH_IFRAME_URL = WORKBENCH_IFRAME_ORIGIN + '/';
export const DEFAULT_WORKSPACE_ROOT = '/workspace';
export {
    IFRAME_FS_BRIDGE_QUERY_FLAG,
    IFRAME_FS_BRIDGE_QUERY_PARENT_ORIGIN_PARAM,
    IFRAME_FS_BRIDGE_QUERY_VERSION_PARAM,
    IFRAME_FS_BRIDGE_QUERY_WORKSPACE_ROOT_PARAM,
    IFRAME_JSFORCE_BRIDGE_QUERY_FLAG,
    IFRAME_JSFORCE_BRIDGE_QUERY_VERSION_PARAM,
    IFRAME_AI_BRIDGE_QUERY_FLAG,
    IFRAME_AI_BRIDGE_QUERY_VERSION_PARAM,
};
