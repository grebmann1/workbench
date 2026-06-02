import { getCurrentTab, isEmpty } from 'shared/utils';

import { getSalesforceURL } from './base';
/*const getCurrentTab = async () => {
    let queryOptions = { active: true, lastFocusedWindow: true };
    // `tab` will either be a `tabs.Tab` instance or `undefined`.
    let [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}*/

// --- Salesforce Domain Regex Utilities ---

const getHostAndSession = async paramTab => {
    try {
        const tab = paramTab || (await getCurrentTab());
        if (!tab.url) return;
        let url = getSalesforceURL(tab.url);
        // Match Benchpress: omit storeId. Passing the wrong cookie store can return
        // a stale admin sid during Login As impersonation.
        let cookie = await chrome.cookies.get({ name: 'sid', url });
        if (!cookie || !cookie.value) {
            const newUrl = url.replace('soma', 'sfdcdev');
            cookie = await chrome.cookies.get({ name: 'sid', url: newUrl });
            url = newUrl;
        }
        if (cookie && cookie.value) {
            return {
                domain: url,
                session: cookie.value,
            };
        }
        return;
    } catch (e) {
        return;
    }
};

export { getHostAndSession, getCurrentTab };
