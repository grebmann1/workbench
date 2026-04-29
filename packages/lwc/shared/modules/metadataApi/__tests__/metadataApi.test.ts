import assert from 'node:assert/strict';
import { test } from 'node:test';

import { strFromU8 } from 'fflate';

import { createMetadataApiClient, unzipRetrieveZip, zipUnpackagedFiles } from '../metadataApi.ts';

function makeJsforceConnection(overrides: Record<string, unknown> = {}) {
    return {
        instanceUrl: 'https://my.my.salesforce.com',
        accessToken: 'TOKEN',
        version: '60.0',
        ...overrides,
    };
}

test('zipUnpackagedFiles / unzipRetrieveZip: round-trip preserves file contents', () => {
    const files = {
        'package.xml': new TextEncoder().encode('<xml/>'),
        'classes/Foo.cls': new TextEncoder().encode('public class Foo {}'),
    };
    const zipped = zipUnpackagedFiles(files);
    assert.ok(zipped instanceof Uint8Array);

    // Convert to base64 the way the client produces it.
    let bin = '';
    for (const b of zipped) bin += String.fromCharCode(b);
    const b64 = Buffer.from(bin, 'binary').toString('base64');
    const unzipped = unzipRetrieveZip(b64);
    assert.equal(strFromU8(unzipped['package.xml']), '<xml/>');
    assert.equal(strFromU8(unzipped['classes/Foo.cls']), 'public class Foo {}');
});

test('zipUnpackagedFiles: empty input yields a valid zip', () => {
    const zipped = zipUnpackagedFiles({});
    assert.ok(zipped instanceof Uint8Array);
    assert.ok(zipped.length > 0);
});

test('createMetadataApiClient: throws on missing instanceUrl', () => {
    assert.throws(() => createMetadataApiClient({ accessToken: 'T' }), /Missing Instance URL/);
});

test('createMetadataApiClient: throws on missing accessToken', () => {
    assert.throws(
        () => createMetadataApiClient({ instanceUrl: 'foo.my.salesforce.com' }),
        /Missing Access Token/
    );
});

test('createMetadataApiClient: exposes normalized fields', () => {
    const client = createMetadataApiClient({
        instanceUrl: 'foo.my.salesforce.com',
        accessToken: 'TOKEN',
        apiVersion: '60.0',
        proxyUrl: 'https://proxy.example',
    });
    assert.equal(client.instanceUrl, 'https://foo.my.salesforce.com');
    assert.equal(client.apiVersion, '60.0');
    assert.equal(client.proxyUrl, 'https://proxy.example');
});

test('createMetadataApiClient: falls back to connection for instanceUrl + token', () => {
    const conn = makeJsforceConnection();
    const client = createMetadataApiClient({ connection: conn });
    assert.equal(client.instanceUrl, 'https://my.my.salesforce.com');
    // apiVersion defaults to salesforceUrl's fallback (63.0) unless explicitly passed.
    assert.equal(typeof client.apiVersion, 'string');
    assert.ok(client.apiVersion.length > 0);
});

test('createMetadataApiClient: honors connector.conn as secondary source', () => {
    const conn = makeJsforceConnection({ instanceUrl: 'https://b.my.salesforce.com' });
    const client = createMetadataApiClient({ connector: { conn } });
    assert.equal(client.instanceUrl, 'https://b.my.salesforce.com');
});

test('describeMetadata: delegates to jsforce.metadata.describe when available', async () => {
    let asked: string | undefined;
    const conn = makeJsforceConnection({
        metadata: {
            describe: async (ver: string) => {
                asked = ver;
                return { ok: true, version: ver };
            },
        },
    });
    const client = createMetadataApiClient({ connection: conn, apiVersion: '60.0' });
    const result = await client.describeMetadata();
    assert.equal(asked, '60.0');
    assert.deepEqual(result, { ok: true, version: '60.0' });
});

test('listMetadata: empty query array short-circuits to []', async () => {
    const client = createMetadataApiClient({ connection: makeJsforceConnection() });
    const result = await client.listMetadata({ queries: [] });
    assert.deepEqual(result, []);
});

test('listMetadata: delegates to jsforce.metadata.list when available', async () => {
    let received: unknown;
    const conn = makeJsforceConnection({
        metadata: {
            list: async (q: unknown, ver: string) => {
                received = { q, ver };
                return [{ fullName: 'Foo', type: 'ApexClass' }];
            },
        },
    });
    const client = createMetadataApiClient({ connection: conn, apiVersion: '60.0' });
    const result = await client.listMetadata({ queries: [{ type: 'ApexClass' }] });
    assert.deepEqual(received, { q: [{ type: 'ApexClass' }], ver: '60.0' });
    assert.equal((result as Array<{ fullName: string }>)[0].fullName, 'Foo');
});

test('retrieve: delegates to jsforce and returns id', async () => {
    let received: unknown;
    const conn = makeJsforceConnection({
        metadata: {
            retrieve: async (req: unknown) => {
                received = req;
                return { id: '0Af000', asyncProcessId: '0Af000' };
            },
        },
    });
    const client = createMetadataApiClient({ connection: conn, apiVersion: '60.0' });
    const typesMap = new Map<string, string[]>([['ApexClass', ['Foo', 'Bar']]]);
    const result = await client.retrieve({ typesMap });
    assert.deepEqual(result, { id: '0Af000' });
    const req = received as { unpackaged: { types: Array<{ name: string; members: string[] }> } };
    assert.deepEqual(req.unpackaged.types, [{ name: 'ApexClass', members: ['Foo', 'Bar'] }]);
});

test('retrieve: throws when jsforce returns no id', async () => {
    const conn = makeJsforceConnection({
        metadata: {
            retrieve: async () => ({}),
        },
    });
    const client = createMetadataApiClient({ connection: conn });
    await assert.rejects(
        client.retrieve({ typesMap: new Map([['ApexClass', ['Foo']]]) }),
        /Retrieve did not return an id/
    );
});

test('checkRetrieveStatus: delegates to jsforce', async () => {
    let capturedArgs: unknown;
    const conn = makeJsforceConnection({
        metadata: {
            checkRetrieveStatus: async (id: string, includeZip: boolean) => {
                capturedArgs = { id, includeZip };
                return { done: true, success: true, status: 'Succeeded' };
            },
        },
    });
    const client = createMetadataApiClient({ connection: conn });
    const result = await client.checkRetrieveStatus('0Af000');
    assert.deepEqual(capturedArgs, { id: '0Af000', includeZip: true });
    assert.equal((result as { done: boolean }).done, true);
});

test('deploy: delegates to jsforce and returns id', async () => {
    let capturedOptions: unknown;
    const conn = makeJsforceConnection({
        metadata: {
            deploy: async (_zip: string, options: unknown) => {
                capturedOptions = options;
                return { id: 'deploy1' };
            },
        },
    });
    const client = createMetadataApiClient({ connection: conn });
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await client.deploy(bytes, { checkOnly: true, testLevel: 'RunLocalTests' });
    assert.deepEqual(result, { id: 'deploy1' });
    assert.deepEqual(capturedOptions, {
        checkOnly: true,
        singlePackage: true,
        testLevel: 'RunLocalTests',
    });
});

test('deploy: throws when jsforce returns no id', async () => {
    const conn = makeJsforceConnection({
        metadata: {
            deploy: async () => ({}),
        },
    });
    const client = createMetadataApiClient({ connection: conn });
    await assert.rejects(client.deploy(new Uint8Array()), /Deploy did not return an id/);
});

test('checkDeployStatus: delegates to jsforce', async () => {
    let capturedArgs: unknown;
    const conn = makeJsforceConnection({
        metadata: {
            checkDeployStatus: async (id: string, includeDetails: boolean) => {
                capturedArgs = { id, includeDetails };
                return { done: true, success: false };
            },
        },
    });
    const client = createMetadataApiClient({ connection: conn });
    const result = await client.checkDeployStatus('dep1', { includeDetails: false });
    assert.deepEqual(capturedArgs, { id: 'dep1', includeDetails: false });
    assert.equal((result as { success: boolean }).success, false);
});
