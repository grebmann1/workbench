import { CACHE_CONFIG } from 'shared/cacheManager';

import {
    canonicalizeServerUrl,
    getCurrentTabCookieStoreId,
    getHostAndSession,
    getSalesforceURL,
    validateSession,
} from '../../../extension/src/workers/utils/salesforce.js';
import { safeDebug, safeLog } from '../../../extension/src/workers/utils/utils.js';
import { handleMcpHttpRequest } from '../../../extension/src/workers/shared/mcpProxy.js';
import { handleLaunchWebAuthFlow } from '../../../extension/src/workers/shared/oauth.js';

const PORT_INSTANCE = 'sf-toolkit-instance';
const STABLE_SIDEPANEL_PATH = 'views/chat.html';

const instanceConnections = new Map();

const wrapAsyncFunction = listener => (request, sender, sendResponse) => {
    Promise.resolve(listener(request, sender))
        .then(sendResponse)
        .catch(error => {
            sendResponse({ error: error.message });
        });
    return true;
};

async function findExistingSession({ alias, instanceUrl } = {}) {
    let targetServerUrl;
    if (instanceUrl) {
        try {
            targetServerUrl = getSalesforceURL(instanceUrl);
        } catch (e) {}
    }
    if (!targetServerUrl && alias) {
        for (const [, instance] of instanceConnections.entries()) {
            if (instance && instance.alias === alias && instance.serverUrl) {
                targetServerUrl = getSalesforceURL(instance.serverUrl);
                break;
            }
        }
    }

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        try {
            if (!tab?.url) continue;
            const canonicalTabServerUrl = getSalesforceURL(tab.url);
            if (targetServerUrl && canonicalTabServerUrl !== targetServerUrl) continue;
            const storeId = await getCurrentTabCookieStoreId(tab.id);
            const cookie = await chrome.cookies.get({
                name: 'sid',
                url: canonicalTabServerUrl,
                storeId,
            });
            if (cookie?.value) {
                const serverUrlToValidate = targetServerUrl || canonicalTabServerUrl;
                const isValid = await validateSession(serverUrlToValidate, cookie.value);
                if (isValid) {
                    return {
                        sessionId: cookie.value,
                        serverUrl: serverUrlToValidate,
                        tabId: tab.id,
                    };
                }
            }
        } catch (e) {}
    }
    return undefined;
}

function handleInstancePort(port) {
    let registeredIdentityKey;
    port.onDisconnect.addListener(() => {
        if (registeredIdentityKey) {
            instanceConnections.delete(registeredIdentityKey);
        }
    });

    port.onMessage.addListener(msg => {
        const identityKey = canonicalizeServerUrl(msg.serverUrl);
        if (msg.action === 'registerInstance' && identityKey) {
            registeredIdentityKey = identityKey;
            instanceConnections.set(identityKey, {
                port,
                serverUrl: identityKey,
                alias: msg.alias,
                username: msg.username,
            });
            return;
        }
        if (msg.action === 'closeConnection') {
            instanceConnections.delete(identityKey || registeredIdentityKey);
            try {
                port.disconnect();
            } catch (e) {}
        }
    });
}

chrome.runtime.onConnect.addListener(port => {
    if (port.name === PORT_INSTANCE) {
        handleInstancePort(port);
    }
});

async function handleRuntimeMessage(message, sender) {
    if (message.action === 'launchWebAuthFlow') {
        return handleLaunchWebAuthFlow(message);
    }
    if (message.action === 'fetchCookie') {
        return getHostAndSession(sender.tab);
    }
    if (message.action === 'findExistingSession') {
        return findExistingSession({ alias: message.alias, instanceUrl: message.instanceUrl });
    }
    if (message.action === 'mcp_http_request') {
        return handleMcpHttpRequest({
            message,
            sender,
            cacheConfigKey: CACHE_CONFIG.MCP_SERVERS?.key || 'mcp_servers',
            safeDebug,
        });
    }
    return undefined;
}

chrome.runtime.onMessage.addListener(wrapAsyncFunction(handleRuntimeMessage));

const init = async () => {
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch(error => console.error(error));
    chrome.sidePanel
        .setOptions({ path: STABLE_SIDEPANEL_PATH })
        .catch(error => console.error(error));
};

chrome.runtime.setUninstallURL('https://forms.gle/cd8SkEPe5RGTVijJA');
safeLog('[Workbench Chat][BG] init');
init();
