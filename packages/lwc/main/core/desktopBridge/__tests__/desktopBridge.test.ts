import { test } from 'node:test';
import assert from 'node:assert/strict';

type WinShape = {
    desktop?: Record<string, unknown>;
    electron?: Record<string, unknown>;
};

function setWindow(shape: WinShape) {
    (globalThis as unknown as { window: WinShape }).window = shape;
}

setWindow({});

const {
    hasDesktopBridge,
    getDesktopLaunchIntent,
    openDesktopInstance,
    openDesktopOrgUrl,
    getDesktopStoredOrg,
    setDesktopStoredOrg,
    getDesktopOrgs,
    checkDesktopCommands,
    runDesktopShell,
    removeDesktopStoredOrg,
    renameDesktopStoredOrg,
} = await import('../desktopBridge.ts');

test('hasDesktopBridge: false when neither window.desktop nor window.electron is set', () => {
    setWindow({});
    assert.equal(hasDesktopBridge(), false);
});

test('hasDesktopBridge: true when window.desktop exists', () => {
    setWindow({ desktop: {} });
    assert.equal(hasDesktopBridge(), true);
});

test('hasDesktopBridge: true when only window.electron exists', () => {
    setWindow({ electron: {} });
    assert.equal(hasDesktopBridge(), true);
});

test('getDesktopLaunchIntent: default when no desktop bridge', async () => {
    setWindow({});
    assert.deepEqual(await getDesktopLaunchIntent(), { target: 'app' });
});

test('getDesktopLaunchIntent: delegates to window.desktop.getLaunchIntent when present', async () => {
    setWindow({
        desktop: { getLaunchIntent: async () => ({ target: 'org', orgAlias: 'uat' }) },
    });
    assert.deepEqual(await getDesktopLaunchIntent(), { target: 'org', orgAlias: 'uat' });
});

test('openDesktopInstance: prefers desktop.openInstance', async () => {
    const calls: unknown[] = [];
    setWindow({ desktop: { openInstance: async (p: unknown) => calls.push(p) } });
    await openDesktopInstance({ alias: 'a' });
    assert.deepEqual(calls, [{ alias: 'a' }]);
});

test('openDesktopInstance: falls back to legacy electron.invoke', async () => {
    const calls: Array<[string, unknown]> = [];
    setWindow({
        electron: {
            invoke: async (channel: string, payload: unknown) => {
                calls.push([channel, payload]);
            },
        },
    });
    await openDesktopInstance({ alias: 'a' });
    assert.deepEqual(calls, [['OPEN_INSTANCE', { alias: 'a' }]]);
});

test('openDesktopOrgUrl: no bridge is a graceful no-op', async () => {
    setWindow({});
    await assert.doesNotReject(openDesktopOrgUrl({ url: 'x' }));
});

test('getDesktopStoredOrg: desktop.getStoredOrg path', async () => {
    setWindow({ desktop: { getStoredOrg: async (alias: string) => ({ aliasIn: alias }) } });
    const out = await getDesktopStoredOrg('acme');
    assert.deepEqual(out, { aliasIn: 'acme' });
});

test('getDesktopStoredOrg: legacy path unwraps res, rethrows on error', async () => {
    setWindow({
        electron: {
            invoke: async (_channel: string, payload: { alias: string }) => ({
                res: { alias: payload.alias, ok: true },
            }),
        },
    });
    assert.deepEqual(await getDesktopStoredOrg('acme'), { alias: 'acme', ok: true });

    setWindow({
        electron: { invoke: async () => ({ error: new Error('boom') }) },
    });
    await assert.rejects(() => getDesktopStoredOrg('x'), /boom/);
});

test('setDesktopStoredOrg: prefers desktop, else forwards to legacy channel', async () => {
    setWindow({ desktop: { setStoredOrg: async (p: unknown) => ({ ok: true, p }) } });
    const first = await setDesktopStoredOrg({ alias: 'a' });
    assert.deepEqual(first, { ok: true, p: { alias: 'a' } });

    const calls: Array<[string, unknown]> = [];
    setWindow({
        electron: {
            invoke: async (channel: string, payload: unknown) => {
                calls.push([channel, payload]);
                return 'legacy';
            },
        },
    });
    assert.equal(await setDesktopStoredOrg({ alias: 'b' }), 'legacy');
    assert.deepEqual(calls, [['org-setStoredOrg', { alias: 'b' }]]);
});

test('getDesktopOrgs: returns undefined when no bridge available', async () => {
    setWindow({});
    assert.equal(await getDesktopOrgs(), undefined);
});

test('checkDesktopCommands: default when neither bridge responds', async () => {
    setWindow({});
    assert.deepEqual(await checkDesktopCommands(), { sfdx: false, java: false });
});

test('runDesktopShell: delegates to desktop.runShell when present', async () => {
    const calls: unknown[] = [];
    setWindow({
        desktop: {
            runShell: async (p: unknown) => {
                calls.push(p);
            },
        },
    });
    await runDesktopShell({ alias: 'a', targetPath: null, listenerName: 'x', command: 'ls' });
    assert.equal(calls.length, 1);
});

test('renameDesktopStoredOrg: legacy reshapes payload keys', async () => {
    const calls: Array<[string, unknown]> = [];
    setWindow({
        electron: {
            invoke: async (c: string, p: unknown) => {
                calls.push([c, p]);
            },
        },
    });
    await renameDesktopStoredOrg({ oldAlias: 'old', newAlias: 'new' });
    assert.deepEqual(calls, [['org-renameStoredOrg', { alias: 'old', newAlias: 'new' }]]);
});

test('removeDesktopStoredOrg: legacy invoke is called with alias payload', async () => {
    const calls: Array<[string, unknown]> = [];
    setWindow({
        electron: {
            invoke: async (c: string, p: unknown) => {
                calls.push([c, p]);
            },
        },
    });
    await removeDesktopStoredOrg('acme');
    assert.deepEqual(calls, [['org-removeStoredOrg', { alias: 'acme' }]]);
});
