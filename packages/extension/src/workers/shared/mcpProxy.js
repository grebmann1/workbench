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

export async function handleMcpHttpRequest({
    message,
    sender,
    cacheConfigKey = 'mcp_servers',
    safeDebug = () => {},
}) {
    const senderUrl = sender?.url || '';
    const isExtensionPageSender =
        typeof senderUrl === 'string' && senderUrl.startsWith(chrome.runtime.getURL(''));
    if (!isExtensionPageSender) {
        safeDebug('[MCP] background rejected: untrusted sender');
        return { error: 'Untrusted sender' };
    }

    const requestUrl = typeof message?.url === 'string' ? message.url : '';
    const method = typeof message?.method === 'string' ? message.method.toUpperCase() : 'GET';
    const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    if (!requestUrl || !allowedMethods.has(method)) {
        return { error: 'Invalid MCP request' };
    }

    const storedConfig = await chrome.storage.local.get([cacheConfigKey]);
    if (!isMcpRequestUrlAllowed(requestUrl, storedConfig[cacheConfigKey])) {
        safeDebug('[MCP] background rejected: URL not configured', { requestUrl });
        return { error: 'MCP server URL is not configured' };
    }

    const headers =
        message?.headers && typeof message.headers === 'object' && !Array.isArray(message.headers)
            ? message.headers
            : {};
    const body = typeof message?.body === 'string' ? message.body : undefined;
    const timeoutMs =
        typeof message?.timeoutMs === 'number' && Number.isFinite(message.timeoutMs)
            ? Math.max(1000, Math.min(message.timeoutMs, 120000))
            : 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(requestUrl, {
            method,
            headers,
            body,
            redirect: 'error',
            signal: controller.signal,
        });
        const responseBody = await response.text();
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseBody,
        };
    } catch (e) {
        return { error: e?.message || String(e) };
    } finally {
        clearTimeout(timeoutId);
    }
}
