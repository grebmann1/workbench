import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as any).window = {};

const base = await import('../base.ts');
const {
    extractName,
    extractConfig,
    getSalesforceURL,
    normalizeSandboxValue,
    normalizeScratchValue,
    getOrgHost,
    inferScratchValue,
    inferSandboxValue,
    normalizeOrganizationType,
    getConnectionAuthType,
    normalizeConfiguration,
    extractConfigurationValuesFromConnection,
    buildConnectionFromConnector,
    normalizeConnection,
} = base as any;
const { OAUTH_TYPES } = await import('../credentialStrategies/oauthTypes.ts');
const { PLATFORM } = await import('../platform.ts');

test('extractName: splits company-prefixed alias; fallback when no "-"', () => {
    assert.deepEqual(extractName('acme-prod'), { company: 'acme', name: 'prod' });
    assert.deepEqual(extractName('prod'), { company: '', name: 'prod' });
    assert.deepEqual(extractName(''), { company: '', name: '' });
});

test('extractConfig: parses force://clientId::refreshToken@host URIs', () => {
    const parsed = extractConfig('force://3MVG::rf123@my.salesforce.com');
    assert.deepEqual(parsed, {
        clientId: '3MVG',
        refreshToken: 'rf123',
        instanceUrl: 'my.salesforce.com',
    });
    assert.equal(extractConfig('not-a-force-url'), null);
    assert.equal(extractConfig(null), null);
});

test('getSalesforceURL: lightning.force.com → my.salesforce.com', () => {
    assert.equal(
        getSalesforceURL('https://acme.lightning.force.com'),
        'https://acme.my.salesforce.com'
    );
});

test('getSalesforceURL: setup-com → salesforce.com', () => {
    assert.equal(
        getSalesforceURL('https://acme.salesforce-setup.com'),
        'https://acme.salesforce.com'
    );
});

test('getSalesforceURL: unrelated hosts returned verbatim', () => {
    assert.equal(getSalesforceURL('https://example.com'), 'https://example.com');
});

test('normalizeSandboxValue / normalizeScratchValue: boolean passthrough; "true"/"false" strings; else null', () => {
    assert.equal(normalizeSandboxValue(true), true);
    assert.equal(normalizeSandboxValue('True'), true);
    assert.equal(normalizeSandboxValue('FALSE'), false);
    assert.equal(normalizeSandboxValue('maybe'), null);
    assert.equal(normalizeSandboxValue(null), null);
    assert.equal(normalizeScratchValue(false), false);
});

test('getOrgHost: returns host from URL; falls back to strip-scheme when URL parsing fails', () => {
    assert.equal(getOrgHost('https://acme.my.salesforce.com/ui'), 'acme.my.salesforce.com');
    assert.equal(getOrgHost('acme.my.salesforce.com'), 'acme.my.salesforce.com');
    assert.equal(getOrgHost(''), '');
});

test('inferScratchValue: explicit beats organizationType hint', () => {
    assert.equal(inferScratchValue({ isScratch: false, organizationType: 'Scratch' }), false);
    assert.equal(inferScratchValue({ organizationType: 'Scratch' }), true);
    assert.equal(inferScratchValue({ instanceUrl: 'https://x.scratch.my.salesforce.com' }), true);
    assert.equal(inferScratchValue({}), null);
});

test('inferSandboxValue: organizationType "production" → false, "sandbox" → true, host sandbox hint → true', () => {
    assert.equal(inferSandboxValue({ organizationType: 'Production' }), false);
    assert.equal(inferSandboxValue({ organizationType: 'Sandbox org' }), true);
    assert.equal(inferSandboxValue({ instanceUrl: 'https://my-sandbox.my.salesforce.com' }), true);
    assert.equal(inferSandboxValue({}), null);
});

test('normalizeOrganizationType: explicit > port → Dev > trailhead host > Scratch > Sandbox/Production', () => {
    assert.equal(normalizeOrganizationType({ organizationType: 'Custom' }), 'Custom');
    assert.equal(normalizeOrganizationType({ instanceUrl: 'http://localhost:6109' }), 'Dev');
    assert.equal(
        normalizeOrganizationType({ instanceUrl: 'https://x.trailblaze.my.salesforce.com' }),
        'Trailhead'
    );
    assert.equal(normalizeOrganizationType({ isScratch: true }), 'Scratch');
    assert.equal(normalizeOrganizationType({ isSandbox: true }), 'Sandbox');
    assert.equal(normalizeOrganizationType({ isSandbox: false }), 'Production');
    assert.equal(normalizeOrganizationType({}), '');
});

test('getConnectionAuthType: maps credentialType to lowercased string; unknown → "manual"', () => {
    assert.equal(getConnectionAuthType({ credentialType: OAUTH_TYPES.OAUTH }), 'oauth');
    assert.equal(getConnectionAuthType({ credentialType: OAUTH_TYPES.SESSION }), 'session');
    assert.equal(getConnectionAuthType({ credentialType: OAUTH_TYPES.USERNAME }), 'username');
    assert.equal(getConnectionAuthType({ credentialType: 'REDIRECT' }), 'manual');
    assert.equal(getConnectionAuthType(null), 'manual');
});

test('normalizeConfiguration: OAUTH happy path fills id, name, credentialType', () => {
    const out = normalizeConfiguration({
        alias: 'acme-prod',
        credentialType: OAUTH_TYPES.OAUTH,
        refreshToken: 'rt',
        instanceUrl: 'https://acme.my.salesforce.com',
        _formatVersion: 1,
    });
    assert.equal(out.alias, 'acme-prod');
    assert.equal(out.id, 'acme-prod');
    assert.equal(out.company, 'acme');
    assert.equal(out.name, 'prod');
    assert.equal(out.credentialType, OAUTH_TYPES.OAUTH);
});

test('normalizeConfiguration: missing refreshToken on OAUTH throws', () => {
    assert.throws(
        () =>
            normalizeConfiguration({
                alias: 'x',
                credentialType: OAUTH_TYPES.OAUTH,
                _formatVersion: 1,
            }),
        /Missing required field/
    );
});

test('normalizeConfiguration: byPassValidation skips missing-field error', () => {
    const out = normalizeConfiguration(
        {
            alias: 'x',
            credentialType: OAUTH_TYPES.OAUTH,
            _formatVersion: 1,
        },
        true
    );
    assert.equal(out.alias, 'x');
});

test('normalizeConfiguration: legacy record without _formatVersion and refreshToken gets credentialType OAUTH + _formatVersion 1', () => {
    const out = normalizeConfiguration(
        { alias: 'a', refreshToken: 'rt', instanceUrl: 'https://a.my.salesforce.com' },
        true
    );
    assert.equal(out.credentialType, OAUTH_TYPES.OAUTH);
    assert.equal(out._formatVersion, 1);
});

test('extractConfigurationValuesFromConnection: copies the expected keys', () => {
    const out = extractConfigurationValuesFromConnection({
        accessToken: 'a',
        instanceUrl: 'https://x',
        refreshToken: 'r',
        userInfo: { organization_id: 'org1' },
    });
    assert.equal(out.accessToken, 'a');
    assert.equal(out.orgId, 'org1');
});

test('buildConnectionFromConnector: returns null when conn is missing; hasConnection reflects instanceUrl+accessToken', () => {
    assert.equal(buildConnectionFromConnector(null), null);
    assert.equal(buildConnectionFromConnector({ conn: null }), null);

    const conn = buildConnectionFromConnector({
        conn: {
            instanceUrl: 'https://acme.my.salesforce.com',
            accessToken: 'a',
            version: '59.0',
        },
        configuration: { alias: 'a', credentialType: OAUTH_TYPES.OAUTH },
    });
    assert.equal(conn.hasConnection, true);
    assert.equal(conn.apiVersion, '59.0');
    assert.equal(conn.authType, 'oauth');
});

test('normalizeConnection: Electron uses the same-origin desktop proxy', () => {
    (globalThis as any).window = {
        location: {
            origin: 'http://127.0.0.1:47321',
        },
        jsforceSettings: {
            proxyUrl: 'https://www.sf-workbench.com/proxy/',
        },
    };

    const electronParams = normalizeConnection(
        OAUTH_TYPES.SESSION,
        { instanceUrl: 'https://acme.my.salesforce.com' },
        PLATFORM.ELECTRON
    );
    assert.equal(electronParams.proxyUrl, 'http://127.0.0.1:47321/proxy');

    const chromeParams = normalizeConnection(
        OAUTH_TYPES.SESSION,
        { instanceUrl: 'https://acme.my.salesforce.com' },
        PLATFORM.CHROME
    );
    assert.equal(chromeParams.proxyUrl, null);

    const webParams = normalizeConnection(
        OAUTH_TYPES.SESSION,
        { instanceUrl: 'https://acme.my.salesforce.com' },
        PLATFORM.WEB
    );
    assert.equal(webParams.proxyUrl, 'https://www.sf-workbench.com/proxy/');

    const disabledParams = normalizeConnection(
        OAUTH_TYPES.SESSION,
        { instanceUrl: 'https://acme.my.salesforce.com' },
        PLATFORM.ELECTRON,
        { isProxyDisabled: true }
    );
    assert.equal(disabledParams.proxyUrl, null);
});
