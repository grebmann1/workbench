function normalizeTextValue(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
}
function buildVscodeEditorSearchParams(seed) {
    const params = new URLSearchParams();
    if (seed.sessionId && seed.serverUrl) {
        params.set('sessionId', seed.sessionId);
        params.set('serverUrl', seed.serverUrl);
    }
    if (seed.alias) {
        params.set('alias', seed.alias);
    }
    if (seed.redirectUrl) {
        params.set('redirectUrl', seed.redirectUrl);
    }
    if (seed.sourceTabId) {
        params.set('sourceTabId', seed.sourceTabId);
    }
    if (seed.metadataType) {
        params.set('metadataType', seed.metadataType);
    }
    if (seed.memberName) {
        params.set('memberName', seed.memberName);
    }
    return params;
}
export function normalizeVscodeBootstrapSeed(seed = {}) {
    const sessionId = normalizeTextValue(seed.sessionId);
    const serverUrl = normalizeTextValue(seed.serverUrl);
    const hasSessionBootstrap = Boolean(sessionId && serverUrl);
    return {
        alias: normalizeTextValue(seed.alias),
        sessionId: hasSessionBootstrap ? sessionId : null,
        serverUrl: hasSessionBootstrap ? serverUrl : null,
        redirectUrl: normalizeTextValue(seed.redirectUrl),
        sourceTabId: normalizeTextValue(seed.sourceTabId),
        metadataType: normalizeTextValue(seed.metadataType),
        memberName: normalizeTextValue(seed.memberName),
    };
}
export function hasVscodeSessionBootstrap(seed = {}) {
    const normalizedSeed = normalizeVscodeBootstrapSeed(seed);
    return Boolean(normalizedSeed.sessionId && normalizedSeed.serverUrl);
}
export function hasVscodeAliasBootstrap(seed = {}) {
    return Boolean(normalizeVscodeBootstrapSeed(seed).alias);
}
export function hasVscodeExplicitBootstrap(seed = {}) {
    return hasVscodeSessionBootstrap(seed) || hasVscodeAliasBootstrap(seed);
}
export function hasVscodeBootstrapEntrySeed(seed = {}) {
    const normalizedSeed = normalizeVscodeBootstrapSeed(seed);
    return hasVscodeExplicitBootstrap(normalizedSeed) || Boolean(normalizedSeed.sourceTabId);
}
export function parseVscodeBootstrapSeed(search) {
    const params = typeof search === 'string'
        ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
        : search;
    return normalizeVscodeBootstrapSeed({
        alias: params.get('alias'),
        sessionId: params.get('sessionId'),
        serverUrl: params.get('serverUrl'),
        redirectUrl: params.get('redirectUrl'),
        sourceTabId: params.get('sourceTabId'),
        metadataType: params.get('metadataType'),
        memberName: params.get('memberName'),
    });
}
export function buildVscodeEditorUrl({ baseUrl, seed, baseOrigin = 'https://sf-toolkit.invalid', }) {
    const normalizedSeed = normalizeVscodeBootstrapSeed(seed);
    if (!hasVscodeExplicitBootstrap(normalizedSeed)) {
        return null;
    }
    const url = new URL(baseUrl, baseOrigin);
    url.search = buildVscodeEditorSearchParams(normalizedSeed).toString();
    return url.href;
}
//# sourceMappingURL=vscodeBootstrap.js.map