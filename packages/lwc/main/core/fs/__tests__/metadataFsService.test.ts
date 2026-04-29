import assert from 'node:assert/strict';
import { test } from 'node:test';

import { __testables, createMetadataFsService } from '../metadataFsService.ts';

function createFsStub() {
    const mkdirCalls: string[] = [];
    const files = new Map<string, string>();
    const fs = {
        mkdir: async (path: string) => {
            mkdirCalls.push(path);
        },
        writeFile: async (path: string, body: string) => {
            files.set(path, body);
        },
    };
    return { fs, mkdirCalls, files };
}

test('getAliasRoot: builds alias root path for SFDX storage', () => {
    assert.equal(__testables.getAliasRoot('My Org'), '/workspace/orgs/My_Org');
});

test('getAliasRoot: empty/whitespace alias → null', () => {
    assert.equal(__testables.getAliasRoot(''), null);
    assert.equal(__testables.getAliasRoot('   '), null);
});

test('getAliasRoot: sanitizes unsafe path characters', () => {
    // Slashes/colons etc. replaced with underscores
    assert.equal(__testables.getAliasRoot('evil/../path'), '/workspace/orgs/evil_.._path');
});

test('toPackageXml: includes selected metadata types and version', () => {
    const xml = __testables.toPackageXml(['ApexClass', 'Flow'], '63.0');
    assert.match(xml, /<name>ApexClass<\/name>/);
    assert.match(xml, /<name>Flow<\/name>/);
    assert.match(xml, /<version>63\.0<\/version>/);
});

test('toPackageXml: sorts types alphabetically', () => {
    const xml = __testables.toPackageXml(['Flow', 'ApexClass'], '63.0');
    const apexIdx = xml.indexOf('ApexClass');
    const flowIdx = xml.indexOf('Flow');
    assert.ok(apexIdx > -1 && flowIdx > apexIdx);
});

test('toPackageXml: empty types still includes <version>', () => {
    const xml = __testables.toPackageXml([], '62.0');
    assert.match(xml, /<version>62\.0<\/version>/);
});

test('writeRetrievedPackage: writes each zip entry under sfdx root', async () => {
    const { fs, files } = createFsStub();
    const svc = createMetadataFsService(fs);
    const result = await svc.writeRetrievedPackage({
        alias: 'dev',
        entries: [
            { fileName: 'classes/Foo.cls', body: 'public class Foo {}' },
            { fileName: 'classes/Foo.cls-meta.xml', body: '<xml/>' },
        ],
    });
    assert.equal(result.status, 'stored');
    assert.equal(result.filesWritten.length, 2);
    assert.ok(files.has('/workspace/orgs/dev/force-app/main/default/classes/Foo.cls'));
    assert.ok(files.has('/workspace/orgs/dev/force-app/main/default/classes/Foo.cls-meta.xml'));
});

test('writeRetrievedPackage: missing alias → skipped_no_alias', async () => {
    const { fs } = createFsStub();
    const svc = createMetadataFsService(fs);
    const result = await svc.writeRetrievedPackage({ alias: '', entries: [] });
    assert.equal(result.status, 'skipped_no_alias');
    assert.deepEqual(result.filesWritten, []);
});

test('writeRetrievedPackage: skips entries with no filename', async () => {
    const { fs, files } = createFsStub();
    const svc = createMetadataFsService(fs);
    const result = await svc.writeRetrievedPackage({
        alias: 'dev',
        entries: [
            { fileName: '', body: 'x' },
            { fileName: 'foo/bar.cls', body: 'y' },
        ],
    });
    assert.equal(result.filesWritten.length, 1);
    assert.ok(files.has('/workspace/orgs/dev/force-app/main/default/foo/bar.cls'));
});

test('writeMetadataRecord (ApexClass): writes source + meta xml', async () => {
    const { fs, files } = createFsStub();
    const svc = createMetadataFsService(fs);
    const result = await svc.writeMetadataRecord({
        alias: 'dev',
        metadataType: 'ApexClass',
        files: [{ body: 'public class Greeter {}', apiVersion: '61.0' }],
        selectedRecord: { Name: 'Greeter' },
    });
    assert.equal(result.status, 'stored');
    assert.equal(result.filesWritten.length, 2);
    const source = files.get('/workspace/orgs/dev/force-app/main/default/classes/Greeter.cls');
    const meta = files.get(
        '/workspace/orgs/dev/force-app/main/default/classes/Greeter.cls-meta.xml'
    );
    assert.equal(source, 'public class Greeter {}');
    assert.match(meta ?? '', /<apiVersion>61\.0<\/apiVersion>/);
    assert.match(meta ?? '', /<ApexClass /);
});

test('writeMetadataRecord: missing alias → skipped_no_alias', async () => {
    const { fs } = createFsStub();
    const svc = createMetadataFsService(fs);
    const result = await svc.writeMetadataRecord({ alias: '', metadataType: 'ApexClass' });
    assert.equal(result.status, 'skipped_no_alias');
});

test('writePackageSnapshot: writes package.xml to manifest/', async () => {
    const { fs, files } = createFsStub();
    const svc = createMetadataFsService(fs);
    const result = await svc.writePackageSnapshot({
        alias: 'dev',
        metadataTypes: ['ApexClass'],
        apiVersion: '63.0',
    });
    assert.equal(result.status, 'stored');
    assert.equal(result.filePath, '/workspace/orgs/dev/manifest/package.xml');
    const contents = files.get('/workspace/orgs/dev/manifest/package.xml');
    assert.match(contents ?? '', /<name>ApexClass<\/name>/);
});
