export function createSidePanelController(sidePanelPath) {
    const openedSidePanelTabIds = new Set();
    const sidePanelTabIdByPort = new Map();
    const sidePanelConnections = new Set();
    const lastSidePanelOptionsByTabId = new Map();

    function getTabId(tabOrTabId) {
        if (Number.isInteger(tabOrTabId)) return tabOrTabId;
        return Number.isInteger(tabOrTabId?.id) ? tabOrTabId.id : null;
    }

    function hasSidePanelPortForTab(tabId) {
        for (const port of sidePanelConnections.values()) {
            if (sidePanelTabIdByPort.get(port) === tabId) {
                return true;
            }
        }
        return false;
    }

    async function handleTabOpening(tab) {
        try {
            if (!tab?.id) return;
            const now = Date.now();
            const last = lastSidePanelOptionsByTabId.get(tab.id);
            const enabled = openedSidePanelTabIds.has(tab.id);
            if (last && last.enabled === enabled && now - last.ts < 750) return;
            await chrome.sidePanel.setOptions({
                tabId: tab.id,
                path: sidePanelPath,
                enabled,
            });
            lastSidePanelOptionsByTabId.set(tab.id, { enabled, ts: now });
        } catch (e) {}
    }

    async function openSideBar(tab) {
        if (!tab?.id) return;
        openedSidePanelTabIds.add(tab.id);
        lastSidePanelOptionsByTabId.set(tab.id, { enabled: true, ts: Date.now() });
        await chrome.sidePanel.setOptions({ tabId: tab.id, path: sidePanelPath, enabled: true });
        await chrome.sidePanel.open({ tabId: tab.id });
    }

    async function closeSideBar(tabOrTabId) {
        const tabId = getTabId(tabOrTabId);
        if (!Number.isInteger(tabId)) return;
        openedSidePanelTabIds.delete(tabId);
        lastSidePanelOptionsByTabId.delete(tabId);
        await chrome.sidePanel.setOptions({ tabId, path: sidePanelPath, enabled: false });
    }

    async function toggleSideBar(tab) {
        if (!tab?.id) return;
        if (hasSidePanelPortForTab(tab.id)) {
            await closeSideBar(tab);
            return;
        }
        await openSideBar(tab);
    }

    function registerSidePanelPort(port) {
        sidePanelConnections.add(port);
        const senderTabId = port?.sender?.tab?.id;
        if (Number.isInteger(senderTabId)) {
            sidePanelTabIdByPort.set(port, senderTabId);
        }
        port.onDisconnect.addListener(() => {
            sidePanelConnections.delete(port);
            sidePanelTabIdByPort.delete(port);
        });
    }

    function sendMessageToSidePanelInTab(tabId, message) {
        let sent = false;
        for (const port of sidePanelConnections.values()) {
            if (sidePanelTabIdByPort.get(port) === tabId) {
                try {
                    port.postMessage(message);
                    sent = true;
                } catch (e) {}
            }
        }
        return sent;
    }

    function broadcastMessageToAllSidePanelInstances(message) {
        for (const port of sidePanelConnections.values()) {
            try {
                port.postMessage(message);
            } catch (e) {
                sidePanelConnections.delete(port);
                sidePanelTabIdByPort.delete(port);
            }
        }
    }

    function handleTabRemoved(tabId) {
        openedSidePanelTabIds.delete(tabId);
        lastSidePanelOptionsByTabId.delete(tabId);
    }

    return {
        handleTabOpening,
        openSideBar,
        closeSideBar,
        toggleSideBar,
        registerSidePanelPort,
        sendMessageToSidePanelInTab,
        broadcastMessageToAllSidePanelInstances,
        handleTabRemoved,
    };
}
