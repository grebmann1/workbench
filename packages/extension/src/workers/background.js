import {
    CACHE_CONFIG,
    saveSingleExtensionConfigToCache,
    loadSingleExtensionConfigFromCache,
} from 'shared/cacheManager';

import { handleChromeInteraction } from './chromeApi.js';
import {
    canonicalizeServerUrl,
    getHostAndSession,
    getSalesforceURL,
    getSidCookieForOrigin,
    getSidCookieForTabId,
    listOrgSessionsFromTabs,
    openWorkbenchTab,
    requestPermission,
    validateSession,
} from './utils/salesforce.js';
import {
    compareMajorMinor,
    getContentScriptPatterns,
    ignoreRuntimeError,
    isEmpty,
    isHostMatching,
    isNotNullOrUndefined,
    normalizeUrlForPatternMatch,
    refreshContentScriptPatternsCache,
    safeDebug,
    safeLog,
} from './utils/utils.js';
import { handleVscodeBackgroundMessage, isVscodeBackgroundAction } from './vscode.js';
import { handleMcpHttpRequest } from './shared/mcpProxy.js';
import { handleLaunchWebAuthFlow } from './shared/oauth.js';
import { startProviderOAuth, handleOAuthRedirect } from './shared/providerOAuth.js';

/** Command and menu ids */
const OVERLAY_ENABLE = 'overlay_enable';
const OVERLAY_DISABLE = 'overlay_disable';
const OVERLAY_ENABLE_TITLE = 'Enable Overlay';
const OVERLAY_DISABLE_TITLE = 'Disable Overlay';
const OVERLAY_TOGGLE = 'overlay_toggle';
const OPEN_OVERLAY_SEARCH = 'open_overlay_search';
const OPEN_SIDE_PANEL = 'open_side_panel';
const OPEN_TOOLKIT = 'open_toolkit';
const PORT_INSTANCE = 'sf-toolkit-instance';
const PORT_INJECTED = 'sf-toolkit-injected';
const PORT_SIDEPANEL = 'sf-toolkit-sidepanel';
const MATCH_CONTENT_SCRIPT_URL = 'matchContentScriptUrl';
const STABLE_SIDEPANEL_PATH = 'views/default.html';

/** Default content-script patterns */
const DEFAULT_INCLUDE_PATTERNS = [
    '/\.salesforce(-com)?\./',
    '/\.lightning\.force(-com)?\./',
    '/\.crm\.dev(:\d+)?\//',
    '/\.develop\.lightning\.force(-com)?\./',
    '/\.salesforce-setup(-com)?\./',
    '/\.force\.com/',
    '/\.salesforce\.mil/',
    '/\.crmforce\.mil/',
    '/\.lightning\.force\.mil/',
    '/\.cloudforce\.mil/',
    '/\.sfcrmapps\.cn/',
    '/\.sfcrmproducts\.cn/',
    '/\.lightning\.force\.com\.mcas\.ms/',
    '/\.builder\.salesforce-experience\.com/',
];
const DEFAULT_EXCLUDE_PATTERNS = [
    '/\/setup\/secur\/RemoteAccessAuthorizationPage\.apexp/',
    '/\/_ui\/common\/apex\/debug\//',
    '/\/_ui\//',
    'https:\/\/test\.salesforce\.com\//',
    'https:\/\/login\.salesforce\.com\//',
    '/\/loginflow\//',
    'salesforce\.com\/#\[^\/\]/',
];

const redirectToUrlViaChrome = ({ baseUrl, sessionId, serverUrl, navigation }) => {
    let params = new URLSearchParams();
    if (sessionId) {
        params.append('sessionId', sessionId);
        params.append('serverUrl', serverUrl);
    }

    if (navigation) {
        // Navigation state is a key-value pair of the state of the navigation
        const redirectUrl = new URLSearchParams();
        if (isNotNullOrUndefined(navigation.state)) {
            safeLog('navigation.state', navigation.state);
            Object.entries(navigation.state).forEach(([key, value]) => {
                redirectUrl.append(key, value);
            });
        }
        params.append('redirectUrl', encodeURIComponent(redirectUrl.toString()));
    }

    let url = new URL(baseUrl);
    url.search = params.toString();
    // Open a new tab
    chrome.tabs.create({
        url: url.href,
    });
};

/** Session lookup helpers used by the app and VS Code integration. */
async function findExistingSession({ alias, instanceUrl } = {}) {
    // Derive target serverUrl from alias if available
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
            if (!tab || !tab.url) continue;
            // Consider only Salesforce-related tabs we would inject into
            if (!(await shouldInjectScriptAsync(tab.url))) continue;

            const canonicalTabServerUrl = getSalesforceURL(tab.url);
            if (targetServerUrl && canonicalTabServerUrl !== targetServerUrl) continue;

            // Match Benchpress: omit storeId. Passing the wrong cookie store can
            // return a stale admin sid during Login As impersonation.
            let cookie = await chrome.cookies.get({
                name: 'sid',
                url: canonicalTabServerUrl,
            });

            // If not found, try soma->sfdcdev fallback like getHostAndSession does
            if (!cookie || !cookie.value) {
                const fallbackUrl = canonicalTabServerUrl.replace('soma', 'sfdcdev');
                if (fallbackUrl !== canonicalTabServerUrl) {
                    cookie = await chrome.cookies.get({ name: 'sid', url: fallbackUrl });
                    if (cookie && cookie.value) {
                        // Use fallbackUrl as canonical if cookie found there
                        if (!targetServerUrl) {
                            targetServerUrl = fallbackUrl;
                        }
                    }
                }
            }

            if (cookie && cookie.value) {
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
        } catch (e) {
            // Skip tab on any error and continue
        }
    }
    return;
}

/** Runtime connection state shared across ports and windows. */
const _lastSidePanelOptionsByTabId = new Map(); // tabId -> { ts }
const openedSidePanelTabIds = new Set();
const injectedConnections = new Set();
const sidePanelConnections = new Set();
const sidePanelTabIdByPort = new Map();
const instanceConnections = new Map();

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

const handleTabOpening = async tab => {
    try {
        if (!tab?.id) return;
        const now = Date.now();
        const last = _lastSidePanelOptionsByTabId.get(tab.id);
        const enabled = openedSidePanelTabIds.has(tab.id);
        if (last && last.enabled === enabled && now - last.ts < 750) return;
        await chrome.sidePanel.setOptions({
            tabId: tab.id,
            path: STABLE_SIDEPANEL_PATH,
            enabled,
        });
        _lastSidePanelOptionsByTabId.set(tab.id, { enabled, ts: now });
    } catch (e) {}
};

const openSideBar = async tab => {
    if (!tab?.id) return;
    openedSidePanelTabIds.add(tab.id);
    _lastSidePanelOptionsByTabId.set(tab.id, { enabled: true, ts: Date.now() });

    const optionsPromise = chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: STABLE_SIDEPANEL_PATH,
        enabled: true,
    });
    const openPromise = chrome.sidePanel.open({ tabId: tab.id });

    await optionsPromise;
    await openPromise;
};

const closeSideBar = async tabOrTabId => {
    const tabId = getTabId(tabOrTabId);
    if (!Number.isInteger(tabId)) return;
    openedSidePanelTabIds.delete(tabId);
    _lastSidePanelOptionsByTabId.delete(tabId);

    await chrome.sidePanel.setOptions({
        tabId,
        path: STABLE_SIDEPANEL_PATH,
        enabled: false,
    });
};

const toggleSideBar = async tab => {
    if (!tab?.id) return;
    if (hasSidePanelPortForTab(tab.id)) {
        await closeSideBar(tab);
        return;
    }
    await openSideBar(tab);
};

/** Generic async listener wrapper for Chrome callback-based events. */
const wrapAsyncFunction = listener => (request, sender, sendResponse) => {
    Promise.resolve(listener(request, sender))
        .then(sendResponse)
        .catch(error => {
            sendResponse({ error: error.message });
        });
    return true;
};

/** Context menu lifecycle and overlay state helpers. */
let _ensureContextMenuPromise = null;

async function ensureContextMenu() {
    if (_ensureContextMenuPromise) return _ensureContextMenuPromise;
    _ensureContextMenuPromise = (async () => {
        await createContextMenu();
    })().finally(() => {
        _ensureContextMenuPromise = null;
    });
    return _ensureContextMenuPromise;
}

async function createContextMenu() {
    const isEnabled = await loadSingleExtensionConfigFromCache(CACHE_CONFIG.OVERLAY_ENABLED.key);
    // Idempotent menu creation: MV3 service worker can restart, so recreate safely.
    await new Promise(resolve => {
        try {
            chrome.contextMenus.removeAll(() => resolve());
        } catch (e) {
            resolve();
        }
    });
    /* chrome.contextMenus.create({
        id: OPEN_SIDE_PANEL,
        title: 'Open Workbench (side panel)',
        contexts: ['page'],
    }); */

    chrome.contextMenus.create(
        {
            id: OPEN_TOOLKIT,
            title: 'Open Workbench (in new tab)',
            contexts: ['action'],
            enabled: true,
            visible: true,
        },
        ignoreRuntimeError
    );

    chrome.contextMenus.create(
        {
            id: OVERLAY_ENABLE,
            title: OVERLAY_ENABLE_TITLE,
            contexts: ['action'],
            enabled: !isEnabled,
            visible: true,
        },
        ignoreRuntimeError
    );
    chrome.contextMenus.create(
        {
            id: OVERLAY_DISABLE,
            title: OVERLAY_DISABLE_TITLE,
            contexts: ['action'],
            enabled: isEnabled,
            visible: true,
        },
        ignoreRuntimeError
    );
}

/** Long-lived port registration and routing. */
function removeInstanceConnection(identityKey) {
    if (!identityKey) return;
    instanceConnections.delete(identityKey);
}

function focusPortTab(port) {
    const tab = port?.sender?.tab;
    if (!tab?.id || !tab?.windowId) return;
    chrome.tabs.update(tab.id, { active: true }, updatedTab => {
        if (chrome.runtime.lastError || !updatedTab) return;
        chrome.windows.update(updatedTab.windowId, { focused: true });
    });
}

function handleInstancePort(port) {
    safeLog('--> Registering instance', port.name);
    let registeredIdentityKey;

    port.onDisconnect.addListener(() => {
        removeInstanceConnection(registeredIdentityKey);
    });

    port.onMessage.addListener(msg => {
        const identityKey = canonicalizeServerUrl(msg.serverUrl);
        if (msg.action === 'registerInstance') {
            if (!identityKey) return;
            if (registeredIdentityKey && registeredIdentityKey !== identityKey) {
                removeInstanceConnection(registeredIdentityKey);
            }
            registeredIdentityKey = identityKey;
            instanceConnections.set(identityKey, {
                port,
                serverUrl: identityKey,
                alias: msg.alias,
                username: msg.username,
            });
            safeLog('--> Registering instance (Once is logged in)', identityKey);
            return;
        }

        if (msg.action === 'closeConnection') {
            removeInstanceConnection(identityKey || registeredIdentityKey);
            try {
                port.disconnect();
            } catch (e) {}
        }
    });
}

function handleInjectedPort(port) {
    safeLog('[SF-TOOLKIT][BG] Registering injected port', {
        name: port.name,
        tabId: port?.sender?.tab?.id,
        url: port?.sender?.tab?.url,
        beforeCount: injectedConnections.size,
    });

    injectedConnections.add(port);
    port.onDisconnect.addListener(() => {
        injectedConnections.delete(port);
        safeLog('[SF-TOOLKIT][BG] Injected port disconnected', {
            tabId: port?.sender?.tab?.id,
            afterCount: injectedConnections.size,
        });
    });
    port.onMessage.addListener(msg => {
        if (msg.action === 'redirectToUrl') {
            handleRedirectToUrl(msg);
        }
    });
}

function handleSidePanelPort(port) {
    safeLog('--> Registering sidepanel', port.name);
    sidePanelConnections.add(port);
    const senderTabId = port?.sender?.tab?.id;
    if (Number.isInteger(senderTabId)) {
        sidePanelTabIdByPort.set(port, senderTabId);
    }

    port.onDisconnect.addListener(() => {
        sidePanelConnections.delete(port);
        sidePanelTabIdByPort.delete(port);
    });

    port.onMessage.addListener(msg => {
        safeLog('--> sidepanel message', msg);
        if (msg?.action === 'registerSidePanelTab') {
            const tabId = Number(msg.tabId);
            if (Number.isInteger(tabId)) {
                sidePanelTabIdByPort.set(port, tabId);
                openedSidePanelTabIds.add(tabId);
                _lastSidePanelOptionsByTabId.set(tabId, {
                    enabled: true,
                    ts: Date.now(),
                });
            }
            return;
        }
        if (msg.action === 'redirectToUrl') {
            handleRedirectToUrl(msg);
        }
    });
}

function handlePortConnection(port) {
    if (port.name === PORT_INSTANCE) {
        handleInstancePort(port);
        return;
    }
    if (port.name === PORT_INJECTED) {
        handleInjectedPort(port);
        return;
    }
    if (port.name === PORT_SIDEPANEL) {
        handleSidePanelPort(port);
    }
}

chrome.runtime.onConnect.addListener(handlePortConnection);

/** Redirect and overlay coordination across extension surfaces. */
function handleRedirectToUrl(msg) {
    safeLog('handleRedirectToUrl', msg);
    const key = canonicalizeServerUrl(msg?.serverUrl);

    if (key && instanceConnections.has(key)) {
        const instance = instanceConnections.get(key);
        if (instance && instance.port) {
            instance.port.postMessage({
                ...msg,
                serverUrl: key,
                action: 'redirectToUrl',
            });
            focusPortTab(instance.port);
            return;
        }
    }

    redirectToUrlViaChrome({ ...msg, serverUrl: key || msg?.serverUrl });
}

async function setOverlayState(isEnabled) {
    await saveSingleExtensionConfigToCache(CACHE_CONFIG.OVERLAY_ENABLED.key, isEnabled);
    updateContextMenu();
    safeLog('[SF-TOOLKIT][BG] setOverlayState', { isEnabled });
    broadcastMessageToAllInjectedInstances({ action: 'toggleOverlay', enabled: isEnabled });
}

async function updateContextMenu() {
    // Ensure menus exist (and avoid creation races) before updating.
    await ensureContextMenu().catch(() => {});
    const isEnabled = await loadSingleExtensionConfigFromCache(CACHE_CONFIG.OVERLAY_ENABLED.key);
    try {
        chrome.contextMenus.update(OVERLAY_ENABLE, { enabled: !isEnabled }, () => {});
    } catch (e) {}
    try {
        chrome.contextMenus.update(OVERLAY_DISABLE, { enabled: isEnabled }, () => {});
    } catch (e) {}
}

// Async version of shouldInjectScript
async function shouldInjectScriptAsync(url) {
    // Never inject into the extension's own pages.
    if (typeof url === 'string' && url.startsWith('chrome-extension://')) return false;
    const normalizedUrl = normalizeUrlForPatternMatch(url);
    if (!normalizedUrl) return false;
    const { includePatterns, excludePatterns } = await getContentScriptPatterns(
        DEFAULT_INCLUDE_PATTERNS,
        DEFAULT_EXCLUDE_PATTERNS
    );
    // Exclude first
    for (const pattern of excludePatterns) {
        if (pattern.test(normalizedUrl)) return false;
    }
    // Then include
    for (const pattern of includePatterns) {
        if (pattern.test(normalizedUrl)) return true;
    }
    return false;
}

// Refresh cached patterns when settings change
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (
        Object.prototype.hasOwnProperty.call(changes, 'content_script_include_patterns') ||
        Object.prototype.hasOwnProperty.call(changes, 'content_script_exclude_patterns')
    ) {
        refreshContentScriptPatternsCache(DEFAULT_INCLUDE_PATTERNS, DEFAULT_EXCLUDE_PATTERNS).catch(
            () => {}
        );
    }
});

function injectToolkit(tabId) {
    // Inject CSS files first
    chrome.scripting.insertCSS(
        {
            target: { tabId: tabId },
            files: [
                'styles/slds-workbench-salesforce.css',
                'styles/inject.css',
                'styles/shared.css',
                'styles/extension.css',
            ],
        },
        () => {
            // Then inject the JS content script, and set the injected flag
            chrome.scripting.executeScript(
                {
                    target: { tabId: tabId },
                    files: ['scripts/inject_salesforce.js'],
                },
                () => {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => {
                            window.__SF_TOOLKIT_SCRIPT_INJECTED = true;
                        },
                    });
                }
            );
        }
    );
}

/** Action Button  */
chrome.action.onClicked.addListener(tab => {
    toggleSideBar(tab).catch(e => {
        console.error('[SF-TOOLKIT][BG] Failed to toggle side panel on action click', e);
    });
});

/** Browser event handlers. */
function handleContextMenuClick(info, tab) {
    if (info.menuItemId === OPEN_SIDE_PANEL) {
        toggleSideBar(tab);
    } else if (info.menuItemId === OPEN_TOOLKIT) {
        chrome.tabs.create({ url: chrome.runtime.getURL('views/app.html') });
    } else if (info.menuItemId === OVERLAY_ENABLE) {
        setOverlayState(true);
    } else if (info.menuItemId === OVERLAY_DISABLE) {
        setOverlayState(false);
    }
}

async function handleTabActivated({ tabId }) {
    if (!tabId) return;
    try {
        const tab = await chrome.tabs.get(tabId);
        await handleTabOpening(tab);
    } catch (e) {
        console.error('handleTabOpening issue: ', e);
    }
}

async function handleTabUpdated(tabId, info, tab) {
    if (!tab.url || info.status !== 'complete') return;
    if (await shouldInjectScriptAsync(tab.url)) {
        chrome.scripting.executeScript(
            {
                target: { tabId: tabId },
                func: () => window.__SF_TOOLKIT_SCRIPT_INJECTED,
            },
            results => {
                if (chrome.runtime.lastError) {
                    // Tab is in an error/restricted state (e.g. error page, tab closed).
                    // Do not attempt injection — it will fail and generate noise.
                    return;
                }
                if (!results || !results[0] || !results[0].result) {
                    injectToolkit(tabId);
                }
            }
        );
    }
    await handleTabOpening(tab);
}

/** Runtime message handlers. */
async function handleLaunchWebAuthFlowMessage(message) {
    return handleLaunchWebAuthFlow(message);
}

function broadcastMessage(message, sender) {
    const payload = { ...message.content, senderId: sender.id };
    if (message.action === 'broadcastMessageToInjected') {
        const targetTabId = message.targetTabId;
        if (targetTabId) {
            const wasSent = sendMessageToInjectedInTab(targetTabId, payload);
            if (!wasSent) {
                broadcastMessageToAllInjectedInstances(payload);
            }
            return;
        }
        broadcastMessageToAllInjectedInstances(payload);
        return;
    }
    if (message.action === 'broadcastMessageToSidePanel') {
        const rawTargetTabId =
            message.targetTabId || message.content?.targetTabId || sender?.tab?.id;
        const targetTabId = Number(rawTargetTabId);
        if (Number.isInteger(targetTabId)) {
            sendMessageToSidePanelInTab(targetTabId, payload);
            return;
        }
        broadcastMessageToAllSidePanelInstances(payload);
    }
}

async function handleSmartInputMessage(message, sender) {
    safeDebug('[SmartInput AI] background received smartinput_enhance_single', {
        senderUrl: (sender?.url || '').slice(0, 80),
        hasTab: !!sender?.tab,
    });

    const senderUrl = sender?.url || '';
    const isExtensionPageSender =
        typeof senderUrl === 'string' && senderUrl.startsWith(chrome.runtime.getURL(''));
    const isInjectedSalesforceSender =
        !isExtensionPageSender &&
        !!sender?.tab?.url &&
        (await shouldInjectScriptAsync(sender.tab.url));
    if (!isExtensionPageSender && !isInjectedSalesforceSender) {
        safeDebug('[SmartInput AI] background rejected: untrusted sender');
        return { error: 'Untrusted sender' };
    }

    const prompt = typeof message?.prompt === 'string' ? message.prompt : '';
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
        safeDebug('[SmartInput AI] background rejected: missing prompt');
        return { error: 'Missing prompt' };
    }
    if (trimmedPrompt.length > 4000) {
        safeDebug('[SmartInput AI] background rejected: prompt too long', {
            length: trimmedPrompt.length,
        });
        return { error: 'Prompt too long' };
    }

    const sanitizeBaseUrl = raw => {
        const fallback = 'https://api.openai.com/v1';
        const value = (raw || '').trim();
        if (!value) return fallback;
        try {
            const u = new URL(value);
            if (u.username || u.password) return fallback;
            if (u.protocol !== 'https:' && u.protocol !== 'http:') return fallback;
            if (u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname)) {
                return fallback;
            }
            u.search = '';
            u.hash = '';
            u.pathname = (u.pathname || '').replace(/\/+$/, '');
            return u.toString();
        } catch (e) {
            return fallback;
        }
    };

    const data = await chrome.storage.local.get(['openai_key', 'openai_url']);
    const apiKey = data.openai_key;
    const baseUrl = sanitizeBaseUrl(data.openai_url);
    safeDebug('[SmartInput AI] background config', {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        baseUrl,
        promptLength: trimmedPrompt.length,
    });
    if (!apiKey) {
        safeDebug('[SmartInput AI] background rejected: missing OpenAI key');
        return { error: 'Missing OpenAI key' };
    }

    try {
        const body = {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content:
                        'You are Smart Input Assistant. Return one concise realistic value suitable for a Salesforce form input. No explanations.',
                },
                { role: 'user', content: trimmedPrompt },
            ],
            temperature: 0.5,
            n: 1,
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        let resp;
        const endpoint = `${baseUrl}/chat/completions`;
        safeDebug('[SmartInput AI] background fetch start', { endpoint });
        try {
            resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }
        safeDebug('[SmartInput AI] background fetch done', {
            ok: resp.ok,
            status: resp.status,
        });
        if (!resp.ok) {
            const text = await resp.text();
            safeDebug('[SmartInput AI] background fetch error body', {
                status: resp.status,
                bodyPreview: (text || '').slice(0, 200),
            });
            return { error: `OpenAI error: ${text}` };
        }
        const json = await resp.json();
        const suggestion = json?.choices?.[0]?.message?.content || '';
        const result = suggestion.trim();
        safeDebug('[SmartInput AI] background success', {
            suggestionLength: result.length,
        });
        return { suggestion: result };
    } catch (e) {
        safeDebug('[SmartInput AI] background exception', {
            message: e?.message,
            name: e?.name,
        });
        return { error: e.message };
    }
}

function normalizeMcpUrl(value) {
    try {
        const url = new URL(typeof value === 'string' ? value.trim() : '');
        if (url.username || url.password) {
            return null;
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return null;
        }
        if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
            return null;
        }
        url.hash = '';
        url.search = '';
        url.pathname = url.pathname.replace(/\/+$/, '') || '/';
        return url.toString();
    } catch (e) {
        return null;
    }
}

function getMcpServerConfigs(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(server => server && typeof server === 'object' && server.url);
}

function isMcpRequestUrlAllowed(requestUrl, serverConfigs) {
    const normalizedRequestUrl = normalizeMcpUrl(requestUrl);
    if (!normalizedRequestUrl) {
        return false;
    }
    return getMcpServerConfigs(serverConfigs).some(server => {
        const normalizedServerUrl = normalizeMcpUrl(server.url);
        if (!normalizedServerUrl) {
            return false;
        }
        if (normalizedServerUrl === normalizedRequestUrl) {
            return true;
        }
        try {
            const serverUrl = new URL(normalizedServerUrl);
            const url = new URL(normalizedRequestUrl);
            return serverUrl.origin === url.origin;
        } catch (e) {
            return false;
        }
    });
}

async function handleMcpHttpRequestMessage(message, sender) {
    return handleMcpHttpRequest({
        message,
        sender,
        cacheConfigKey: CACHE_CONFIG.MCP_SERVERS?.key || 'mcp_servers',
        safeDebug,
    });
}

async function handleRuntimeMessage(message, sender) {
    if (message.action === 'launchWebAuthFlow') {
        return await handleLaunchWebAuthFlowMessage(message);
    }
    if (message.action === 'providerOAuthStart') {
        return await startProviderOAuth({ provider: message.provider });
    }
    if (isVscodeBackgroundAction(message.action)) {
        return await handleVscodeBackgroundMessage(message, {
            getSidCookieForTabId,
            listOrgSessionsFromTabs,
            requestPermission,
            openWorkbenchTab,
        });
    }
    if (['broadcastMessageToInjected', 'broadcastMessageToSidePanel'].includes(message.action)) {
        broadcastMessage(message, sender);
        return undefined;
    }
    if (message.action === OPEN_SIDE_PANEL) {
        toggleSideBar(sender.tab);
        return undefined;
    }
    if (message.action === 'fetchCookie') {
        return await getHostAndSession(sender.tab);
    }
    if (message.action === 'getDefaultContentScriptPatterns') {
        return {
            includePatterns: DEFAULT_INCLUDE_PATTERNS,
            excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
        };
    }
    if (message.action === MATCH_CONTENT_SCRIPT_URL) {
        const url = typeof message.url === 'string' ? message.url : '';
        if (!url || !normalizeUrlForPatternMatch(url)) {
            return { matches: false };
        }
        const matches = await isHostMatching(
            url,
            DEFAULT_INCLUDE_PATTERNS,
            DEFAULT_EXCLUDE_PATTERNS
        );
        return { matches };
    }
    if (message.action === 'toggleOverlay') {
        safeLog('[SF-TOOLKIT][BG] received toggleOverlay message', {
            enabled: message.enabled,
            from: sender?.url || sender?.tab?.url,
        });
        broadcastMessageToAllInjectedInstances({
            action: 'toggleOverlay',
            enabled: message.enabled,
        });
        return undefined;
    }
    if (message.action === 'findExistingSession') {
        return await findExistingSession({
            alias: message.alias,
            instanceUrl: message.instanceUrl,
        });
    }
    if (message.action === 'smartinput_enhance_single') {
        return await handleSmartInputMessage(message, sender);
    }
    if (message.action === 'mcp_http_request') {
        return await handleMcpHttpRequestMessage(message, sender);
    }
    if (message.action.startsWith('chrome_')) {
        return await handleChromeInteraction(message);
    }
    return undefined;
}

/** Chrome event registration. */
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.tabs.onActivated.addListener(handleTabActivated);
chrome.tabs.onRemoved.addListener(tabId => {
    openedSidePanelTabIds.delete(tabId);
    _lastSidePanelOptionsByTabId.delete(tabId);
});
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.runtime.onMessage.addListener(wrapAsyncFunction(handleRuntimeMessage));

// Capture the LLM-provider OAuth loopback redirect. Top-level + storage.session-backed so it
// survives service-worker suspension during a long user login. Filtered to the loopback host
// so it doesn't run on ordinary navigation.
chrome.webNavigation.onBeforeNavigate.addListener(
    details => {
        if (details.frameId !== 0) return;
        handleOAuthRedirect(details)
            .then(result => {
                if (!result) return;
                broadcastMessageToAllSidePanelInstances({
                    action: 'broadcastMessageToSidePanel',
                    payload: { type: 'oauth_signed_in', provider: result.provider },
                });
            })
            .catch(error => {
                broadcastMessageToAllSidePanelInstances({
                    action: 'broadcastMessageToSidePanel',
                    payload: { type: 'oauth_error', message: error?.message || 'Sign-in failed.' },
                });
            });
    },
    { url: [{ hostEquals: 'localhost' }, { hostEquals: '127.0.0.1' }] }
);

/** Extension lifecycle hooks. */
chrome.runtime.onStartup.addListener(() => {
    ensureContextMenu().catch(() => {});
});

chrome.runtime.onInstalled.addListener(async details => {
    safeLog('--> onInstalled', details);
    const currentVersion = chrome.runtime.getManifest().version;
    const previousVersion = details.previousVersion;
    const reason = details.reason;
    if (reason === 'install') {
        await chrome.storage.local.set({ installedVersion: currentVersion });
        chrome.tabs.create({
            url: `https://www.sf-workbench.com/welcome?redirect_url=${encodeURIComponent(chrome.runtime.getURL('views/app.html'))}`,
        });
    } else if (
        reason === 'update' &&
        previousVersion &&
        currentVersion &&
        compareMajorMinor(previousVersion, currentVersion)
    ) {
        chrome.tabs.create({ url: 'https://www.sf-workbench.com/app?applicationName=release' });
    }
    /* const isEnabled = await loadSingleExtensionConfigFromCache(CACHE_CONFIG.OVERLAY_ENABLED.key);
    if (!data.hasOwnProperty(OVERLAY_ENABLED_VAR)) {
        await saveSingleExtensionConfigToCache(CACHE_CONFIG.OVERLAY_ENABLED.key, true);
    } */
    await ensureContextMenu();
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
        chrome.sidePanel.setOptions({
            path: STABLE_SIDEPANEL_PATH,
            enabled: false,
        });
    }
    const data = await chrome.storage.local.get([
        'content_script_include_patterns',
        'content_script_exclude_patterns',
    ]);
    if (!data.content_script_include_patterns) {
        await chrome.storage.local.set({
            content_script_include_patterns: DEFAULT_INCLUDE_PATTERNS.join('\n'),
        });
    } else {
        // Remove the overly-broad "/lightning/" pattern that caused injection into
        // non-Salesforce pages (e.g. Okta SSO). All Salesforce Lightning URLs are
        // already covered by more specific domain patterns.
        const cleaned = data.content_script_include_patterns
            .split('\n')
            .filter(line => line.trim() !== '/lightning/')
            .join('\n');
        if (cleaned !== data.content_script_include_patterns) {
            await chrome.storage.local.set({ content_script_include_patterns: cleaned });
        }
    }
    if (!data.content_script_exclude_patterns) {
        await chrome.storage.local.set({
            content_script_exclude_patterns: DEFAULT_EXCLUDE_PATTERNS.join('\n'),
        });
    }
    await refreshContentScriptPatternsCache(DEFAULT_INCLUDE_PATTERNS, DEFAULT_EXCLUDE_PATTERNS);
});

chrome.commands.onCommand.addListener((command, tab) => {
    safeLog('command', command);
    if (command === OVERLAY_TOGGLE) {
        loadSingleExtensionConfigFromCache(CACHE_CONFIG.OVERLAY_ENABLED.key).then(isEnabled => {
            setOverlayState(!isEnabled);
        });
    } else if (command === OPEN_OVERLAY_SEARCH) {
    } else if (command === OPEN_SIDE_PANEL) {
        toggleSideBar(tab);
    }
});

/** Service worker bootstrap. */
const init = async () => {
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: false })
        .catch(error => console.error(error));
    chrome.sidePanel
        .setOptions({ path: STABLE_SIDEPANEL_PATH, enabled: false })
        .catch(error => console.error(error));
    ensureContextMenu().catch(() => {});
    refreshContentScriptPatternsCache(DEFAULT_INCLUDE_PATTERNS, DEFAULT_EXCLUDE_PATTERNS).catch(
        () => {}
    );
};

chrome.runtime.setUninstallURL('https://forms.gle/cd8SkEPe5RGTVijJA');

init();

/** Message fan-out helpers for connected extension surfaces. */
function broadcastMessageToAllInjectedInstances(message) {
    let count = 0;
    for (const port of injectedConnections) {
        try {
            port.postMessage(message);
            count++;
        } catch (e) {
            try {
                injectedConnections.delete(port);
            } catch (_) {}
        }
    }
    if (message?.action === 'toggleOverlay') {
        safeLog('[SF-TOOLKIT][BG] broadcastMessageToAllInjectedInstances', {
            action: message.action,
            enabled: message.enabled,
            sentTo: count,
        });
    }
}

function broadcastMessageToAllSidePanelInstances(message) {
    for (const port of sidePanelConnections) {
        try {
            port.postMessage(message);
        } catch (e) {
            try {
                sidePanelConnections.delete(port);
            } catch (_) {}
        }
    }
}

// Send to only the side panel connection associated with the provided tabId.
function sendMessageToSidePanelInTab(tabId, message) {
    let sent = false;
    for (const port of sidePanelConnections.values()) {
        const portTabId = sidePanelTabIdByPort.get(port);
        if (portTabId === tabId) {
            try {
                port.postMessage(message);
                sent = true;
            } catch (e) {
                try {
                    sidePanelConnections.delete(port);
                    sidePanelTabIdByPort.delete(port);
                } catch (_) {}
            }
        }
    }
    return sent;
}

// Send to only the injected connection that matches the provided tabId. Returns true if a port was found and messaged.
function sendMessageToInjectedInTab(tabId, message) {
    let sent = false;
    safeLog(
        '[BG] Attempting to send to injected in tab',
        tabId,
        'message.action=',
        message?.action
    );
    for (const port of injectedConnections.values()) {
        const portTabId = port && port.sender && port.sender.tab && port.sender.tab.id;
        if (portTabId === tabId) {
            safeLog('[BG] Found injected port for tab', tabId, '- sending message');
            try {
                port.postMessage(message);
            } catch (e) {
                try {
                    injectedConnections.delete(port);
                } catch (_) {}
                break;
            }
            sent = true;
            break;
        }
    }
    if (!sent) {
        safeLog('[BG] No injected port matched tab', tabId);
    }
    return sent;
}
