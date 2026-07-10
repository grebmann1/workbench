// OrgFarm orgs ship with the OAuth Username-Password flow disabled by default
// (Salesforce disables it on orgs created Summer '23+). Username/Password auth
// relies on it, so we point the user to the Setup page where they can enable it.
// This is the "Allow OAuth Username-Password Flows" toggle under OAuth and OpenID
// Connect Settings. (It can also be toggled via Metadata API — OauthOidcSettings
// .blockOAuthUnPwFlow — but that itself needs an authenticated session first.)
export const OAUTH_UNPW_SETUP_PATH = '/lightning/setup/OauthAndOpenIdConnectSettings/home';

const ORGFARM_KEYWORD = 'orgfarm';

export const isOrgFarmString = (value: unknown): boolean =>
    typeof value === 'string' && value.toLowerCase().includes(ORGFARM_KEYWORD);

/** Any of the connection fields hinting the org is an OrgFarm org. */
export const isOrgFarmConnection = (fields: {
    username?: unknown;
    customDomain?: unknown;
    name?: unknown;
    categoryId?: unknown;
    categoryTitle?: unknown;
}): boolean =>
    isOrgFarmString(fields.username) ||
    isOrgFarmString(fields.customDomain) ||
    isOrgFarmString(fields.name) ||
    isOrgFarmString(fields.categoryId) ||
    isOrgFarmString(fields.categoryTitle);

/**
 * The Username-Password flow hint is only relevant for the Username/Password
 * flow (the only one using that grant) and for OrgFarm orgs (which have it
 * disabled by default).
 */
export const shouldShowUnPwFlowHint = (args: {
    isUsernamePassword: boolean;
    isOrgFarm: boolean;
}): boolean => args.isUsernamePassword && args.isOrgFarm;

/**
 * Absolute link to the OAuth and OpenID Connect Settings setup page where
 * "Allow OAuth Username-Password Flows" lives.
 */
export const buildUnPwFlowSetupUrl = (loginUrl: string): string =>
    `${String(loginUrl ?? '').replace(/\/+$/, '')}${OAUTH_UNPW_SETUP_PATH}`;
