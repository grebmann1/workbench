import type { ToolSet } from 'ai';

export type McpTransportKind = 'http' | 'sse';

export type McpServerToolConfig = {
    name: string;
    enabled: boolean;
    description?: string;
    inputSchema?: unknown;
};

export type McpServerConfig = {
    id: string;
    name: string;
    url: string;
    transport: McpTransportKind;
    headers?: Record<string, string>;
    enabled: boolean;
    tools?: McpServerToolConfig[];
    lastToolRefreshAt?: string;
    lastConnectionStatus?: 'unknown' | 'connected' | 'error';
    lastConnectionError?: string;
};

export type McpParseResult = {
    servers: McpServerConfig[];
    errors: string[];
};

export type McpToolset = {
    tools: ToolSet;
    errors: Array<{ serverId: string; message: string }>;
    close: () => Promise<void>;
};
