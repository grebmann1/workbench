import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    DEFAULT_SOURCE_API_VERSION,
    normalizeWorkspaceRoot,
    normalizeSfApiVersion,
    deriveConnectionWorkspaceRoot,
    buildWorkbenchConnection,
    isAuthError,
    hasUsableConnection,
    buildOrgContext,
    buildWorkspaceBootstrap,
    resolveConnectionRecord,
    refreshConnectionRecord,
} from '../workbench.ts';

// ── normalizeWorkspaceRoot ───────────────────────────────────────────────────

test('normalizeWorkspaceRoot: returns default when empty/undefined', () => {
    assert.equal(normalizeWorkspaceRoot(''), '/workspace');
    assert.equal(normalizeWorkspaceRoot(undefined), '/workspace');
    assert.equal(normalizeWorkspaceRoot(null), '/workspace');
});

test('normalizeWorkspaceRoot: strips leading/trailing slashes and prepends one', () => {
    assert.equal(normalizeWorkspaceRoot('foo/bar'), '/foo/bar');
    assert.equal(normalizeWorkspaceRoot('///foo/bar///'), '/foo/bar');
    assert.equal(normalizeWorkspaceRoot('/workspace/orgs/acme'), '/workspace/orgs/acme');
});

test('normalizeWorkspaceRoot: converts backslashes to forward slashes', () => {
    assert.equal(normalizeWorkspaceRoot('workspace\\orgs\\acme'), '/workspace/orgs/acme');
});

test('normalizeWorkspaceRoot: honors custom defaultRoot', () => {
    assert.equal(normalizeWorkspaceRoot('', '/custom'), '/custom');
});

// ── normalizeSfApiVersion ────────────────────────────────────────────────────

test('normalizeSfApiVersion: returns input when non-empty', () => {
    assert.equal(normalizeSfApiVersion('63.0'), '63.0');
});

test('normalizeSfApiVersion: falls back to default when empty', () => {
    assert.equal(normalizeSfApiVersion(''), DEFAULT_SOURCE_API_VERSION);
    assert.equal(normalizeSfApiVersion(null), DEFAULT_SOURCE_API_VERSION);
    assert.equal(normalizeSfApiVersion(undefined), DEFAULT_SOURCE_API_VERSION);
});

test('normalizeSfApiVersion: uses provided fallback when supplied', () => {
    assert.equal(normalizeSfApiVersion('', '61.0'), '61.0');
});

// ── deriveConnectionWorkspaceRoot ────────────────────────────────────────────

test('deriveConnectionWorkspaceRoot: derives from instanceUrl host', () => {
    const root = deriveConnectionWorkspaceRoot(
        { instanceUrl: 'https://my-org.my.salesforce.com' },
        '/workspace'
    );
    assert.ok(root.endsWith('/my-org.my.salesforce.com'));
});

test('deriveConnectionWorkspaceRoot: falls back to "org" segment when no host', () => {
    const root = deriveConnectionWorkspaceRoot({ instanceUrl: '' }, '/workspace');
    assert.ok(root.endsWith('/org'));
});

test('deriveConnectionWorkspaceRoot: sanitizes unsafe chars in host', () => {
    const root = deriveConnectionWorkspaceRoot(
        { instanceUrl: 'https://host:with:colons' },
        '/workspace'
    );
    assert.ok(!root.includes(':'));
});

// ── isAuthError ──────────────────────────────────────────────────────────────

test('isAuthError: returns true for HTTP 401', () => {
    assert.equal(isAuthError({ status: 401 }), true);
});

test('isAuthError: returns true for INVALID_SESSION_ID message', () => {
    assert.equal(isAuthError({ message: 'Something INVALID_SESSION_ID happened' }), true);
    assert.equal(isAuthError({ message: 'invalid_session_id' }), true);
});

test('isAuthError: returns true for "(401)" substring in message', () => {
    assert.equal(isAuthError({ message: 'Error (401) upstream' }), true);
});

test('isAuthError: detects INVALID_SESSION_ID on errorCode (jsforce shape)', () => {
    // jsforce stamps the marker on errorCode, with a human message that lacks
    // the exact token — this is the real expired-session envelope.
    assert.equal(
        isAuthError({ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }),
        true
    );
});

test('isAuthError: detects INVALID_SESSION_ID on error name', () => {
    assert.equal(isAuthError({ name: 'INVALID_SESSION_ID', message: 'nope' }), true);
});

test('isAuthError: returns false for unrelated errors', () => {
    assert.equal(isAuthError({ status: 500, message: 'boom' }), false);
    assert.equal(isAuthError(null), false);
    assert.equal(isAuthError(undefined), false);
    assert.equal(isAuthError({}), false);
    assert.equal(isAuthError({ errorCode: 'REQUIRED_FIELD_MISSING' }), false);
});

// ── hasUsableConnection ──────────────────────────────────────────────────────

test('hasUsableConnection: true when instanceUrl + accessToken present', () => {
    assert.equal(
        hasUsableConnection({
            instanceUrl: 'https://x.salesforce.com',
            accessToken: 'abc',
        }),
        true
    );
});

test('hasUsableConnection: false when missing pieces', () => {
    assert.equal(hasUsableConnection(null), false);
    assert.equal(hasUsableConnection({ instanceUrl: '', accessToken: 'abc' }), false);
    assert.equal(hasUsableConnection({ instanceUrl: 'x', accessToken: '' }), false);
});

test('hasUsableConnection: false when sessionHasExpired or hasError', () => {
    assert.equal(
        hasUsableConnection({
            instanceUrl: 'x',
            accessToken: 'y',
            sessionHasExpired: true,
        }),
        false
    );
    assert.equal(
        hasUsableConnection({ instanceUrl: 'x', accessToken: 'y', hasError: true }),
        false
    );
});

// ── buildWorkbenchConnection ─────────────────────────────────────────────────

test('buildWorkbenchConnection: null when connector has no conn', () => {
    assert.equal(buildWorkbenchConnection(null), null);
    assert.equal(buildWorkbenchConnection({}), null);
});

test('buildWorkbenchConnection: builds full connection record from connector', () => {
    const connector = {
        conn: {
            instanceUrl: 'https://acme.my.salesforce.com',
            accessToken: 'token-123',
            username: 'alice@acme.com',
            orgId: '00D000000000001',
            userId: '005000000000001',
            organizationName: 'Acme',
            organizationType: 'Production',
            version: '63.0',
            authType: 'OAUTH',
            isSandbox: false,
            isScratch: false,
        },
    };
    const conn = buildWorkbenchConnection(connector)!;
    assert.equal(conn.instanceUrl, 'https://acme.my.salesforce.com');
    assert.equal(conn.accessToken, 'token-123');
    assert.equal(conn.username, 'alice@acme.com');
    assert.equal(conn.organizationName, 'Acme');
    assert.equal(conn.organizationType, 'Production');
    assert.equal(conn.apiVersion, '63.0');
    assert.equal(conn.authType, 'oauth');
    assert.equal(conn.isSandbox, false);
    assert.equal(conn.hasConnection, true);
    assert.ok(conn.workspaceRoot.includes('acme.my.salesforce.com'));
});

test('buildWorkbenchConnection: inherits from configuration when conn lacks fields', () => {
    const connector = {
        conn: { instanceUrl: 'https://x.salesforce.com', accessToken: 'tk' },
        configuration: {
            username: 'bob@x.com',
            orgName: 'X Corp',
            isSandbox: true,
        },
    };
    const conn = buildWorkbenchConnection(connector)!;
    assert.equal(conn.username, 'bob@x.com');
    assert.equal(conn.organizationName, 'X Corp');
    assert.equal(conn.isSandbox, true);
});

test('buildWorkbenchConnection: falls back to default apiVersion when missing', () => {
    const conn = buildWorkbenchConnection({
        conn: { instanceUrl: 'https://x.salesforce.com', accessToken: 'tk' },
    })!;
    assert.equal(conn.apiVersion, DEFAULT_SOURCE_API_VERSION);
});

test('buildWorkbenchConnection: marks hasConnection=false when session expired', () => {
    const conn = buildWorkbenchConnection(
        { conn: { instanceUrl: 'https://x.salesforce.com', accessToken: 'tk' } },
        { sessionHasExpired: true }
    )!;
    assert.equal(conn.hasConnection, false);
    assert.equal(conn.sessionHasExpired, true);
});

test('buildWorkbenchConnection: propagates connector error state', () => {
    const conn = buildWorkbenchConnection(
        { conn: { instanceUrl: 'https://x.salesforce.com', accessToken: 'tk' } },
        { connectorHasError: true, connectorErrorMessage: 'boom' }
    )!;
    assert.equal(conn.hasError, true);
    assert.equal(conn.errorMessage, 'boom');
    assert.equal(conn.hasConnection, false);
});

// ── buildOrgContext ──────────────────────────────────────────────────────────

test('buildOrgContext: empty connection returns an unknown-env context', () => {
    const ctx = buildOrgContext({});
    assert.equal(ctx.hasConnection, false);
    assert.equal(ctx.environmentType, 'unknown');
    assert.equal(ctx.displayName, 'Salesforce org');
    assert.equal(ctx.tone, 'neutral');
});

test('buildOrgContext: production env when isSandbox=false', () => {
    const ctx = buildOrgContext({
        instanceUrl: 'https://x.salesforce.com',
        accessToken: 'tk',
        isSandbox: false,
        organizationName: 'Acme',
    });
    assert.equal(ctx.hasConnection, true);
    assert.equal(ctx.environmentType, 'production');
    assert.equal(ctx.environmentLabel, 'Production org');
    assert.equal(ctx.tone, 'danger');
    assert.equal(ctx.bannerTitle, 'Welcome to Acme.');
});

test('buildOrgContext: sandbox env when isSandbox=true', () => {
    const ctx = buildOrgContext({ isSandbox: true, instanceUrl: 'x', accessToken: 'y' });
    assert.equal(ctx.environmentType, 'sandbox');
    assert.equal(ctx.environmentLabel, 'Sandbox org');
    assert.equal(ctx.tone, 'info');
});

test('buildOrgContext: scratch env takes precedence over sandbox', () => {
    const ctx = buildOrgContext({
        isSandbox: true,
        isScratch: true,
        instanceUrl: 'x',
        accessToken: 'y',
    });
    assert.equal(ctx.environmentType, 'scratch');
});

test('buildOrgContext: trailhead env from organizationType', () => {
    const ctx = buildOrgContext({
        organizationType: 'Trailhead',
        instanceUrl: 'x',
        accessToken: 'y',
    });
    assert.equal(ctx.environmentType, 'trailhead');
});

test('buildOrgContext: prefers displayName → organizationName → username → host → orgId', () => {
    assert.equal(buildOrgContext({ displayName: 'Alpha' }).displayName, 'Alpha');
    assert.equal(buildOrgContext({ organizationName: 'Beta' }).displayName, 'Beta');
    assert.equal(buildOrgContext({ username: 'u@x.com' }).displayName, 'u@x.com');
    assert.equal(
        buildOrgContext({ instanceUrl: 'https://gamma.salesforce.com' }).displayName,
        'gamma.salesforce.com'
    );
    assert.equal(buildOrgContext({ orgId: '00D00000000abc' }).displayName, '00D00000000abc');
});

// ── buildWorkspaceBootstrap ──────────────────────────────────────────────────

test('buildWorkspaceBootstrap: returns root, directories, and initialFiles', async () => {
    const boot = await buildWorkspaceBootstrap(
        { instanceUrl: 'https://org1.my.salesforce.com', isSandbox: false },
        '/workspace/orgs'
    );
    assert.ok(boot.workspaceRoot.startsWith('/workspace/orgs/'));
    assert.ok(Array.isArray(boot.ensureDirectories));
    assert.ok(boot.ensureDirectories.length > 5);
    // Should include every known metadata directory under force-app/main/default
    const metaRoot = `${boot.workspaceRoot}/force-app/main/default`;
    assert.ok(boot.ensureDirectories.includes(metaRoot));
    assert.ok(boot.ensureDirectories.includes(`${metaRoot}/classes`));
    assert.ok(boot.ensureDirectories.includes(`${metaRoot}/lwc`));
    // initialFiles keys must be prefixed with the workspace root
    const keys = Object.keys(boot.initialFiles);
    assert.ok(keys.length > 0);
    for (const key of keys) {
        assert.ok(
            key.startsWith(`${boot.workspaceRoot}/`),
            `initialFile ${key} should be prefixed with workspaceRoot`
        );
    }
});

test('buildWorkspaceBootstrap: uses sandbox login URL when isSandbox=true', async () => {
    const boot = await buildWorkspaceBootstrap({
        instanceUrl: 'https://x.my.salesforce.com',
        isSandbox: true,
    });
    const sfdxFile = Object.entries(boot.initialFiles).find(([path]) =>
        path.endsWith('/sfdx-project.json')
    )!;
    assert.ok(sfdxFile[1].includes('https://test.salesforce.com'));
});

test('buildWorkspaceBootstrap: uses prod login URL when isSandbox=false', async () => {
    const boot = await buildWorkspaceBootstrap({
        instanceUrl: 'https://x.my.salesforce.com',
        isSandbox: false,
    });
    const sfdxFile = Object.entries(boot.initialFiles).find(([path]) =>
        path.endsWith('/sfdx-project.json')
    )!;
    assert.ok(sfdxFile[1].includes('https://login.salesforce.com'));
});

// ── resolveConnectionRecord / refreshConnectionRecord ────────────────────────

test('resolveConnectionRecord: rejects when missing instanceUrl/accessToken', async () => {
    await assert.rejects(() => resolveConnectionRecord({}), /injected Salesforce connector/);
    await assert.rejects(
        () => resolveConnectionRecord({ instanceUrl: 'x' }),
        /injected Salesforce connector/
    );
});

test('resolveConnectionRecord: returns connection with normalized workspaceRoot', async () => {
    const resolved = await resolveConnectionRecord({
        instanceUrl: 'https://host.my.salesforce.com',
        accessToken: 'tk',
    });
    assert.equal(resolved.instanceUrl, 'https://host.my.salesforce.com');
    assert.equal(resolved.accessToken, 'tk');
    assert.ok(typeof resolved.workspaceRoot === 'string');
    assert.ok((resolved.workspaceRoot as string).startsWith('/'));
});

test('refreshConnectionRecord: delegates to resolveConnectionRecord', async () => {
    const out = await refreshConnectionRecord({
        instanceUrl: 'https://host.my.salesforce.com',
        accessToken: 'tk',
    });
    assert.ok(out.workspaceRoot);
});
