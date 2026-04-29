import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    pickRemoteStamp,
    hashText,
    loadSourceTracking,
    saveSourceTracking,
} from '../sourceTracking.ts';

type UriStub = { __path: string };

function createVscodeStub(initialFiles: Record<string, string> = {}) {
    const files = new Map<string, Uint8Array>();
    for (const [k, v] of Object.entries(initialFiles)) {
        files.set(k, new TextEncoder().encode(v));
    }
    const createdDirs: string[] = [];

    const vscode = {
        Uri: {
            file: (path: string): UriStub => ({ __path: path }),
        },
        workspace: {
            fs: {
                createDirectory: async (uri: UriStub) => {
                    createdDirs.push(uri.__path);
                },
                readFile: async (uri: UriStub): Promise<Uint8Array> => {
                    const v = files.get(uri.__path);
                    if (!v) throw new Error('ENOENT ' + uri.__path);
                    return v;
                },
                writeFile: async (uri: UriStub, content: Uint8Array) => {
                    files.set(uri.__path, content);
                },
            },
        },
    };
    return { vscode, files, createdDirs };
}

test('pickRemoteStamp: prefers SystemModstamp', () => {
    assert.equal(
        pickRemoteStamp({
            SystemModstamp: 'A',
            LastModifiedDate: 'B',
            LastModifieddate: 'C',
        }),
        'A'
    );
});

test('pickRemoteStamp: falls back to LastModifiedDate then camelCase LastModifieddate', () => {
    assert.equal(pickRemoteStamp({ LastModifiedDate: 'B' }), 'B');
    assert.equal(pickRemoteStamp({ LastModifieddate: 'C' }), 'C');
});

test('pickRemoteStamp: null/empty record → null', () => {
    assert.equal(pickRemoteStamp(null), null);
    assert.equal(pickRemoteStamp(undefined), null);
    assert.equal(pickRemoteStamp({}), null);
});

test('hashText: empty/null/undefined yield the DJB2 seed value', () => {
    // The seed 5381 has been XORed with nothing; (5381 >>> 0).toString(16) = "1505"
    const empty = hashText('');
    assert.equal(empty, '00001505');
    assert.equal(hashText(null), empty);
    assert.equal(hashText(undefined), empty);
});

test('hashText: deterministic 8-char lowercase hex for same input', () => {
    const a = hashText('salesforce');
    const b = hashText('salesforce');
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{8}$/);
});

test('hashText: differs for different inputs', () => {
    assert.notEqual(hashText('a'), hashText('b'));
});

test('loadSourceTracking: reads and parses JSON file', async () => {
    const { vscode } = createVscodeStub({
        '/workspace/.salesforce/source-tracking.json': '{"ApexClass/Foo":"stamp1"}',
    });
    const result = await loadSourceTracking(vscode);
    assert.deepEqual(result, { 'ApexClass/Foo': 'stamp1' });
});

test('loadSourceTracking: missing file → null', async () => {
    const { vscode } = createVscodeStub();
    const result = await loadSourceTracking(vscode);
    assert.equal(result, null);
});

test('loadSourceTracking: malformed JSON → null', async () => {
    const { vscode } = createVscodeStub({
        '/workspace/.salesforce/source-tracking.json': 'not json',
    });
    const result = await loadSourceTracking(vscode);
    assert.equal(result, null);
});

test('saveSourceTracking: writes JSON payload and creates parent directory', async () => {
    const { vscode, files, createdDirs } = createVscodeStub();
    await saveSourceTracking(vscode, { 'ApexClass/Bar': 'stamp2' });
    assert.ok(createdDirs.includes('/workspace/.salesforce'));
    const written = files.get('/workspace/.salesforce/source-tracking.json');
    assert.ok(written);
    const text = new TextDecoder().decode(written);
    assert.deepEqual(JSON.parse(text), { 'ApexClass/Bar': 'stamp2' });
});

test('saveSourceTracking: null/undefined persists as empty object', async () => {
    const { vscode, files } = createVscodeStub();
    await saveSourceTracking(vscode, null);
    const written = files.get('/workspace/.salesforce/source-tracking.json');
    assert.ok(written);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(written)), {});
});
