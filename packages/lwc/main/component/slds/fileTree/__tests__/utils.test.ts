import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeForSearch, searchDirectories } from '../utils.ts';

test('normalizeForSearch: lowercases + collapses spaces/underscores', () => {
    assert.equal(normalizeForSearch('HELLO_WORLD'), 'hello world');
    assert.equal(normalizeForSearch('  Foo   Bar  '), 'foo bar');
    assert.equal(normalizeForSearch('Apex_Class__Name'), 'apex class name');
});

test('normalizeForSearch: non-string → empty string', () => {
    assert.equal(normalizeForSearch(null as any), '');
    assert.equal(normalizeForSearch(42 as any), '');
    assert.equal(normalizeForSearch(undefined as any), '');
});

test('searchDirectories: empty term returns empty result', () => {
    const tree = [{ id: '1', name: 'Foo' }];
    const out = searchDirectories('', tree);
    assert.deepEqual(out.expandedMap, {});
    assert.equal(out.matchedIds.size, 0);
});

test('searchDirectories: below minSearchLength returns empty', () => {
    const tree = [{ id: '1', name: 'Foo' }];
    const out = searchDirectories('fo', tree, {}, { minSearchLength: 3 });
    assert.equal(out.matchedIds.size, 0);
});

test('searchDirectories: matches leaf and expands ancestors', () => {
    const tree = [
        {
            id: 'folder1',
            name: 'Folder',
            children: [
                { id: 'a', name: 'apexThingy' },
                { id: 'b', name: 'other' },
            ],
        },
    ];
    const out = searchDirectories('apex', tree);
    assert.ok(out.matchedIds.has('a'));
    assert.equal(out.expandedMap.folder1, true);
});

test('searchDirectories: includeFoldersInResults=false excludes folder matches', () => {
    const tree = [
        {
            id: 'folder1',
            name: 'apexStuff',
            children: [{ id: 'leaf', name: 'unrelated' }],
        },
    ];
    const withFolders = searchDirectories('apex', tree);
    assert.ok(withFolders.matchedIds.has('folder1'));

    const withoutFolders = searchDirectories(
        'apex',
        tree,
        {},
        {
            includeFoldersInResults: false,
        }
    );
    assert.ok(!withoutFolders.matchedIds.has('folder1'));
});

test('searchDirectories: underscore/space equivalence in search', () => {
    const tree = [{ id: 'x', name: 'apex_class_name' }];
    const out = searchDirectories('apex class', tree);
    assert.ok(out.matchedIds.has('x'));
});
