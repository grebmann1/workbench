export function normalizeInstanceUrl(instanceUrl: unknown) {
    const raw = String(instanceUrl ?? '').trim();
    if (!raw) {
        return '';
    }
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withScheme.replace(/\/+$/, '');
}

export function normalizeProxyUrl(proxyUrl: unknown) {
    const raw = String(proxyUrl ?? '').trim();
    if (!raw) {
        return '';
    }
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return withScheme.replace(/\/+$/, '');
}

export function normalizeApiVersion(apiVersion: unknown, fallback = '63.0') {
    const value = String(apiVersion ?? '').trim();
    return value || String(fallback || '63.0').trim() || '63.0';
}

export function toSalesforcePath(urlOrPath: unknown, instanceUrl: string) {
    const raw = String(urlOrPath ?? '');
    if (/^https?:\/\//i.test(raw)) {
        try {
            const absoluteUrl = new URL(raw);
            const connectionUrl = new URL(instanceUrl);
            if (absoluteUrl.origin === connectionUrl.origin) {
                return `${absoluteUrl.pathname}${absoluteUrl.search}${absoluteUrl.hash}`;
            }
        } catch {
            // ignore URL parsing errors
        }
        throw new Error('Absolute URLs are not supported.');
    }
    if (raw.startsWith('/')) {
        return raw;
    }
    return `${raw.startsWith('?') ? '' : '/'}${raw}`;
}

export type SalesforceOpenKind = 'record' | 'list' | 'setup' | 'app' | 'page' | 'url';

export function buildFrontDoorUrl(baseFrontDoorUrl: string, retUrl: string) {
    const url = new URL(baseFrontDoorUrl);
    url.searchParams.set('retURL', retUrl);
    return url.toString();
}

export function buildSalesforceNavigationPath(args: {
    kind: SalesforceOpenKind;
    object?: string;
    id?: string;
    filter?: string;
    node?: string;
    appApiName?: string;
    path?: string;
    absoluteUrl?: string;
    instanceHost: string;
}) {
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

// The alphabet used to encode the 3-character case-checksum suffix of an
// 18-character Salesforce ID. Each check char packs the upper/lower case of 5
// characters of the 15-char base into a 5-bit value (0-31).
const SF_ID_CHECKSUM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

function computeSalesforceIdChecksum(id15: string): string {
    let suffix = '';
    for (let chunk = 0; chunk < 3; chunk++) {
        let value = 0;
        for (let i = 0; i < 5; i++) {
            const c = id15.charAt(chunk * 5 + i);
            if (c >= 'A' && c <= 'Z') {
                value += 1 << i;
            }
        }
        suffix += SF_ID_CHECKSUM_ALPHABET.charAt(value);
    }
    return suffix;
}

/**
 * Validate a Salesforce record ID.
 *
 * - 15-char IDs are accepted on structure alone (they carry no checksum).
 * - 18-char IDs must additionally match their case-insensitive checksum
 *   suffix, which makes false positives on arbitrary alphanumeric tokens
 *   effectively impossible — this is what makes bare-ID auto-linking safe.
 */
export function isValidSalesforceId(value: unknown): boolean {
    const id = String(value ?? '');
    if (/^[a-zA-Z0-9]{15}$/.test(id)) {
        return true;
    }
    if (/^[a-zA-Z0-9]{18}$/.test(id)) {
        return computeSalesforceIdChecksum(id.slice(0, 15)) === id.slice(15).toUpperCase();
    }
    return false;
}

/**
 * Build a classic-redirect URL for a record ID: `{instanceUrl}/{id}`.
 * Salesforce resolves the object type server-side, so this works for any
 * object without needing its API name. Returns null for invalid input.
 */
export function buildRecordRedirectUrl(instanceUrl: unknown, id: unknown): string | null {
    const base = normalizeInstanceUrl(instanceUrl);
    if (!base || !isValidSalesforceId(id)) {
        return null;
    }
    return `${base}/${String(id)}`;
}

/**
 * Resolve an agent-emitted `sfrecord:` / `sfobject:` pseudo-href into a real
 * absolute Salesforce URL. Returns null when it can't be resolved.
 *
 * - `sfrecord:/{id}`             → `{base}/{id}` (classic redirect)
 * - `sfrecord:/{Object}/{id}`    → `{base}/lightning/r/{Object}/{id}/view`
 * - `sfobject:/{ApiName}`        → `{base}/lightning/o/{ApiName}/list`
 */
export function resolveSalesforceLinkHref(rawHref: unknown, instanceUrl: unknown): string | null {
    const href = String(rawHref ?? '').trim();
    const base = normalizeInstanceUrl(instanceUrl);
    if (!base || !href) {
        return null;
    }

    if (href.startsWith('sfrecord:')) {
        const segments = href.slice('sfrecord:'.length).split('/').filter(Boolean);
        if (segments.length === 0) {
            return null;
        }
        const id = segments[segments.length - 1];
        if (!isValidSalesforceId(id)) {
            return null;
        }
        if (segments.length === 1) {
            return `${base}/${id}`;
        }
        return `${base}${buildSalesforceNavigationPath({
            kind: 'record',
            object: segments[0],
            id,
            instanceHost: '',
        })}`;
    }

    if (href.startsWith('sfobject:')) {
        const object = href.slice('sfobject:'.length).split('/').filter(Boolean)[0];
        if (!object) {
            return null;
        }
        return `${base}${buildSalesforceNavigationPath({
            kind: 'list',
            object,
            instanceHost: '',
        })}`;
    }

    return null;
}
