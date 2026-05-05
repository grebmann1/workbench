"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const desktopOrgCliUtils_1 = require("./desktopOrgCliUtils");
const desktopServiceUtils_1 = require("./desktopServiceUtils");
(0, node_test_1.default)('buildOrgOpenUrl prefers redirect URLs', () => {
    strict_1.default.equal((0, desktopServiceUtils_1.buildOrgOpenUrl)({
        redirectUrl: 'https://example.com/redirect',
        serverUrl: 'https://example.my.salesforce.com',
        sessionId: 'sid',
    }), 'https://example.com/redirect');
});
(0, node_test_1.default)('buildOrgOpenUrl generates a frontdoor URL when session data is provided', () => {
    strict_1.default.equal((0, desktopServiceUtils_1.buildOrgOpenUrl)({
        serverUrl: 'https://example.my.salesforce.com',
        sessionId: '00Dxx!token value',
    }), 'https://example.my.salesforce.com/secur/frontdoor.jsp?sid=00Dxx!token%20value');
});
(0, node_test_1.default)('buildOrgOpenUrl falls back to instanceUrl when serverUrl is absent', () => {
    strict_1.default.equal((0, desktopServiceUtils_1.buildOrgOpenUrl)({
        instanceUrl: 'https://example.my.salesforce.com',
    }), 'https://example.my.salesforce.com');
});
(0, node_test_1.default)('buildOrgOpenUrl returns null when no usable URL exists', () => {
    strict_1.default.equal((0, desktopServiceUtils_1.buildOrgOpenUrl)({}), null);
});
(0, node_test_1.default)('Salesforce CLI org list commands request verbose auth details', () => {
    strict_1.default.deepEqual((0, desktopOrgCliUtils_1.buildSfOrgListArgs)(), ['org', 'list', '--json', '--verbose']);
    strict_1.default.deepEqual((0, desktopOrgCliUtils_1.buildSfdxOrgListArgs)(), ['force:org:list', '--json', '--verbose']);
});
(0, node_test_1.default)('Salesforce CLI org display commands request verbose auth details for the alias', () => {
    strict_1.default.deepEqual((0, desktopOrgCliUtils_1.buildSfOrgDisplayArgs)('dev-org'), [
        'org',
        'display',
        '--target-org',
        'dev-org',
        '--json',
        '--verbose',
    ]);
    strict_1.default.deepEqual((0, desktopOrgCliUtils_1.buildSfdxOrgDisplayArgs)('dev-org'), [
        'force:org:display',
        '--targetusername',
        'dev-org',
        '--json',
        '--verbose',
    ]);
});
(0, node_test_1.default)('Salesforce CLI OAuth login command uses sf with alias and instance URL', () => {
    strict_1.default.deepEqual((0, desktopOrgCliUtils_1.buildSfOrgLoginWebArgs)('dev-org', 'https://test.salesforce.com'), [
        'org',
        'login',
        'web',
        '--alias',
        'dev-org',
        '--instance-url',
        'https://test.salesforce.com',
    ]);
});
(0, node_test_1.default)('assertCliOrgHasOAuthCredentials returns CLI orgs with usable OAuth credentials', () => {
    const org = {
        alias: 'dev-org',
        sfdxAuthUrl: 'force://refresh-token@example.my.salesforce.com',
    };
    strict_1.default.equal((0, desktopOrgCliUtils_1.assertCliOrgHasOAuthCredentials)('dev-org', org), org);
});
(0, node_test_1.default)('assertCliOrgHasOAuthCredentials throws an actionable login command when credentials are absent', () => {
    strict_1.default.throws(() => (0, desktopOrgCliUtils_1.assertCliOrgHasOAuthCredentials)('dev-org', {
        alias: 'dev-org',
        username: 'user@example.com',
    }), /No OAuth credentials found for alias "dev-org". Re-authenticate with: sf org login web --alias dev-org/);
});
(0, node_test_1.default)('parseSfdxAuthUrl extracts the refresh token and instance URL', () => {
    strict_1.default.deepEqual((0, desktopOrgCliUtils_1.parseSfdxAuthUrl)('force://PlatformCLI::refresh-token@example.my.salesforce.com'), {
        instanceUrl: 'https://example.my.salesforce.com',
        refreshToken: 'refresh-token',
    });
});
(0, node_test_1.default)('parseSfdxAuthUrl rejects malformed auth URLs without exposing token material', () => {
    strict_1.default.throws(() => (0, desktopOrgCliUtils_1.parseSfdxAuthUrl)('not-a-force-url'), /Invalid sfdxAuthUrl format/);
});
