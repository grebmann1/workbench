#!/usr/bin/env node

import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';

export const BASIC_MCP_PATH = '/mcp';
export const DEFAULT_BASIC_MCP_PORT = 3999;

function createBasicMcpServer() {
    const server = new McpServer(
        {
            name: 'sf-toolkit-basic-test-mcp',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    server.registerTool(
        'echo',
        {
            title: 'Echo',
            description: 'Returns the provided message. Useful for verifying MCP tool calls.',
            inputSchema: {
                message: z.string().describe('Message to echo back'),
            },
        },
        async ({ message }) => ({
            content: [{ type: 'text', text: `echo: ${message}` }],
        })
    );

    server.registerTool(
        'add_numbers',
        {
            title: 'Add Numbers',
            description: 'Adds two numbers and returns the sum.',
            inputSchema: {
                a: z.number().describe('First number'),
                b: z.number().describe('Second number'),
            },
        },
        async ({ a, b }) => ({
            content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
        })
    );

    server.registerTool(
        'get_test_context',
        {
            title: 'Get Test Context',
            description: 'Returns static metadata proving the local MCP test server is reachable.',
            inputSchema: {},
        },
        async () => ({
            content: [
                {
                    type: 'text',
                    text: 'SF Toolkit basic MCP test server is running.',
                },
            ],
        })
    );

    return server;
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
}

export function createBasicMcpApp() {
    const app = createMcpExpressApp();

    app.use((req, res, next) => {
        setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }
        next();
    });

    app.get('/healthz', (_req, res) => {
        res.json({ ok: true, mcpPath: BASIC_MCP_PATH });
    });

    app.post(BASIC_MCP_PATH, async (req, res) => {
        const server = createBasicMcpServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            res.on('close', () => {
                transport.close().catch(() => {});
                server.close().catch(() => {});
            });
        } catch (error) {
            console.error('[basic-mcp] request failed', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                });
            }
        }
    });

    app.get(BASIC_MCP_PATH, (_req, res) => {
        res.status(405).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null,
        });
    });

    app.delete(BASIC_MCP_PATH, (_req, res) => {
        res.status(405).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null,
        });
    });

    return app;
}

export function startBasicMcpServer({ port = DEFAULT_BASIC_MCP_PORT } = {}) {
    const app = createBasicMcpApp();
    return new Promise((resolve, reject) => {
        const httpServer = app.listen(port, error => {
            if (error) {
                reject(error);
                return;
            }
            const address = httpServer.address();
            const resolvedPort = typeof address === 'object' && address ? address.port : port;
            resolve({
                app,
                server: httpServer,
                port: resolvedPort,
                url: `http://localhost:${resolvedPort}${BASIC_MCP_PATH}`,
                close: () =>
                    new Promise((closeResolve, closeReject) => {
                        httpServer.close(closeError => {
                            if (closeError) {
                                closeReject(closeError);
                                return;
                            }
                            closeResolve();
                        });
                    }),
            });
        });
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const port = Number(process.env.PORT || process.argv[2] || DEFAULT_BASIC_MCP_PORT);
    startBasicMcpServer({ port })
        .then(({ url }) => {
            console.log(`Basic MCP test server listening at ${url}`);
            console.log('Sample config:');
            console.log(
                JSON.stringify(
                    {
                        mcpServers: {
                            'basic-test': {
                                url,
                                transport: 'http',
                            },
                        },
                    },
                    null,
                    2
                )
            );
        })
        .catch(error => {
            console.error('[basic-mcp] failed to start', error);
            process.exit(1);
        });
}
