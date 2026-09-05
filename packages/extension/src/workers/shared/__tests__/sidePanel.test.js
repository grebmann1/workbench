import assert from 'node:assert/strict';
import { test } from 'node:test';

function makeChrome() {
    const sessionStore = {};
    const calls = { setOptions: [], open: [], sessionSet: [] };
    globalThis.chrome = {
        sidePanel: {
            setOptions: opts => {
                calls.setOptions.push(opts);
                return Promise.resolve();
            },
            open: opts => {
                calls.open.push(opts);
                return Promise.resolve();
            },
        },
        storage: {
            session: {
                get: async key => {
                    if (typeof key === 'string') {
                        return { [key]: sessionStore[key] };
                    }
                    return { ...sessionStore };
                },
                set: async obj => {
                    Object.assign(sessionStore, obj);
                    calls.sessionSet.push({ ...obj });
                },
            },
        },
    };
    return calls;
}

function makePort(tabId) {
    let disconnectListener = null;
    return {
        messages: [],
        sender: { tab: { id: tabId } },
        postMessage(msg) {
            this.messages.push(msg);
        },
        onDisconnect: {
            addListener(fn) {
                disconnectListener = fn;
            },
        },
        simulateDisconnect() {
            if (disconnectListener) disconnectListener();
        },
    };
}

const { createSidePanelController } = await import('../sidePanel.js');

test('openSideBar: enables the side panel via setOptions then opens it', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.openSideBar({ id: 7 });
    assert.equal(calls.setOptions.length, 1);
    assert.deepEqual(calls.setOptions[0], { tabId: 7, path: 'sidebar.html', enabled: true });
    assert.equal(calls.open.length, 1);
    assert.deepEqual(calls.open[0], { tabId: 7 });
});

test('openSideBar: no-ops when tab has no id', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.openSideBar({});
    assert.equal(calls.setOptions.length, 0);
    assert.equal(calls.open.length, 0);
});

test('closeSideBar: disables the side panel via setOptions, accepts a tab id or tab object', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.openSideBar({ id: 7 });
    await controller.closeSideBar(7);
    assert.equal(calls.setOptions.length, 2);
    assert.deepEqual(calls.setOptions[1], { tabId: 7, path: 'sidebar.html', enabled: false });
});

test('closeSideBar: accepts a tab object as well as a raw id', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.closeSideBar({ id: 9 });
    assert.deepEqual(calls.setOptions[0], { tabId: 9, path: 'sidebar.html', enabled: false });
});

test('closeSideBar: no-ops when given a non-integer tab id', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.closeSideBar(null);
    await controller.closeSideBar({});
    assert.equal(calls.setOptions.length, 0);
});

test('toggleSideBar: opens when there is no registered port for the tab', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.toggleSideBar({ id: 3 });
    assert.equal(calls.open.length, 1);
});

test('toggleSideBar: closes when a port is already registered for the tab', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const port = makePort(3);
    controller.registerSidePanelPort(port);
    await controller.toggleSideBar({ id: 3 });
    assert.equal(calls.open.length, 0);
    // last setOptions call should be the "disabled" close call
    const last = calls.setOptions[calls.setOptions.length - 1];
    assert.deepEqual(last, { tabId: 3, path: 'sidebar.html', enabled: false });
});

test('toggleSideBar: no-ops when tab has no id', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.toggleSideBar({});
    assert.equal(calls.open.length, 0);
    assert.equal(calls.setOptions.length, 0);
});

test('handleTabOpening: skips a second call for the same tab+enabled state', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.handleTabOpening({ id: 4 });
    assert.equal(calls.setOptions.length, 1);

    await controller.handleTabOpening({ id: 4 });
    assert.equal(
        calls.setOptions.length,
        1,
        'second call with same enabled state should be skipped'
    );
});

test('handleTabOpening: does not re-apply setOptions after 750ms when enabled is unchanged', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const origNow = Date.now;
    let now = 2_000_000;
    Date.now = () => now;
    try {
        await controller.handleTabOpening({ id: 5 });
        assert.equal(calls.setOptions.length, 1);

        now += 751;
        await controller.handleTabOpening({ id: 5 });
        assert.equal(
            calls.setOptions.length,
            1,
            'same enabled state should still skip after 750ms'
        );
    } finally {
        Date.now = origNow;
    }
});

test('handleTabOpening: does not re-apply enabled:true after openSideBar', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.handleTabOpening({ id: 6 }); // enabled=false (not yet opened) -> writes once
    assert.equal(calls.setOptions.length, 1);

    await controller.openSideBar({ id: 6 });
    assert.equal(calls.setOptions.length, 2);

    await controller.handleTabOpening({ id: 6 });
    assert.equal(calls.setOptions.length, 2, 'opened tab should not re-apply enabled:true');
});

test('handleTabOpening: writes enabled:false for an unopened tab', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.handleTabOpening({ id: 11 });
    assert.equal(calls.setOptions.length, 1);
    assert.deepEqual(calls.setOptions[0], { tabId: 11, path: 'sidebar.html', enabled: false });
});

test('handleTabOpening: no-ops when tab has no id', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.handleTabOpening({});
    await controller.handleTabOpening(null);
    assert.equal(calls.setOptions.length, 0);
});

test('handleTabOpening: swallows errors from chrome.sidePanel.setOptions', async () => {
    globalThis.chrome = {
        sidePanel: {
            setOptions: () => Promise.reject(new Error('boom')),
            open: () => Promise.resolve(),
        },
    };
    const controller = createSidePanelController('sidebar.html');
    await assert.doesNotReject(controller.handleTabOpening({ id: 1 }));
});

test('registerSidePanelPort + sendMessageToSidePanelInTab: delivers a message to the matching port', () => {
    makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const portA = makePort(10);
    const portB = makePort(20);
    controller.registerSidePanelPort(portA);
    controller.registerSidePanelPort(portB);

    const sent = controller.sendMessageToSidePanelInTab(10, { hello: 'a' });
    assert.equal(sent, true);
    assert.deepEqual(portA.messages, [{ hello: 'a' }]);
    assert.deepEqual(portB.messages, []);
});

test('sendMessageToSidePanelInTab: returns false when no port matches the tab', () => {
    makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const sent = controller.sendMessageToSidePanelInTab(999, { hello: 'x' });
    assert.equal(sent, false);
});

test('broadcastMessageToAllSidePanelInstances: reaches every registered port', () => {
    makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const portA = makePort(10);
    const portB = makePort(20);
    controller.registerSidePanelPort(portA);
    controller.registerSidePanelPort(portB);

    controller.broadcastMessageToAllSidePanelInstances({ type: 'ping' });
    assert.deepEqual(portA.messages, [{ type: 'ping' }]);
    assert.deepEqual(portB.messages, [{ type: 'ping' }]);
});

test('broadcastMessageToAllSidePanelInstances: drops a port whose postMessage throws', () => {
    makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const goodPort = makePort(1);
    const badPort = makePort(2);
    badPort.postMessage = () => {
        throw new Error('port closed');
    };
    controller.registerSidePanelPort(goodPort);
    controller.registerSidePanelPort(badPort);

    controller.broadcastMessageToAllSidePanelInstances({ type: 'ping' });
    assert.deepEqual(goodPort.messages, [{ type: 'ping' }]);

    // badPort should have been dropped from tracking; sending to its tab now fails.
    const sent = controller.sendMessageToSidePanelInTab(2, { type: 'again' });
    assert.equal(sent, false);
});

test('registerSidePanelPort onDisconnect: removes the port from tracking when disconnected', () => {
    makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const port = makePort(15);
    controller.registerSidePanelPort(port);
    assert.equal(controller.sendMessageToSidePanelInTab(15, { a: 1 }), true);

    port.simulateDisconnect();

    const sent = controller.sendMessageToSidePanelInTab(15, { a: 2 });
    assert.equal(sent, false);
});

test('registerSidePanelPort: tracks ports without a sender tab id gracefully (broadcast only)', () => {
    makeChrome();
    const controller = createSidePanelController('sidebar.html');
    const port = makePort(undefined);
    port.sender = {};
    controller.registerSidePanelPort(port);
    controller.broadcastMessageToAllSidePanelInstances({ type: 'x' });
    assert.deepEqual(port.messages, [{ type: 'x' }]);
    // Port was never associated with a tab id, so it should not match any concrete tab id lookup.
    assert.equal(controller.sendMessageToSidePanelInTab(15, { type: 'y' }), false);
});

test('handleTabRemoved: clears open tracking and last-options tracking for the tab', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.openSideBar({ id: 42 });
    assert.equal(calls.setOptions.length, 1);

    controller.handleTabRemoved(42);

    // Before removal, handleTabOpening would skip (enabled=true matches the
    // state openSideBar recorded). After removal, lastSidePanelOptionsByTabId no longer has
    // an entry for tab 42, so the very next handleTabOpening call writes enabled:false.
    await controller.handleTabOpening({ id: 42 });
    assert.equal(
        calls.setOptions.length,
        2,
        'stale debounce state should have been cleared by handleTabRemoved'
    );
    assert.deepEqual(calls.setOptions[1], { tabId: 42, path: 'sidebar.html', enabled: false });
});

test('openSideBar: persists opened tab ids to session storage', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.openSideBar({ id: 8 });
    assert.deepEqual(calls.sessionSet.at(-1), { opened_side_panel_tab_ids: [8] });
});

test('closeSideBar: persists removal of the opened tab id', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.openSideBar({ id: 8 });
    await controller.closeSideBar(8);
    assert.deepEqual(calls.sessionSet.at(-1), { opened_side_panel_tab_ids: [] });
});

test('handleTabRemoved: persists removal of the opened tab id', async () => {
    const calls = makeChrome();
    const controller = createSidePanelController('sidebar.html');
    await controller.openSideBar({ id: 8 });
    controller.handleTabRemoved(8);
    assert.deepEqual(calls.sessionSet.at(-1), { opened_side_panel_tab_ids: [] });
});

test('restoreOpenedTabIds: hydrates opened tabs so handleTabOpening writes enabled:true', async () => {
    const calls = makeChrome();
    const first = createSidePanelController('sidebar.html');
    await first.openSideBar({ id: 8 });

    const second = createSidePanelController('sidebar.html');
    await second.restoreOpenedTabIds();
    await second.handleTabOpening({ id: 8 });
    const last = calls.setOptions.at(-1);
    assert.deepEqual(last, { tabId: 8, path: 'sidebar.html', enabled: true });
});
