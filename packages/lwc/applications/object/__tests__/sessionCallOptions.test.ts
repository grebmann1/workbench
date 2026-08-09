import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cacheManager, CACHE_SESSION_CONFIG } from 'shared/cacheManager';

import { ensureSessionClientCallOption } from '../sessionCallOptions.ts';

// cacheManager is a real singleton (no DI point in the function under test),
// so we monkey-patch loadOrgData directly for the duration of each test and
// restore it afterward.
const withLoadOrgData = async (impl: (...args: unknown[]) => unknown, run: () => Promise<void>) => {
    const original = cacheManager.loadOrgData;
    let calls = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cacheManager as any).loadOrgData = async (...args: unknown[]) => {
        calls++;
        return impl(...args);
    };
    try {
        await run();
    } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (cacheManager as any).loadOrgData = original;
    }
    return calls;
};

test('no-op when connector is null/undefined', async () => {
    const calls = await withLoadOrgData(
        () => {
            throw new Error('should not be called');
        },
        async () => {
            await ensureSessionClientCallOption(null);
            await ensureSessionClientCallOption(undefined);
        }
    );
    assert.equal(calls, 0);
});

test('no-op when connector.conn is missing', async () => {
    const connector = { configuration: { alias: 'myOrg' } };
    const calls = await withLoadOrgData(
        () => {
            throw new Error('should not be called');
        },
        async () => {
            await ensureSessionClientCallOption(connector);
        }
    );
    assert.equal(calls, 0);
});

test('no-op when configuration.alias is missing or blank', async () => {
    const connectorNoAlias = { conn: { _callOptions: {} }, configuration: {} };
    const connectorBlankAlias = { conn: { _callOptions: {} }, configuration: { alias: '   ' } };
    const calls = await withLoadOrgData(
        () => {
            throw new Error('should not be called');
        },
        async () => {
            await ensureSessionClientCallOption(connectorNoAlias);
            await ensureSessionClientCallOption(connectorBlankAlias);
        }
    );
    assert.equal(calls, 0);
});

test('no-op when connection already has a non-empty client id', async () => {
    const connection = { _callOptions: { client: 'existing-client', other: 'keep-me' } };
    const connector = { conn: connection, configuration: { alias: 'myOrg' } };
    const calls = await withLoadOrgData(
        () => {
            throw new Error('should not be called');
        },
        async () => {
            await ensureSessionClientCallOption(connector);
        }
    );
    assert.equal(calls, 0);
    assert.deepEqual(connection._callOptions, { client: 'existing-client', other: 'keep-me' });
});

test('happy path: merges client id from cacheManager, preserving existing _callOptions keys', async () => {
    const connection: { _callOptions?: Record<string, unknown> } = {
        _callOptions: { other: 'keep-me' },
    };
    const connector = { conn: connection, configuration: { alias: 'myOrg' } };

    let receivedArgs: unknown[] = [];
    const calls = await withLoadOrgData(
        (...args: unknown[]) => {
            receivedArgs = args;
            return { [CACHE_SESSION_CONFIG.CLIENT_ID.key]: 'session-client-123' };
        },
        async () => {
            await ensureSessionClientCallOption(connector);
        }
    );

    assert.equal(calls, 1);
    assert.deepEqual(receivedArgs, ['myOrg', 'session_settings']);
    assert.deepEqual(connection._callOptions, {
        other: 'keep-me',
        client: 'session-client-123',
    });
});

test('happy path: works even when connection has no pre-existing _callOptions', async () => {
    const connection: { _callOptions?: Record<string, unknown> } = {};
    const connector = { conn: connection, configuration: { alias: 'myOrg' } };

    await withLoadOrgData(
        () => ({ [CACHE_SESSION_CONFIG.CLIENT_ID.key]: 'session-client-456' }),
        async () => {
            await ensureSessionClientCallOption(connector);
        }
    );

    assert.deepEqual(connection._callOptions, { client: 'session-client-456' });
});

test('no mutation when cacheManager returns no session settings', async () => {
    const connection: { _callOptions?: Record<string, unknown> } = {
        _callOptions: { other: 'keep-me' },
    };
    const connector = { conn: connection, configuration: { alias: 'myOrg' } };

    await withLoadOrgData(
        () => undefined,
        async () => {
            await ensureSessionClientCallOption(connector);
        }
    );

    assert.deepEqual(connection._callOptions, { other: 'keep-me' });
});

test('no mutation when cacheManager returns an empty/blank client id', async () => {
    const connection: { _callOptions?: Record<string, unknown> } = {
        _callOptions: { other: 'keep-me' },
    };
    const connector = { conn: connection, configuration: { alias: 'myOrg' } };

    await withLoadOrgData(
        () => ({ [CACHE_SESSION_CONFIG.CLIENT_ID.key]: '   ' }),
        async () => {
            await ensureSessionClientCallOption(connector);
        }
    );

    assert.deepEqual(connection._callOptions, { other: 'keep-me' });
});

test('no mutation when cacheManager returns a non-string client id', async () => {
    const connection: { _callOptions?: Record<string, unknown> } = {
        _callOptions: { other: 'keep-me' },
    };
    const connector = { conn: connection, configuration: { alias: 'myOrg' } };

    await withLoadOrgData(
        () => ({ [CACHE_SESSION_CONFIG.CLIENT_ID.key]: 12345 }),
        async () => {
            await ensureSessionClientCallOption(connector);
        }
    );

    assert.deepEqual(connection._callOptions, { other: 'keep-me' });
});
