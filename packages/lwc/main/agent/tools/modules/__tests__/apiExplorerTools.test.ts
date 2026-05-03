import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerCommand, __resetCommandsForTests } from 'host-api/commands';
import { apiExecuteRequestTool, apiOpenTabTool } from '../apiExplorerTools';

const resetCommands = () => __resetCommandsForTests();

test('api_execute_request: bails out cleanly when api.sendStandalone is missing', async () => {
    resetCommands();
    const out: any = await apiExecuteRequestTool.execute({
        method: 'GET',
        url: '/x',
    });
    assert.match(out.error, /not initialized/i);
});

test('api_execute_request: forwards args and normalizes the response', async () => {
    resetCommands();
    let captured: any = null;
    registerCommand('api.sendStandalone', async (payload: unknown) => {
        captured = payload;
        return {
            status: 200,
            headers: [{ key: 'content-type', value: 'application/json' }],
            body: { ok: true },
            bodyRaw: '{"ok":true}',
            contentType: 'application/json',
            size: 10,
            durationMs: 42,
        };
    });

    const out: any = await apiExecuteRequestTool.execute({
        method: 'GET',
        url: '/services/data/v59.0/limits',
        headers: { Accept: 'application/json' },
    });
    assert.equal(captured.method, 'GET');
    assert.equal(captured.url, '/services/data/v59.0/limits');
    assert.equal(out.status, 200);
    assert.equal(out.truncated, false);
    assert.deepEqual(out.body, { ok: true });
});

test('api_execute_request: truncates large string bodies and sets truncated=true', async () => {
    resetCommands();
    registerCommand('api.sendStandalone', async () => ({
        status: 200,
        body: 'x'.repeat(100_000),
        size: 100_000,
    }));
    const out: any = await apiExecuteRequestTool.execute({
        method: 'GET',
        url: '/big',
    });
    assert.equal(out.truncated, true);
    assert.ok(typeof out.body === 'string' && out.body.length <= 50_000);
});

test('api_execute_request: surfaces the command error into the tool result', async () => {
    resetCommands();
    registerCommand('api.sendStandalone', async () => ({
        error: 'network boom',
        aborted: false,
    }));
    const out: any = await apiExecuteRequestTool.execute({
        method: 'GET',
        url: '/x',
    });
    assert.equal(out.error, 'network boom');
});

test('api_open_tab: bails when api.open is not registered', async () => {
    resetCommands();
    // api.sendStandalone is missing too — but api_open_tab only checks api.open
    const out: any = await apiOpenTabTool.execute({});
    assert.match(out.error, /api\.open/);
});

test('api_open_tab: invokes api.open when registered', async () => {
    resetCommands();
    let called = false;
    registerCommand('api.open', async () => {
        called = true;
    });
    const out: any = await apiOpenTabTool.execute({ method: 'GET', url: '/x' });
    assert.equal(called, true);
    assert.equal(out.success, true);
});
