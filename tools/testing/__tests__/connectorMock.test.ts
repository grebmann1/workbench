import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createConnectionMock,
    createConnectorMock,
    withConnectionOverride,
} from '../connectorMock.ts';

test('createConnectionMock: default query returns empty paginated result', async () => {
    const conn = createConnectionMock();
    const result = await conn.query('SELECT Id FROM Account');
    assert.deepEqual(result, { done: true, totalSize: 0, records: [] });
});

test('createConnectionMock: custom query override is honoured', async () => {
    const conn = createConnectionMock({
        query: soql => ({
            done: true,
            totalSize: 1,
            records: [{ Id: '001', Name: soql }],
        }),
    });
    const result = await conn.query('SELECT Id FROM Foo');
    assert.equal(result.totalSize, 1);
    assert.equal(result.records[0].Name, 'SELECT Id FROM Foo');
});

test('createConnectionMock: identity uses defaults then custom override', async () => {
    const conn1 = createConnectionMock();
    const id1 = await conn1.identity();
    assert.equal(id1.username, 'test@example.com');

    const conn2 = createConnectionMock({
        identity: async () => ({
            user_id: 'abc',
            username: 'other@example.com',
            organization_id: 'orgZ',
        }),
    });
    const id2 = await conn2.identity();
    assert.equal(id2.username, 'other@example.com');
});

test('createConnectionMock: describeGlobal + sobject describe defaults', async () => {
    const conn = createConnectionMock();
    const global = await conn.describeGlobal();
    assert.deepEqual(global, { sobjects: [] });
    const described = await conn.sobject('Account').describe();
    assert.equal(described.name, 'Account');
    assert.deepEqual(described.fields, []);
});

test('createConnectionMock: tooling defaults and overrides', async () => {
    const conn = createConnectionMock();
    const def = await conn.tooling.query('SELECT Id FROM ApexClass');
    assert.equal(def.totalSize, 0);

    const overridden = createConnectionMock({
        tooling: {
            query: () => ({ done: true, totalSize: 2, records: [{}, {}] }),
        },
    });
    const out = await overridden.tooling.query('SELECT Id FROM ApexClass');
    assert.equal(out.totalSize, 2);
});

test('createConnectionMock: metadata defaults and overrides', async () => {
    const conn = createConnectionMock();
    assert.deepEqual(await conn.metadata.list([], '60.0'), []);
    assert.deepEqual(await conn.metadata.describe('60.0'), {});

    const customized = createConnectionMock({
        metadata: {
            list: async queries => queries.map((_q, i) => ({ idx: i })),
        },
    });
    const listed = await customized.metadata.list(['a', 'b']);
    assert.deepEqual(listed, [{ idx: 0 }, { idx: 1 }]);
});

test('createConnectionMock: exposes default instance/token/version and oauth2 refresh', async () => {
    const conn = createConnectionMock();
    assert.equal(conn.instanceUrl, 'https://test.my.salesforce.com');
    assert.equal(conn.accessToken, 'mock-access-token');
    assert.equal(conn.version, '63.0');
    const refreshed = await conn.oauth2.refreshToken();
    assert.equal(refreshed.access_token, 'refreshed-token');
    assert.equal(refreshed.instance_url, 'https://test.my.salesforce.com');
});

test('createConnectorMock: wraps a connection and derives configuration', () => {
    const connector = createConnectorMock();
    assert.equal(connector.alias, 'test-org');
    assert.equal(connector.conn.instanceUrl, 'https://test.my.salesforce.com');
    assert.equal(connector.configuration.alias, 'test-org');
    assert.equal(connector.configuration.instanceUrl, 'https://test.my.salesforce.com');
    assert.equal(connector.configuration.accessToken, 'mock-access-token');
});

test('createConnectorMock: extra configuration keys override defaults', () => {
    const connector = createConnectorMock({
        alias: 'uat',
        configuration: { loginUrl: 'https://login.salesforce.com', accessToken: 'custom' },
    });
    assert.equal(connector.alias, 'uat');
    assert.equal(connector.configuration.alias, 'uat');
    assert.equal(connector.configuration.loginUrl, 'https://login.salesforce.com');
    // Later-spread override wins.
    assert.equal(connector.configuration.accessToken, 'custom');
});

test('createConnectorMock: frontDoorUrl builds a session redirect', () => {
    const connector = createConnectorMock();
    const url = connector.frontDoorUrl();
    assert.equal(
        url,
        'https://test.my.salesforce.com/secur/frontdoor.jsp?sid=mock-access-token'
    );
});

test('withConnectionOverride: mutates a single method of an existing connection', async () => {
    const conn = createConnectionMock();
    withConnectionOverride(conn, 'query', async (soql: string) => ({
        done: true,
        totalSize: 1,
        records: [{ Id: soql }],
    }));
    const out = await conn.query('X');
    assert.equal(out.records[0].Id, 'X');
});
