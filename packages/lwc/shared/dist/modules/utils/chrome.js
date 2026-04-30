import { isChromeExtension } from './env';
import { buildVscodeEditorUrl, hasVscodeAliasBootstrap, hasVscodeBootstrapEntrySeed, hasVscodeExplicitBootstrap, hasVscodeSessionBootstrap, normalizeVscodeBootstrapSeed, parseVscodeBootstrapSeed, } from './vscodeBootstrap';
const buildRedirectUrl = ({ baseUrl, alias, redirectUrl, sessionId, serverUrl, }) => {
    const params = new URLSearchParams();
    if (alias) {
        params.append('alias', alias);
    }
    else if (sessionId) {
        params.append('sessionId', sessionId);
        params.append('serverUrl', serverUrl || '');
    }
    if (redirectUrl) {
        params.append('redirectUrl', redirectUrl);
    }
    const url = new URL(baseUrl);
    url.search = params.toString();
    return url.href;
};
export { hasVscodeAliasBootstrap, hasVscodeBootstrapEntrySeed, hasVscodeExplicitBootstrap, hasVscodeSessionBootstrap, normalizeVscodeBootstrapSeed, parseVscodeBootstrapSeed, };
export async function getAllOrgs(debugMode = false) {
    if (debugMode) {
        return [
            {
                id: 'DEMO-B2C',
                username: 'DEMO-B2C@test.com',
                company: 'DEMO',
                name: 'B2C',
                alias: 'DEMO-B2C',
            },
        ];
    }
    const response = await window.electron?.invoke('org-getAllOrgs');
    const res = Array.isArray(response) ? response : [];
    const sorted = res.sort((a, b) => a.alias.localeCompare(b.alias));
    const mapped = sorted.map(item => {
        const aliasParts = item.alias.split('-');
        return {
            ...item,
            id: item.alias,
            username: item.value ?? '',
            company: `${aliasParts.length > 1 ? aliasParts.shift() : ''}`.toUpperCase(),
            name: aliasParts.pop() ?? item.alias,
        };
    });
    return mapped;
}
export const redirectToUrlViaChrome = ({ baseUrl, alias, redirectUrl, sessionId, serverUrl, isNewTab, }) => {
    const url = buildRedirectUrl({ baseUrl, alias, redirectUrl, sessionId, serverUrl });
    if (isNewTab) {
        window.open(url, '_blank');
    }
    else {
        window.open(url);
    }
};
export const getVscodeEditorUrl = (seed) => {
    const baseUrl = typeof chrome !== 'undefined' && typeof chrome.runtime?.getURL === 'function'
        ? chrome.runtime.getURL('/views/vscode.html')
        : '/views/vscode.html';
    return buildVscodeEditorUrl({
        baseUrl,
        seed,
        baseOrigin: typeof window !== 'undefined' ? window.location.origin : 'https://sf-toolkit.invalid',
    });
};
export async function getCurrentTab() {
    if (!isChromeExtension() || !chrome.tabs?.query)
        return null;
    const queryOptions = { active: true, lastFocusedWindow: true };
    // `tab` will either be a `tabs.Tab` instance or `undefined`.
    const [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}
export const refreshCurrentTab = () => {
    const tabs = chrome.tabs;
    if (!isChromeExtension() || !tabs?.query || !tabs?.reload)
        return;
    tabs.query({ active: true, currentWindow: true }, function (result) {
        tabs.reload(result[0]?.id);
    });
};
//# sourceMappingURL=chrome.js.map