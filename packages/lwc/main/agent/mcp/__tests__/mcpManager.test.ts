import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getPrefixedMcpToolName } from '../mcpManager.ts';

test('getPrefixedMcpToolName: produces mcp__<server>__<tool> slug', () => {
    assert.equal(getPrefixedMcpToolName('my-server', 'hello'), 'mcp__my_server__hello');
});

test('getPrefixedMcpToolName: lowercases and replaces invalid chars with underscore', () => {
    assert.equal(getPrefixedMcpToolName('MyServer', 'Tool.Name-V2'), 'mcp__myserver__tool_name_v2');
});

test('getPrefixedMcpToolName: collapses and trims outer underscores', () => {
    assert.equal(getPrefixedMcpToolName('  foo!!! ', 'bar@@baz'), 'mcp__foo__bar_baz');
});

test('getPrefixedMcpToolName: empty server/tool defaults to "server"/"tool"', () => {
    assert.equal(getPrefixedMcpToolName('', ''), 'mcp__server__tool');
    assert.equal(getPrefixedMcpToolName('!!!', '...'), 'mcp__server__tool');
});

test('getPrefixedMcpToolName: preserves digits + underscores unchanged', () => {
    assert.equal(getPrefixedMcpToolName('srv_01', 'tool_2'), 'mcp__srv_01__tool_2');
});
