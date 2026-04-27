import assert from 'node:assert/strict';
import test from 'node:test';

import {
    formatMcpServersJson,
    normalizeMcpServerConfigs,
    parseMcpServersJson,
} from '../mcpJsonParser.ts';

test('parseMcpServersJson keeps tool enablement metadata from JSON config', () => {
    const { servers, errors } = parseMcpServersJson(
        JSON.stringify({
            mcpServers: {
                workspace: {
                    url: 'https://example.com/mcp',
                    transport: 'http',
                    tools: {
                        search_drive: {
                            enabled: false,
                            description: 'Search Drive documents',
                        },
                    },
                },
            },
        })
    );

    assert.deepEqual(errors, []);
    assert.equal(servers[0].tools?.[0].name, 'search_drive');
    assert.equal(servers[0].tools?.[0].enabled, false);
    assert.equal(servers[0].tools?.[0].description, 'Search Drive documents');
});

test('normalizeMcpServerConfigs preserves refreshed discovered tools', () => {
    const [server] = normalizeMcpServerConfigs([
        {
            id: 'workspace',
            name: 'Workspace',
            url: 'https://example.com/mcp',
            transport: 'http',
            tools: [
                {
                    name: 'search_drive',
                    enabled: false,
                    description: 'Search Drive',
                    inputSchema: { type: 'object' },
                },
            ],
            lastToolRefreshAt: '2026-04-25T00:00:00.000Z',
        },
    ]);

    assert.equal(server.tools?.[0].name, 'search_drive');
    assert.equal(server.tools?.[0].enabled, false);
    assert.deepEqual(server.tools?.[0].inputSchema, { type: 'object' });
    assert.equal(server.lastToolRefreshAt, '2026-04-25T00:00:00.000Z');
});

test('formatMcpServersJson round-trips tool metadata', () => {
    const text = formatMcpServersJson([
        {
            id: 'workspace',
            name: 'Workspace',
            url: 'https://example.com/mcp',
            transport: 'http',
            enabled: true,
            tools: [{ name: 'search_drive', enabled: false }],
        },
    ]);

    const { servers } = parseMcpServersJson(text);
    assert.equal(servers[0].tools?.[0].name, 'search_drive');
    assert.equal(servers[0].tools?.[0].enabled, false);
});

test('parseMcpServersJson reports malformed server entries without throwing', () => {
    const { servers, errors } = parseMcpServersJson(
        JSON.stringify({
            servers: [null, 'bad-server'],
        })
    );

    assert.deepEqual(servers, []);
    assert.equal(errors.length, 2);
    assert.match(errors[0], /must be an object/);
});
