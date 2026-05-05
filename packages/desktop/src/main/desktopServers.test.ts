import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DesktopAutomationServer } from './desktopAutomationServer';
import { DesktopRendererServer } from './desktopRendererServer';

test('DesktopRendererServer serves app version with security headers', async () => {
    const previousPort = process.env.DESKTOP_RENDERER_PORT;
    process.env.DESKTOP_RENDERER_PORT = '0';
    const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-renderer-'));
    await fs.writeFile(path.join(webRoot, 'index.html'), '<main>Workbench</main>', 'utf8');
    const server = new DesktopRendererServer({ appVersion: '2.0.1', webRoot });

    try {
        const baseUrl = await server.start();
        const response = await fetch(`${baseUrl}/version`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
        assert.deepEqual(await response.json(), { version: '2.0.1' });
    } finally {
        await server.stop();
        if (previousPort === undefined) {
            delete process.env.DESKTOP_RENDERER_PORT;
        } else {
            process.env.DESKTOP_RENDERER_PORT = previousPort;
        }
        await fs.rm(webRoot, { force: true, recursive: true });
    }
});

test('DesktopRendererServer routes Salesforce proxy requests before static assets', async () => {
    const previousPort = process.env.DESKTOP_RENDERER_PORT;
    process.env.DESKTOP_RENDERER_PORT = '0';
    const webRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-renderer-'));
    await fs.writeFile(path.join(webRoot, 'index.html'), '<main>Workbench</main>', 'utf8');
    const server = new DesktopRendererServer({ appVersion: '2.0.1', webRoot });

    try {
        const baseUrl = await server.start();
        const optionsResponse = await fetch(`${baseUrl}/proxy`, {
            headers: {
                Origin: baseUrl,
            },
            method: 'OPTIONS',
        });
        assert.equal(optionsResponse.status, 200);
        assert.equal(optionsResponse.headers.get('access-control-allow-origin'), baseUrl);

        const missingEndpointResponse = await fetch(`${baseUrl}/proxy`, {
            headers: {
                Origin: baseUrl,
            },
            method: 'GET',
        });
        assert.equal(missingEndpointResponse.status, 400);
        assert.match(await missingEndpointResponse.text(), /salesforceproxy-endpoint/);
    } finally {
        await server.stop();
        if (previousPort === undefined) {
            delete process.env.DESKTOP_RENDERER_PORT;
        } else {
            process.env.DESKTOP_RENDERER_PORT = previousPort;
        }
        await fs.rm(webRoot, { force: true, recursive: true });
    }
});

test('DesktopAutomationServer rejects unauthenticated command requests', async () => {
    const server = new DesktopAutomationServer({
        host: '127.0.0.1',
        legacyBus: {} as any,
        openInstance: async () => {},
        port: 0,
        token: 'local-token',
        windowManager: {} as any,
    });

    try {
        const baseUrl = await server.start();
        const response = await fetch(`${baseUrl}/command/execute`, {
            body: JSON.stringify({ v: 2, type: 'openApp' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
        });

        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), {
            status: 'error',
            message: 'Unauthorized desktop automation request.',
        });
    } finally {
        await server.stop();
    }
});
