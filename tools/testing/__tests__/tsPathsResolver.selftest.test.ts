import assert from 'node:assert/strict';
import { test } from 'node:test';

test('resolver: shared/* wildcard (shared/salesforceUrl) resolves', async () => {
    const mod = await import('shared/salesforceUrl');
    assert.equal(typeof mod.normalizeInstanceUrl, 'function');
    assert.equal(
        mod.normalizeInstanceUrl('foo.my.salesforce.com'),
        'https://foo.my.salesforce.com'
    );
});

test('resolver: shared/utils resolves via /index.ts fallback', async () => {
    const mod = await import('shared/utils');
    assert.equal(typeof mod.isChromeExtension, 'function');
});

test('resolver: host-api/commands (main tsconfig exact key) resolves', async () => {
    const mod = await import('host-api/commands');
    assert.equal(typeof mod.registerCommand, 'function');
    assert.equal(typeof mod.invokeCommand, 'function');
});

test('resolver: extensionless relative import resolves', async () => {
    // Sibling .mjs: imports './tsPathsResolver' without extension.
    const mod = await import('./tsPathsResolver-relativeProbe.mjs');
    assert.equal(mod.ok, true);
});
