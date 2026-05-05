import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertCliOrgHasOAuthCredentials,
    buildSfOrgDisplayArgs,
    buildSfOrgLoginWebArgs,
    buildSfOrgListArgs,
    buildSfdxOrgDisplayArgs,
    buildSfdxOrgListArgs,
    parseSfdxAuthUrl,
} from './desktopOrgCliUtils';
import { buildOrgOpenUrl } from './desktopServiceUtils';

test('buildOrgOpenUrl prefers redirect URLs', () => {
    assert.equal(
        buildOrgOpenUrl({
            redirectUrl: 'https://example.com/redirect',
            serverUrl: 'https://example.my.salesforce.com',
            sessionId: 'sid',
        }),
        'https://example.com/redirect'
    );
});

test('buildOrgOpenUrl generates a frontdoor URL when session data is provided', () => {
    assert.equal(
        buildOrgOpenUrl({
            serverUrl: 'https://example.my.salesforce.com',
            sessionId: '00Dxx!token value',
        }),
        'https://example.my.salesforce.com/secur/frontdoor.jsp?sid=00Dxx!token%20value'
    );
});

test('buildOrgOpenUrl falls back to instanceUrl when serverUrl is absent', () => {
    assert.equal(
        buildOrgOpenUrl({
            instanceUrl: 'https://example.my.salesforce.com',
        }),
        'https://example.my.salesforce.com'
    );
});

test('buildOrgOpenUrl returns null when no usable URL exists', () => {
    assert.equal(buildOrgOpenUrl({}), null);
});

test('Salesforce CLI org list commands request verbose auth details', () => {
    assert.deepEqual(buildSfOrgListArgs(), ['org', 'list', '--json', '--verbose']);
    assert.deepEqual(buildSfdxOrgListArgs(), ['force:org:list', '--json', '--verbose']);
});

test('Salesforce CLI org display commands request verbose auth details for the alias', () => {
    assert.deepEqual(buildSfOrgDisplayArgs('dev-org'), [
        'org',
        'display',
        '--target-org',
        'dev-org',
        '--json',
        '--verbose',
    ]);
    assert.deepEqual(buildSfdxOrgDisplayArgs('dev-org'), [
        'force:org:display',
        '--targetusername',
        'dev-org',
        '--json',
        '--verbose',
    ]);
});

test('Salesforce CLI OAuth login command uses sf with alias and instance URL', () => {
    assert.deepEqual(buildSfOrgLoginWebArgs('dev-org', 'https://test.salesforce.com'), [
        'org',
        'login',
        'web',
        '--alias',
        'dev-org',
        '--instance-url',
        'https://test.salesforce.com',
    ]);
});

test('assertCliOrgHasOAuthCredentials returns CLI orgs with usable OAuth credentials', () => {
    const org = {
        alias: 'dev-org',
        sfdxAuthUrl: 'force://refresh-token@example.my.salesforce.com',
    };

    assert.equal(assertCliOrgHasOAuthCredentials('dev-org', org), org);
});

test('assertCliOrgHasOAuthCredentials throws an actionable login command when credentials are absent', () => {
    assert.throws(
        () =>
            assertCliOrgHasOAuthCredentials('dev-org', {
                alias: 'dev-org',
                username: 'user@example.com',
            }),
        /No OAuth credentials found for alias "dev-org". Re-authenticate with: sf org login web --alias dev-org/
    );
});

test('parseSfdxAuthUrl extracts the refresh token and instance URL', () => {
    assert.deepEqual(
        parseSfdxAuthUrl('force://PlatformCLI::refresh-token@example.my.salesforce.com'),
        {
            instanceUrl: 'https://example.my.salesforce.com',
            refreshToken: 'refresh-token',
        }
    );
});

test('parseSfdxAuthUrl rejects malformed auth URLs without exposing token material', () => {
    assert.throws(() => parseSfdxAuthUrl('not-a-force-url'), /Invalid sfdxAuthUrl format/);
});
