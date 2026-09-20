declare const browser: {
    runtime?: {
        id?: string;
    };
};

declare const process: {
    env?: Record<string, string | undefined>;
};

type JsforceBrowserClient = import('jsforce/lib/browser/client').BrowserClient;
type JsforceNativeConnection = import('jsforce').Connection;
type JsforceWindow = Window & typeof globalThis;

interface Window {
    defaultStore?: {
        getItem<T = unknown>(key: string): Promise<T | null>;
        setItem<T>(key: string, value: T): Promise<T>;
        removeItem(key: string): Promise<void>;
    };
    navContext?: unknown;
    isLimitedMode?: boolean;
    runSandboxEvalSmokeTest?: (options: { code: string; timeoutMs?: number }) => Promise<unknown>;
    Prism?: {
        languages: Record<string, unknown>;
        highlight(code: string, grammar: unknown, language: string): string;
        highlightAllUnder(element: Element): void;
    };
    jsforceSettings?: import('jsforce/lib/connection').ConnectionConfig & {
        apiVersion?: string;
        clientId?: string;
        redirectUri?: string;
        loginUrl?: string;
        proxyUrl?: string;
    };
    jsforce: {
        Connection: new (
            ...args: ConstructorParameters<typeof import('jsforce').Connection>
        ) => import('./jsforce').JsforceConnection &
            Pick<JsforceNativeConnection, 'authorize' | 'login' | 'logout' | '_establish'>;
        OAuth2: typeof import('jsforce').OAuth2;
        BrowserClient: typeof import('jsforce/lib/browser/client').BrowserClient;
        browserClient?: JsforceBrowserClient;
    };

    desktop?: {
        getAppInfo: () => Promise<{
            appName: string;
            appVersion: string;
            isPackaged: boolean;
            platform: string;
            rendererUrl: string;
        }>;
        getLaunchIntent: () => Promise<
            | { target: 'app' }
            | { target: 'org'; orgAlias: string }
            | { type: 'openApp'; v: 2 }
            | {
                  org: Record<string, unknown>;
                  route?: {
                      applicationName: string;
                      state?: Record<string, string>;
                  };
                  type: 'openOrg' | 'openPage';
                  v: 2;
              }
            | {
                  action: Record<string, unknown>;
                  org: Record<string, unknown>;
                  output?: 'json' | 'text';
                  type: 'execute';
                  v: 2;
              }
        >;
        onLaunchIntent: (
            listener: (
                intent:
                    | { target: 'app' }
                    | { target: 'org'; orgAlias: string }
                    | { type: 'openApp'; v: 2 }
                    | {
                          org: Record<string, unknown>;
                          route?: {
                              applicationName: string;
                              state?: Record<string, string>;
                          };
                          type: 'openOrg' | 'openPage';
                          v: 2;
                      }
                    | {
                          action: Record<string, unknown>;
                          org: Record<string, unknown>;
                          output?: 'json' | 'text';
                          type: 'execute';
                          v: 2;
                      }
            ) => void
        ) => () => void;
        checkCommands: () => Promise<{
            sfdx: boolean;
            java: boolean;
            vscode: boolean;
            pmd: boolean;
            summary: {
                missing: string[];
                messages: string[];
                ready: boolean;
            };
        }>;
        openInstance: (payload: Record<string, unknown>) => Promise<{ success: true }>;
        openOrgUrl: (payload: Record<string, unknown>) => Promise<{ success: true }>;
        setStoredOrg: (payload: Record<string, unknown>) => Promise<unknown>;
        getStoredOrg: (alias: string) => Promise<unknown>;
        getAllOrgs: () => Promise<unknown>;
        getCodeInitialConfig: (
            alias: string
        ) => Promise<{ projectPath: string | null; metadataLoaded: boolean }>;
        selectCodeProject: (payload: {
            alias: string;
            defaultPath?: string | null;
        }) => Promise<{ projectPath: string | null }>;
        openVSCodeProject: (projectPath: string | null) => Promise<{ success: true }>;
        getPmdInstallation: (projectPath: string | null) => Promise<{
            installationPath: string | null;
            executablePath: string | null;
        }>;
        installLatestPmd: (projectPath: string | null) => Promise<{
            installationPath: string | null;
            executablePath: string | null;
        }>;
        retrieveCode: (payload: Record<string, unknown>) => Promise<{
            runInWorker: boolean;
            res: unknown;
        }>;
        exportMetadata: (payload: Record<string, unknown>) => Promise<{ success: true }>;
        runShell: (payload: Record<string, unknown>) => Promise<{ success: true }>;
        runSfdxAnalyzer: (payload: Record<string, unknown>) => Promise<{ success: true }>;
        renameStoredOrg: (payload: {
            oldAlias: string;
            newAlias: string;
        }) => Promise<{ success: true }>;
        removeStoredOrg: (alias: string) => Promise<{ success: true }>;
        notifyLimitedModeStatus: (payload: Record<string, unknown>) => Promise<{ success: true }>;
    };
    electron?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
        send?: (channel: string, ...args: unknown[]) => void;
        listener_on?: (channel: string, callback: (...args: unknown[]) => void) => void;
        listener_once?: (channel: string, callback: (...args: unknown[]) => void) => void;
        listener_off?: (channel: string) => void;
        setChannel?: (channel: string) => void;
        getChannel?: () => string | null;
    };
    monaco?: typeof import('monaco-editor');
    mermaid?: typeof import('mermaid').default;
    _monacoCompletionProviders?: Record<string, boolean>;
}

declare module 'papaparse';
