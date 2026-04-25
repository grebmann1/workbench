import { createMCPClient, type ListToolsResult, type MCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import LOGGER from 'shared/logger';
import { isChromeExtension } from 'shared/utils';

import { createMcpFetch } from './mcpFetch';
import type { McpServerConfig, McpServerToolConfig, McpToolset } from './mcpTypes';

const MCP_TOOL_PREFIX = 'mcp';

function normalizeToolNamePart(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function getPrefixedMcpToolName(serverId: string, toolName: string) {
    const normalizedServerId = normalizeToolNamePart(serverId) || 'server';
    const normalizedToolName = normalizeToolNamePart(toolName) || 'tool';
    return `${MCP_TOOL_PREFIX}__${normalizedServerId}__${normalizedToolName}`;
}

async function closeClients(clients: MCPClient[]) {
    await Promise.allSettled(clients.map(client => client.close()));
}

function getConfiguredToolMap(server: McpServerConfig) {
    return new Map((server.tools || []).map(tool => [tool.name, tool]));
}

function isToolEnabled(server: McpServerConfig, toolName: string) {
    const configuredTool = getConfiguredToolMap(server).get(toolName);
    return configuredTool?.enabled !== false;
}

function mergeDiscoveredTools(
    server: McpServerConfig,
    listToolsResult: ListToolsResult
): McpServerToolConfig[] {
    const configuredTools = getConfiguredToolMap(server);
    return (listToolsResult.tools || [])
        .filter(tool => typeof tool.name === 'string' && tool.name.trim())
        .map(tool => {
            const existing = configuredTools.get(tool.name);
            return {
                name: tool.name,
                enabled: existing?.enabled !== false,
                description: tool.description || existing?.description,
                inputSchema: tool.inputSchema || existing?.inputSchema,
            };
        });
}

async function createClient(server: McpServerConfig) {
    if (server.transport === 'sse' && isChromeExtension()) {
        throw new Error(
            'SSE MCP transport is not supported through the Chrome extension proxy. Use HTTP transport for extension-hosted MCP servers.'
        );
    }
    return await createMCPClient({
        transport: {
            type: server.transport || 'http',
            url: server.url,
            headers: server.headers || {},
            redirect: 'error',
            fetch: createMcpFetch(),
        },
        name: `sf-toolkit-${server.id}`,
    });
}

export async function discoverMcpServerTools(server: McpServerConfig): Promise<McpServerConfig> {
    let client: MCPClient | null = null;
    try {
        client = await createClient(server);
        const listToolsResult = await client.listTools();
        return {
            ...server,
            tools: mergeDiscoveredTools(server, listToolsResult),
            lastToolRefreshAt: new Date().toISOString(),
            lastConnectionStatus: 'connected',
            lastConnectionError: undefined,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            ...server,
            lastConnectionStatus: 'error',
            lastConnectionError: message,
        };
    } finally {
        if (client) {
            await client.close();
        }
    }
}

export async function createMcpToolset(configs: McpServerConfig[] = []): Promise<McpToolset> {
    const clients: MCPClient[] = [];
    const tools: ToolSet = {};
    const errors: Array<{ serverId: string; message: string }> = [];
    const enabledServers = configs.filter(server => server?.enabled !== false && server.url);

    await Promise.all(
        enabledServers.map(async server => {
            try {
                const client = await createClient(server);
                clients.push(client);
                const serverTools = await client.tools();
                Object.entries(serverTools).forEach(([toolName, toolDefinition]) => {
                    if (!isToolEnabled(server, toolName)) {
                        return;
                    }
                    tools[getPrefixedMcpToolName(server.id, toolName)] =
                        toolDefinition as ToolSet[string];
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                LOGGER.warn('[agent:mcp] failed to connect to MCP server', {
                    serverId: server.id,
                    serverName: server.name,
                    message,
                });
                errors.push({ serverId: server.id, message });
            }
        })
    );

    return {
        tools,
        errors,
        close: () => closeClients(clients),
    };
}
