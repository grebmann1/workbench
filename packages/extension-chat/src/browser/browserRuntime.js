import { BROWSER_LIMITS } from './constants.js';
import { runPageOperation } from './pageRuntime.js';

export function validateBrowserUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('Use a complete HTTP or HTTPS URL.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Only HTTP and HTTPS pages without embedded credentials are supported.');
    }
    if (
        url.hostname === 'chromewebstore.google.com' ||
        (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
    ) {
        throw new Error(
            'Chrome protects the Web Store from browser automation. Choose another tab.'
        );
    }
    return url.href;
}

export async function listBrowserTabs(api = globalThis.chrome) {
    if (!api?.tabs?.query || !api?.scripting?.executeScript) return [];
    const tabs = await api.tabs.query({ currentWindow: true });
    return tabs
        .filter(tab => {
            try {
                validateBrowserUrl(tab.url);
                return Number.isInteger(tab.id);
            } catch {
                return false;
            }
        })
        .map(({ id, title, url, active, status }) => ({ id, title, url, active, status }));
}

/** A session is captured per run, so switching tabs cannot redirect an in-flight action. */
export function createBrowserSession(tabId, api = globalThis.chrome) {
    let snapshot;
    let queue = Promise.resolve();
    async function execute(action, input, signal) {
        signal?.throwIfAborted();
        if (!Number.isInteger(tabId)) throw new Error('Choose a Browser target tab first.');
        const tab = await api.tabs.get(tabId);
        validateBrowserUrl(tab.url);
        signal?.throwIfAborted();
        if (action === 'navigate') {
            snapshot = undefined;
            if (input.direction === 'back') await api.tabs.goBack(tabId);
            else if (input.direction === 'forward') await api.tabs.goForward(tabId);
            else await api.tabs.update(tabId, { url: validateBrowserUrl(input.url) });
            return {
                tabId,
                status: 'Navigation requested. Take a fresh browser_snapshot after the page loads.',
            };
        }
        if (tab.status === 'loading')
            throw new Error('The page is loading. Take a fresh browser_snapshot when it finishes.');
        const isRead = action === 'snapshot';
        if (
            !isRead &&
            (!snapshot || snapshot.url !== tab.url || snapshot.snapshotId !== input.snapshotId)
        ) {
            throw new Error('The page or snapshot changed. Take a fresh browser_snapshot.');
        }
        const target = isRead
            ? { tabId, frameIds: [0] }
            : { tabId, documentIds: [snapshot.documentId] };
        if (!isRead) snapshot = undefined;
        const results = await api.scripting.executeScript({
            target,
            world: 'ISOLATED',
            func: runPageOperation,
            args: [{ ...input, action, limits: BROWSER_LIMITS }],
        });
        signal?.throwIfAborted();
        const result = results[0];
        if (!result?.result || !result.documentId)
            throw new Error('The page changed during the operation. Inspect it before retrying.');
        snapshot = { ...result.result, documentId: result.documentId };
        return { tabId, ...result.result, contentTrust: 'untrusted page content' };
    }
    return {
        run(action, input = {}, signal) {
            const result = queue.then(() => execute(action, input, signal));
            queue = result.catch(() => {});
            return result;
        },
    };
}
