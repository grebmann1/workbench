export function buildSfOrgListArgs(): string[] {
    return ['org', 'list', '--json', '--verbose'];
}

export function buildSfdxOrgListArgs(): string[] {
    return ['force:org:list', '--json', '--verbose'];
}

export function buildSfOrgDisplayArgs(alias: string): string[] {
    return ['org', 'display', '--target-org', alias, '--json', '--verbose'];
}

export function buildSfdxOrgDisplayArgs(alias: string): string[] {
    return ['force:org:display', '--targetusername', alias, '--json', '--verbose'];
}

export function assertCliOrgHasOAuthCredentials<T extends Record<string, unknown>>(
    alias: string,
    orgDetails: T
): T {
    const hasOAuthCredentials = ['sfdxAuthUrl', 'refreshToken', 'accessToken'].some(key =>
        Boolean(String(orgDetails[key] || '').trim())
    );

    if (hasOAuthCredentials) {
        return orgDetails;
    }

    throw new Error(
        `No OAuth credentials found for alias "${alias}". Re-authenticate with: sf org login web --alias ${alias}`
    );
}

export function parseSfdxAuthUrl(sfdxAuthUrl: string): {
    instanceUrl: string;
    refreshToken: string;
} {
    const value = String(sfdxAuthUrl || '').trim();
    const match = /^force:\/\/(?:[^:]+)?::([^@]+)@(.+)$/.exec(value);
    if (!match) {
        throw new Error(
            'Invalid sfdxAuthUrl format. Expected force://clientId::refreshToken@instanceHost.'
        );
    }

    const [, refreshToken, instanceHost] = match;
    if (!refreshToken || !instanceHost) {
        throw new Error('Invalid sfdxAuthUrl format. Expected a refresh token and instance host.');
    }

    const normalizedHost = instanceHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return {
        instanceUrl: `https://${normalizedHost}`,
        refreshToken,
    };
}

export function redactDesktopSecret(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }

    return value.replace(/force:\/\/[^@\s]+@[^\s]+/g, 'force://<redacted>@<redacted>');
}
