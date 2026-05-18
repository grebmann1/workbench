export function normalizeInstanceUrl(instanceUrl) {
    const raw = String(instanceUrl ?? '').trim();
    if (!raw) {
        return '';
    }
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withScheme.replace(/\/+$/, '');
}
export function normalizeProxyUrl(proxyUrl) {
    const raw = String(proxyUrl ?? '').trim();
    if (!raw) {
        return '';
    }
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return withScheme.replace(/\/+$/, '');
}
export function normalizeApiVersion(apiVersion, fallback = '63.0') {
    const value = String(apiVersion ?? '').trim();
    return value || String(fallback || '63.0').trim() || '63.0';
}
export function toSalesforcePath(urlOrPath, instanceUrl) {
    const raw = String(urlOrPath ?? '');
    if (/^https?:\/\//i.test(raw)) {
        try {
            const absoluteUrl = new URL(raw);
            const connectionUrl = new URL(instanceUrl);
            if (absoluteUrl.origin === connectionUrl.origin) {
                return `${absoluteUrl.pathname}${absoluteUrl.search}${absoluteUrl.hash}`;
            }
        }
        catch {
            // ignore URL parsing errors
        }
        throw new Error('Absolute URLs are not supported.');
    }
    if (raw.startsWith('/')) {
        return raw;
    }
    return `${raw.startsWith('?') ? '' : '/'}${raw}`;
}
export function buildFrontDoorUrl(baseFrontDoorUrl, retUrl) {
    const url = new URL(baseFrontDoorUrl);
    url.searchParams.set('retURL', retUrl);
    return url.toString();
}
export function buildSalesforceNavigationPath(args) {
    const { kind, object, id, filter, node, appApiName, path, absoluteUrl, instanceHost } = args;
    if (kind === 'record') {
        return `/lightning/r/${encodeURIComponent(String(object))}/${encodeURIComponent(String(id))}/view`;
    }
    if (kind === 'list') {
        const filterName = filter || '__Recent';
        return `/lightning/o/${encodeURIComponent(String(object))}/list?filterName=${encodeURIComponent(filterName)}`;
    }
    if (kind === 'setup') {
        return `/lightning/setup/${encodeURIComponent(String(node))}/home`;
    }
    if (kind === 'app') {
        return `/lightning/app/${encodeURIComponent(String(appApiName))}`;
    }
    if (kind === 'page') {
        const normalizedPath = String(path || '').trim();
        if (!normalizedPath.startsWith('/lightning/')) {
            throw new Error('sf open page requires --path starting with /lightning/.');
        }
        return normalizedPath;
    }
    const url = new URL(String(absoluteUrl));
    if (url.protocol !== 'https:') {
        throw new Error('sf open url only supports https URLs.');
    }
    if (url.host !== instanceHost) {
        throw new Error(`sf open url host mismatch. Expected ${instanceHost}, got ${url.host}.`);
    }
    url.searchParams.delete('sid');
    return `${url.pathname}${url.search}${url.hash}`;
}
//# sourceMappingURL=salesforceUrl.js.map