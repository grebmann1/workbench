import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DesktopRendererServer } from './desktopRendererServer';

test('desktop tool routes survive reload without swallowing missing assets', async () => {
    const webRoot = await mkdtemp(path.join(tmpdir(), 'workbench-renderer-test-'));
    const previousPort = process.env.DESKTOP_RENDERER_PORT;
    process.env.DESKTOP_RENDERER_PORT = '0';
    const server = new DesktopRendererServer({ webRoot, appVersion: 'test' });
    try {
        await mkdir(path.join(webRoot, 'views'));
        await writeFile(path.join(webRoot, 'views', 'app.html'), '<main>Workbench fixture</main>');
        const baseUrl = await server.start();
        for (const route of ['/app', '/app?applicationName=urlencoder', '/app/sobject/Account']) {
            const response = await fetch(baseUrl + route);
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type') || '', /text\/html/);
            assert.equal(await response.text(), '<main>Workbench fixture</main>');
        }
        const head = await fetch(baseUrl + '/app?applicationName=home', { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
        for (const route of ['/scripts/missing.js', '/application', '/missing']) {
            assert.equal((await fetch(baseUrl + route)).status, 404);
        }
    } finally {
        await server.stop();
        if (previousPort === undefined) delete process.env.DESKTOP_RENDERER_PORT;
        else process.env.DESKTOP_RENDERER_PORT = previousPort;
        await rm(webRoot, { recursive: true, force: true });
    }
});
