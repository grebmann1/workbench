export type DesktopLegacyLaunchIntent =
    | {
          target: 'app';
      }
    | {
          target: 'org';
          orgAlias: string;
      };

export type DesktopOrgSource =
    | {
          kind: 'alias';
          alias: string;
      }
    | {
          kind: 'session';
          alias?: string;
          sessionId: string;
          serverUrl: string;
      }
    | {
          kind: 'sfdxAuthUrl';
          alias: string;
          sfdxAuthUrl: string;
      };

export type DesktopRoute = {
    applicationName: string;
    state?: Record<string, string>;
};

export type DesktopAction =
    | {
          kind: 'navigate';
          applicationName: string;
          state?: Record<string, string>;
      }
    | {
          kind: 'soqlQuery';
          query: string;
          includeDeletedRecords?: boolean;
          useToolingApi?: boolean;
      }
    | {
          kind: 'apiRequest';
          body?: string;
          endpoint: string;
          headerText?: string;
          method?: string;
      }
    | {
          kind: 'apexRun';
          apexCode: string;
          shouldOpenUi?: boolean;
      };

export type DesktopOutputMode = 'json' | 'text';

export type DesktopCommand =
    | {
          v: 2;
          type: 'openApp';
      }
    | {
          v: 2;
          type: 'openOrg';
          org: DesktopOrgSource;
          route?: DesktopRoute;
      }
    | {
          v: 2;
          type: 'openPage';
          org: DesktopOrgSource;
          route: DesktopRoute;
      }
    | {
          v: 2;
          type: 'execute';
          action: DesktopAction;
          org: DesktopOrgSource;
          output?: DesktopOutputMode;
      };

export type DesktopLaunchIntent = DesktopLegacyLaunchIntent | DesktopCommand;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function isDesktopOrgSource(value: unknown): value is DesktopOrgSource {
    if (!isRecord(value)) {
        return false;
    }

    if (value.kind === 'alias') {
        return isNonEmptyString(value.alias);
    }

    if (value.kind === 'session') {
        return isNonEmptyString(value.sessionId) && isNonEmptyString(value.serverUrl);
    }

    if (value.kind === 'sfdxAuthUrl') {
        return isNonEmptyString(value.alias) && isNonEmptyString(value.sfdxAuthUrl);
    }

    return false;
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return (
        isRecord(value) &&
        Object.values(value).every(item => typeof item === 'string')
    );
}

export function isDesktopRoute(value: unknown): value is DesktopRoute {
    if (!isRecord(value) || !isNonEmptyString(value.applicationName)) {
        return false;
    }

    return value.state === undefined || isStringRecord(value.state);
}

export function isDesktopAction(value: unknown): value is DesktopAction {
    if (!isRecord(value)) {
        return false;
    }

    if (value.kind === 'navigate') {
        return isNonEmptyString(value.applicationName);
    }

    if (value.kind === 'soqlQuery') {
        return (
            isNonEmptyString(value.query) &&
            (value.includeDeletedRecords === undefined ||
                typeof value.includeDeletedRecords === 'boolean') &&
            (value.useToolingApi === undefined || typeof value.useToolingApi === 'boolean')
        );
    }

    if (value.kind === 'apiRequest') {
        return (
            isNonEmptyString(value.endpoint) &&
            (value.body === undefined || typeof value.body === 'string') &&
            (value.headerText === undefined || typeof value.headerText === 'string') &&
            (value.method === undefined || typeof value.method === 'string')
        );
    }

    if (value.kind === 'apexRun') {
        return (
            isNonEmptyString(value.apexCode) &&
            (value.shouldOpenUi === undefined || typeof value.shouldOpenUi === 'boolean')
        );
    }

    return false;
}

export function isDesktopCommand(value: unknown): value is DesktopCommand {
    if (!isRecord(value) || value.v !== 2) {
        return false;
    }

    if (value.type === 'openApp') {
        return true;
    }

    if (value.type === 'openOrg') {
        return isDesktopOrgSource(value.org) && (value.route === undefined || isDesktopRoute(value.route));
    }

    if (value.type === 'openPage') {
        return isDesktopOrgSource(value.org) && isDesktopRoute(value.route);
    }

    if (value.type === 'execute') {
        return isDesktopOrgSource(value.org) && isDesktopAction(value.action);
    }

    return false;
}

export function normalizeDesktopCommand(intent: DesktopLaunchIntent): DesktopCommand {
    if (isDesktopCommand(intent)) {
        return intent;
    }

    if (intent.target === 'org') {
        return {
            v: 2,
            type: 'openOrg',
            org: {
                kind: 'alias',
                alias: intent.orgAlias,
            },
        };
    }

    return { v: 2, type: 'openApp' };
}
