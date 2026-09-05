type AgentTab = {
    id?: number;
    title?: string;
    url?: string;
    active?: boolean;
    windowId?: number;
};

type ChromeTabsApi = {
    query: (queryInfo: Record<string, unknown>) => Promise<AgentTab[]>;
};

function getChromeTabsApi(): ChromeTabsApi | null {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
    return chrome.tabs as unknown as ChromeTabsApi;
}

/**
 * List tabs the agent can inspect.
 *
 * Chrome side panels are not tabbed windows, so `currentWindow: true` often
 * returns [] from this context. Prefer the last focused browser window, then
 * fall back to every tab.
 */
export async function queryTabsForAgent(
    tabsApi: ChromeTabsApi | null = getChromeTabsApi()
): Promise<AgentTab[]> {
    if (!tabsApi) return [];
    const lastFocused = await tabsApi.query({ lastFocusedWindow: true });
    if (lastFocused.length > 0) return lastFocused;
    return tabsApi.query({});
}

/**
 * Resolve the user's visible tab. Same lastFocusedWindow-first rule as
 * `getCurrentTab()` elsewhere in the extension.
 */
export async function queryActiveTabForAgent(
    tabsApi: ChromeTabsApi | null = getChromeTabsApi()
): Promise<AgentTab | null> {
    if (!tabsApi) return null;
    const [tab] = await tabsApi.query({ active: true, lastFocusedWindow: true });
    if (tab?.id != null) return tab;
    const [fallback] = await tabsApi.query({ active: true });
    return fallback ?? null;
}

export function mapTabForSandbox(tab: AgentTab) {
    return {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: !!tab.active,
    };
}
