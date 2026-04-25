#!/usr/bin/env node

import assert from 'node:assert/strict';

import { createMCPClient } from '@ai-sdk/mcp';

import { startBasicMcpServer } from './basic-mcp-server.mjs';

function getText(result) {
    const content = Array.isArray(result?.content) ? result.content : [];
    return content
        .filter(part => part?.type === 'text')
        .map(part => part.text)
        .join('\n');
}

const runtime = await startBasicMcpServer({ port: 0 });
let client;

try {
    client = await createMCPClient({
        transport: {
            type: 'http',
            url: runtime.url,
            redirect: 'error',
        },
        name: 'sf-toolkit-basic-mcp-verifier',
    });

    const listToolsResult = await client.listTools();
    const toolNames = listToolsResult.tools.map(tool => tool.name).sort();
    assert.deepEqual(toolNames, ['add_numbers', 'echo', 'get_test_context']);

    const tools = await client.tools();
    assert.equal(typeof tools.echo?.execute, 'function');
    assert.equal(typeof tools.add_numbers?.execute, 'function');

    const echoResult = await tools.echo.execute(
        { message: 'hello from verifier' },
        { toolCallId: 'verify-echo', messages: [] }
    );
    assert.match(getText(echoResult), /hello from verifier/);

    const addResult = await tools.add_numbers.execute(
        { a: 2, b: 5 },
        { toolCallId: 'verify-add', messages: [] }
    );
    assert.match(getText(addResult), /2 \+ 5 = 7/);

    console.log(`Verified basic MCP server at ${runtime.url}`);
    console.log(`Discovered tools: ${toolNames.join(', ')}`);
} finally {
    if (client) {
        await client.close();
    }
    await runtime.close();
}
