import type {
    McpParseResult,
    McpServerConfig,
    McpServerToolConfig,
    McpTransportKind,
} from './mcpTypes';

const DEFAULT_TRANSPORT: McpTransportKind = 'http';
const SUPPORTED_TRANSPORTS = new Set<McpTransportKind>(['http', 'sse']);

function slugify(value: string) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'mcp-server';
}

function normalizeTransport(value: unknown): McpTransportKind | null {
    if (value == null || value === '') {
        return DEFAULT_TRANSPORT;
    }
    const transport = String(value).toLowerCase();
    return SUPPORTED_TRANSPORTS.has(transport as McpTransportKind)
        ? (transport as McpTransportKind)
        : null;
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const headers = Object.entries(value).reduce<Record<string, string>>(
        (acc, [key, headerValue]) => {
            if (typeof key === 'string' && key.trim() && headerValue != null) {
                acc[key.trim()] = String(headerValue);
            }
            return acc;
        },
        {}
    );
    return Object.keys(headers).length ? headers : undefined;
}

function normalizeTools(value: unknown): McpServerToolConfig[] | undefined {
    if (!value) {
        return undefined;
    }
    const entries = Array.isArray(value)
        ? value.map((tool, index): [string, unknown] => [
              typeof tool?.name === 'string' ? tool.name : `tool-${index + 1}`,
              tool,
          ])
        : typeof value === 'object'
          ? Object.entries(value as Record<string, unknown>)
          : [];

    const tools = entries.reduce<McpServerToolConfig[]>((acc, [entryName, rawTool]) => {
        if (!entryName || !rawTool || typeof rawTool !== 'object' || Array.isArray(rawTool)) {
            return acc;
        }
        const record = rawTool as Record<string, unknown>;
        const name =
            typeof record.name === 'string' && record.name.trim()
                ? record.name.trim()
                : entryName.trim();
        if (!name) {
            return acc;
        }
        acc.push({
            name,
            enabled: record.enabled !== false,
            description:
                typeof record.description === 'string' && record.description.trim()
                    ? record.description.trim()
                    : undefined,
            inputSchema: record.inputSchema,
        });
        return acc;
    }, []);
    return tools.length ? tools : undefined;
}

function normalizeStatus(value: unknown): McpServerConfig['lastConnectionStatus'] | undefined {
    return value === 'connected' || value === 'error' || value === 'unknown' ? value : undefined;
}

function readServerEntries(parsed: unknown): Array<[string, Record<string, unknown>]> {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return [];
    }
    const root = parsed as Record<string, unknown>;
    const mcpServers = root.mcpServers;
    if (mcpServers && typeof mcpServers === 'object' && !Array.isArray(mcpServers)) {
        return Object.entries(mcpServers as Record<string, Record<string, unknown>>);
    }
    if (Array.isArray(root.servers)) {
        return root.servers.map((server, index) => [
            typeof server?.name === 'string' ? server.name : `server-${index + 1}`,
            server as Record<string, unknown>,
        ]);
    }
    return [];
}

export function normalizeMcpServerConfigs(value: unknown): McpServerConfig[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const usedIds = new Set<string>();
    return value.reduce<McpServerConfig[]>((servers, server, index) => {
        if (!server || typeof server !== 'object' || Array.isArray(server)) {
            return servers;
        }
        const record = server as Record<string, unknown>;
        const name =
            typeof record.name === 'string' && record.name.trim()
                ? record.name.trim()
                : `MCP Server ${index + 1}`;
        const url = typeof record.url === 'string' ? record.url.trim() : '';
        const transport = normalizeTransport(record.transport);
        if (!url || !transport) {
            return servers;
        }
        let id =
            typeof record.id === 'string' && record.id.trim() ? slugify(record.id) : slugify(name);
        while (usedIds.has(id)) {
            id = `${id}-${index + 1}`;
        }
        usedIds.add(id);
        servers.push({
            id,
            name,
            url,
            transport,
            headers: normalizeHeaders(record.headers),
            enabled: record.enabled !== false,
            tools: normalizeTools(record.tools),
            lastToolRefreshAt:
                typeof record.lastToolRefreshAt === 'string' ? record.lastToolRefreshAt : undefined,
            lastConnectionStatus: normalizeStatus(record.lastConnectionStatus),
            lastConnectionError:
                typeof record.lastConnectionError === 'string'
                    ? record.lastConnectionError
                    : undefined,
        });
        return servers;
    }, []);
}

export function parseMcpServersJson(text: string): McpParseResult {
    const errors: string[] = [];
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw) {
        return { servers: [], errors };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return {
            servers: [],
            errors: [error instanceof Error ? error.message : 'Invalid JSON'],
        };
    }

    const entries = readServerEntries(parsed);
    if (!entries.length) {
        return {
            servers: [],
            errors: ['Expected a JSON object with an "mcpServers" object or a "servers" array.'],
        };
    }

    const usedIds = new Set<string>();
    const servers: McpServerConfig[] = [];
    entries.forEach(([entryName, config], index) => {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            errors.push(`${entryName || `Server ${index + 1}`}: server config must be an object`);
            return;
        }
        const name =
            typeof config.name === 'string' && config.name.trim()
                ? config.name.trim()
                : entryName.trim();
        const url = typeof config.url === 'string' ? config.url.trim() : '';
        const transport = normalizeTransport(config.transport);
        if (!url) {
            errors.push(`${name || `Server ${index + 1}`}: missing url`);
            return;
        }
        if (!transport) {
            errors.push(`${name}: transport must be "http" or "sse"`);
            return;
        }
        let id =
            typeof config.id === 'string' && config.id.trim() ? slugify(config.id) : slugify(name);
        while (usedIds.has(id)) {
            id = `${id}-${index + 1}`;
        }
        usedIds.add(id);
        servers.push({
            id,
            name,
            url,
            transport,
            headers: normalizeHeaders(config.headers),
            enabled: config.enabled !== false,
            tools: normalizeTools(config.tools),
            lastToolRefreshAt:
                typeof config.lastToolRefreshAt === 'string' ? config.lastToolRefreshAt : undefined,
            lastConnectionStatus: normalizeStatus(config.lastConnectionStatus),
            lastConnectionError:
                typeof config.lastConnectionError === 'string'
                    ? config.lastConnectionError
                    : undefined,
        });
    });

    return { servers, errors };
}

export function formatMcpServersJson(servers: McpServerConfig[]) {
    const normalizedServers = normalizeMcpServerConfigs(servers);
    return JSON.stringify(
        {
            mcpServers: normalizedServers.reduce<Record<string, Omit<McpServerConfig, 'id'>>>(
                (acc, server) => {
                    const { id: _id, ...config } = server;
                    acc[server.id] = config;
                    return acc;
                },
                {}
            ),
        },
        null,
        2
    );
}
