import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApiTreeItems, getServerUrls } from '../modules/openapi.ts';

const SPEC = {
    info: { title: 'MyAPI', version: '1.0' },
    servers: [{ url: 'https://a.example' }, { url: 'https://b.example' }],
    paths: {
        '/users': {
            get: { summary: 'List users', tags: ['user'] },
            post: { summary: 'Create user' },
        },
        '/users/{id}': {
            get: { operationId: 'getUser' },
            delete: {},
        },
    },
};

test('buildApiTreeItems: returns empty when spec has no paths', () => {
    assert.deepEqual(buildApiTreeItems(null), []);
    assert.deepEqual(buildApiTreeItems(undefined), []);
    assert.deepEqual(buildApiTreeItems({}), []);
    assert.deepEqual(buildApiTreeItems({ info: { title: 'x' } }), []);
});

test('buildApiTreeItems: root uses title (lowercased) as id and carries servers', () => {
    const [root] = buildApiTreeItems(SPEC);
    assert.equal(root.type, 'root');
    assert.equal(root.name, 'MyAPI');
    assert.equal(root.id, 'myapi');
    assert.ok(Array.isArray((root.extra as any)?.servers));
    assert.equal((root.extra as any).servers.length, 2);
});

test('buildApiTreeItems: builds folder tree for nested paths and attaches methods', () => {
    const [root] = buildApiTreeItems(SPEC);
    const users = root.children!.find(c => c.id === '/users');
    assert.ok(users, 'expected /users folder');
    // 2 methods (GET, POST) + 1 child folder (/users/{id})
    const methodChildren = users!.children!.filter(c => c.type === 'method');
    assert.equal(methodChildren.length, 2);
    const getMethod = methodChildren.find(c => c.id === '/users:get');
    assert.ok(getMethod);
    assert.equal(getMethod!.icon, 'api:get');
    assert.ok(getMethod!.keywords!.includes('user'));

    const subFolder = users!.children!.find(c => c.id === '/users/{id}');
    assert.ok(subFolder);
    assert.equal(subFolder!.type, 'folder');
    assert.equal(subFolder!.children!.length, 2); // get + delete
});

test('buildApiTreeItems: ignores non-HTTP methods like parameters/summary on pathItem', () => {
    const spec = {
        info: { title: 'x' },
        paths: {
            '/foo': {
                get: {},
                parameters: [],
                summary: 'ignored',
            },
        },
    };
    const [root] = buildApiTreeItems(spec);
    const foo = root.children![0];
    const methods = foo.children!.filter(c => c.type === 'method');
    assert.equal(methods.length, 1);
    assert.equal(methods[0].id, '/foo:get');
});

test('buildApiTreeItems: synthesises a root name when info.title is missing', () => {
    const spec = { paths: { '/a': { get: {} } } };
    const [root] = buildApiTreeItems(spec);
    assert.equal(root.name, 'API');
    assert.match(root.id, /^[0-9a-f-]+$/);
});

test('getServerUrls: returns list of non-empty urls', () => {
    assert.deepEqual(getServerUrls(SPEC), ['https://a.example', 'https://b.example']);
});

test('getServerUrls: tolerates missing / malformed servers', () => {
    assert.deepEqual(getServerUrls(null), []);
    assert.deepEqual(getServerUrls({}), []);
    assert.deepEqual(getServerUrls({ servers: [{}, { url: '' }, { url: 'x' }] }), ['x']);
});
