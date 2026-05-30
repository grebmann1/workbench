// soqlQuery.test.ts
// Module: shared/soqlQuery/soqlQuery
// Runner: node:test + node:assert/strict via `node --experimental-strip-types --test`
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { asSalesforceId, escapeSoqlLiteral, runSoqlQuery, type SoqlOptions } from '../soqlQuery.ts';
import type { ConnectorLike } from '../../types/connector.ts';

/* -------------------------------------------------------------------------- */
/*  asSalesforceId                                                             */
/* -------------------------------------------------------------------------- */

test('asSalesforceId accepts a 15-char alphanumeric Id', () => {
    const id = '001AB000001abcD';
    assert.equal(id.length, 15);
    const branded = asSalesforceId(id);
    assert.equal(branded, id);
});

test('asSalesforceId accepts an 18-char alphanumeric Id', () => {
    const id = '001AB000001abcDEAA';
    assert.equal(id.length, 18);
    const branded = asSalesforceId(id);
    assert.equal(branded, id);
});

test('asSalesforceId rejects a short string', () => {
    assert.throws(() => asSalesforceId('foo'), /Invalid Salesforce Id/);
});

test('asSalesforceId rejects an Id containing a special character', () => {
    // 15 chars but with a `!` — should fail the alphanumeric check.
    assert.throws(() => asSalesforceId('001AB000001abc!'), /Invalid Salesforce Id/);
});

test('asSalesforceId rejects 16-char and 17-char strings (between 15 and 18)', () => {
    assert.throws(() => asSalesforceId('001AB000001abcDE'), /Invalid Salesforce Id/);
    assert.throws(() => asSalesforceId('001AB000001abcDEA'), /Invalid Salesforce Id/);
});

test('asSalesforceId rejects empty string', () => {
    assert.throws(() => asSalesforceId(''), /Invalid Salesforce Id/);
});

/* -------------------------------------------------------------------------- */
/*  escapeSoqlLiteral                                                          */
/* -------------------------------------------------------------------------- */

test("escapeSoqlLiteral escapes a single quote in O'Brien", () => {
    assert.equal(escapeSoqlLiteral("O'Brien"), "O\\'Brien");
});

test('escapeSoqlLiteral escapes backslashes', () => {
    assert.equal(escapeSoqlLiteral('a\\b'), 'a\\\\b');
});

test('escapeSoqlLiteral escapes backslash before quote correctly (no double-escape)', () => {
    // Input: `a\'b` (literal backslash then quote). Output should be `a\\\'b`
    // — backslash → `\\`, quote → `\'` — total of 4 backslash-chars + `b` -> "a\\\\\\'b"
    assert.equal(escapeSoqlLiteral("a\\'b"), "a\\\\\\'b");
});

test('escapeSoqlLiteral leaves a plain string untouched', () => {
    assert.equal(escapeSoqlLiteral('hello world'), 'hello world');
});

test('escapeSoqlLiteral rejects strings containing \\n', () => {
    assert.throws(() => escapeSoqlLiteral('a\nb'), /newline/);
});

test('escapeSoqlLiteral rejects strings containing \\r', () => {
    assert.throws(() => escapeSoqlLiteral('a\rb'), /newline/);
});

/* -------------------------------------------------------------------------- */
/*  runSoqlQuery — mocked connector                                            */
/* -------------------------------------------------------------------------- */

type CallLog = {
    api: 'tooling' | 'data';
    soql: string;
    runOptions: { responseTarget: string; autoFetch: boolean; maxFetch: number };
};

function makeMockConnector(records: Record<string, unknown>[]): {
    connector: ConnectorLike;
    calls: CallLog[];
} {
    const calls: CallLog[] = [];
    const makeQuery = (api: 'tooling' | 'data') => (soql: string) => ({
        run: async (runOptions: {
            responseTarget: 'Records' | 'SingleRecord' | 'QueryResult';
            autoFetch: boolean;
            maxFetch: number;
        }) => {
            calls.push({ api, soql, runOptions });
            return records;
        },
    });
    const connector: ConnectorLike = {
        conn: {
            query: makeQuery('data'),
            tooling: { query: makeQuery('tooling') },
        },
        configuration: {},
    } as unknown as ConnectorLike;
    return { connector, calls };
}

test('runSoqlQuery returns the records array (default tooling mode)', async () => {
    const { connector } = makeMockConnector([{ Id: '001x', Name: 'Acme' }]);
    const records = await runSoqlQuery<{ Id: string; Name: string }>(
        connector,
        'SELECT Id, Name FROM Account'
    );
    assert.deepEqual(records, [{ Id: '001x', Name: 'Acme' }]);
});

test('runSoqlQuery in default mode hits conn.tooling.query', async () => {
    const { connector, calls } = makeMockConnector([{ Id: 'a' }]);
    await runSoqlQuery(connector, 'SELECT Id FROM BotDefinition');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].api, 'tooling');
});

test('runSoqlQuery with mode "data" hits conn.query, not conn.tooling.query', async () => {
    const { connector, calls } = makeMockConnector([{ Id: 'a' }]);
    await runSoqlQuery(connector, 'SELECT Id FROM Account', { mode: 'data' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].api, 'data');
});

test('runSoqlQuery with default paging passes autoFetch=false, maxFetch=200', async () => {
    const { connector, calls } = makeMockConnector([]);
    await runSoqlQuery(connector, 'SELECT Id FROM Account');
    assert.equal(calls[0].runOptions.autoFetch, false);
    assert.equal(calls[0].runOptions.maxFetch, 200);
    assert.equal(calls[0].runOptions.responseTarget, 'Records');
});

test('runSoqlQuery with explicit first-page paging respects cap', async () => {
    const { connector, calls } = makeMockConnector([]);
    await runSoqlQuery(connector, 'SELECT Id FROM Account', {
        paging: { mode: 'first-page', cap: 50 },
    });
    assert.equal(calls[0].runOptions.autoFetch, false);
    assert.equal(calls[0].runOptions.maxFetch, 50);
});

test('runSoqlQuery with auto-fetch + LIMIT proceeds and passes autoFetch=true', async () => {
    const { connector, calls } = makeMockConnector([{ Id: 'x' }]);
    const opts: SoqlOptions = { paging: { mode: 'auto-fetch', cap: 1000 } };
    const records = await runSoqlQuery(connector, 'SELECT Id FROM Account LIMIT 50', opts);
    assert.deepEqual(records, [{ Id: 'x' }]);
    assert.equal(calls[0].runOptions.autoFetch, true);
    assert.equal(calls[0].runOptions.maxFetch, 1000);
});

test('runSoqlQuery with auto-fetch and NO LIMIT throws in dev', async () => {
    const { connector } = makeMockConnector([]);
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
        await assert.rejects(
            runSoqlQuery(connector, 'SELECT Id FROM Account', {
                paging: { mode: 'auto-fetch', cap: 1000 },
            }),
            /LIMIT clause/
        );
    } finally {
        process.env.NODE_ENV = prev;
    }
});

test('runSoqlQuery with auto-fetch and lowercase "limit" passes (case-insensitive)', async () => {
    const { connector, calls } = makeMockConnector([]);
    await runSoqlQuery(connector, 'select Id from Account limit 10', {
        paging: { mode: 'auto-fetch', cap: 100 },
    });
    assert.equal(calls[0].runOptions.autoFetch, true);
});

test('runSoqlQuery throws when connector is missing', async () => {
    await assert.rejects(
        runSoqlQuery(null as unknown as ConnectorLike, 'SELECT Id FROM Account'),
        /connector is missing/
    );
});

test('runSoqlQuery throws when connector.conn is missing', async () => {
    const connector = { conn: null, configuration: {} } as unknown as ConnectorLike;
    await assert.rejects(runSoqlQuery(connector, 'SELECT Id FROM Account'), /conn is missing/);
});

test('runSoqlQuery throws when tooling API is missing on the connection', async () => {
    const connector = {
        conn: {} as Record<string, unknown>,
        configuration: {},
    } as unknown as ConnectorLike;
    await assert.rejects(
        runSoqlQuery(connector, 'SELECT Id FROM BotDefinition'),
        /Tooling API is not available/
    );
});

test('runSoqlQuery throws when data API is missing on the connection', async () => {
    const connector = {
        conn: {} as Record<string, unknown>,
        configuration: {},
    } as unknown as ConnectorLike;
    await assert.rejects(
        runSoqlQuery(connector, 'SELECT Id FROM Account', { mode: 'data' }),
        /Data API is not available/
    );
});

test('runSoqlQuery throws on empty SOQL', async () => {
    const { connector } = makeMockConnector([]);
    await assert.rejects(runSoqlQuery(connector, ''), /non-empty string/);
    await assert.rejects(runSoqlQuery(connector, '   '), /non-empty string/);
});

test('runSoqlQuery returns empty array when run resolves to null', async () => {
    const connector = {
        conn: {
            tooling: {
                query: () => ({ run: async () => null }),
            },
        },
        configuration: {},
    } as unknown as ConnectorLike;
    const records = await runSoqlQuery(connector, 'SELECT Id FROM Account');
    assert.deepEqual(records, []);
});
