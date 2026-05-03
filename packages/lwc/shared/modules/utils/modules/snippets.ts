/**
 * API request → code-snippet generators.
 *
 * Kept pure so the same snippet strings can be rendered from the app UI, the
 * agent tool (to show the user what would be sent), or the desktop CLI.
 *
 * The input shape matches the output of {@link formatApiRequest}; callers pass
 * the already-resolved request rather than the raw tab state so snippets
 * reflect what will actually be executed (variables substituted, headers
 * merged).
 */

import { isUndefinedOrNull } from '../validation';

export type SnippetRequest = {
    method: string;
    url: string;
    endpoint?: string;
    body?: string;
    headers?: Record<string, string>;
};

export type SnippetLanguage = 'apex' | 'curl' | 'jsforce' | 'fetch' | 'python' | 'powershell';

export type SnippetOptions = {
    /**
     * Header names (case-insensitive) whose values should be replaced with a
     * placeholder inside the generated snippet. Defaults pre-populated with
     * the obvious ones — override to extend.
     */
    redactHeaders?: readonly string[];
};

const DEFAULT_REDACT_HEADERS = ['authorization', 'cookie', 'x-api-key'] as const;

const apexStringLiteral = (value: unknown): string => {
    const s = String(value ?? '');
    return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};

const escapeBashSingleQuoted = (value: unknown): string =>
    String(value ?? '').replace(/'/g, `'\"'\"'`);

export const sanitizeHeadersForSnippet = (
    headers: Record<string, string> | undefined | null,
    redact: readonly string[] = DEFAULT_REDACT_HEADERS
): Record<string, string> => {
    const redactLower = new Set(redact.map(h => h.toLowerCase()));
    const out: Record<string, string> = { ...(headers || {}) };
    Object.keys(out).forEach(k => {
        if (redactLower.has(String(k).toLowerCase())) {
            // Preserve Bearer-prefix for Authorization so the snippet still
            // demonstrates the expected format.
            if (k.toLowerCase() === 'authorization') {
                out[k] = 'Bearer {sessionId}';
            } else {
                out[k] = '{redacted}';
            }
        }
    });
    return out;
};

export const apexSnippet = (req: SnippetRequest, opts: SnippetOptions = {}): string => {
    if (isUndefinedOrNull(req) || !req.url) return '/* Unable to format request */';
    const headers = sanitizeHeadersForSnippet(req.headers, opts.redactHeaders);
    const lines: string[] = [];
    lines.push('HttpRequest req = new HttpRequest();');
    lines.push(`req.setMethod(${apexStringLiteral(req.method || 'GET')});`);
    lines.push(`req.setEndpoint(${apexStringLiteral(req.url)});`);
    Object.keys(headers).forEach(key => {
        const val = headers[key];
        if (isUndefinedOrNull(val)) return;
        lines.push(`req.setHeader(${apexStringLiteral(key)}, ${apexStringLiteral(val)});`);
    });
    if (req.body && String(req.body).length > 0) {
        lines.push(`req.setBody(${apexStringLiteral(req.body)});`);
    }
    lines.push('Http http = new Http();');
    lines.push('HTTPResponse res = http.send(req);');
    lines.push("System.debug('Status=' + res.getStatus());");
    lines.push('System.debug(res.getBody());');
    return lines.join('\n');
};

export const curlSnippet = (req: SnippetRequest, opts: SnippetOptions = {}): string => {
    if (isUndefinedOrNull(req) || !req.url) return '# Unable to format request';
    const headers = sanitizeHeadersForSnippet(req.headers, opts.redactHeaders);
    const parts: string[] = [];
    parts.push(`curl -X ${req.method || 'GET'} '${escapeBashSingleQuoted(req.url)}'`);
    Object.keys(headers).forEach(key => {
        const val = headers[key];
        if (isUndefinedOrNull(val) || key.length === 0) return;
        parts.push(`  -H '${escapeBashSingleQuoted(`${key}: ${val}`)}'`);
    });
    if (req.body && String(req.body).length > 0) {
        parts.push(`  --data-raw '${escapeBashSingleQuoted(req.body)}'`);
    }
    return parts.join(' \\\n');
};

export const jsforceSnippet = (req: SnippetRequest, opts: SnippetOptions = {}): string => {
    if (isUndefinedOrNull(req) || !req.url) return '/* Unable to format request */';

    let instanceUrl = '';
    try {
        instanceUrl = new URL(req.url).origin;
    } catch {
        instanceUrl = '';
    }

    const headers = sanitizeHeadersForSnippet(req.headers, opts.redactHeaders);
    const endpoint = req.endpoint || '/';
    const method = req.method || 'GET';

    let bodyLine = '';
    if (req.body && String(req.body).length > 0) {
        try {
            const obj = JSON.parse(req.body);
            bodyLine = `  body: ${JSON.stringify(obj, null, 2).split('\n').join('\n  ')},\n`;
        } catch {
            bodyLine = `  body: ${JSON.stringify(String(req.body))},\n`;
        }
    }

    const headerLines = Object.keys(headers)
        .filter(k => k.length > 0 && !isUndefinedOrNull(headers[k]))
        .map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(String(headers[k]))}`)
        .join(',\n');

    return [
        "const jsforce = require('jsforce');",
        '',
        'const conn = new jsforce.Connection({',
        `  instanceUrl: ${JSON.stringify(instanceUrl || 'https://yourInstance.my.salesforce.com')},`,
        "  accessToken: '{sessionId}',",
        '});',
        '',
        'conn.request({',
        `  method: ${JSON.stringify(method)},`,
        `  url: ${JSON.stringify(endpoint)},`,
        headerLines ? `  headers: {\n${headerLines}\n  },\n` : '',
        bodyLine,
        '}).then((res) => {',
        '  console.log(res);',
        '}).catch((err) => {',
        '  console.error(err);',
        '});',
    ]
        .filter(Boolean)
        .join('\n');
};

export const fetchSnippet = (req: SnippetRequest, opts: SnippetOptions = {}): string => {
    if (isUndefinedOrNull(req) || !req.url) return '/* Unable to format request */';
    const headers = sanitizeHeadersForSnippet(req.headers, opts.redactHeaders);
    const method = req.method || 'GET';
    const init: Record<string, unknown> = { method };
    if (Object.keys(headers).length > 0) init.headers = headers;
    if (req.body && String(req.body).length > 0) init.body = req.body;
    const initStr = JSON.stringify(init, null, 2).split('\n').join('\n');
    return [
        `const res = await fetch(${JSON.stringify(req.url)}, ${initStr});`,
        'console.log(res.status);',
        'console.log(await res.text());',
    ].join('\n');
};

export const pythonSnippet = (req: SnippetRequest, opts: SnippetOptions = {}): string => {
    if (isUndefinedOrNull(req) || !req.url) return '# Unable to format request';
    const headers = sanitizeHeadersForSnippet(req.headers, opts.redactHeaders);
    const method = (req.method || 'GET').toLowerCase();
    const headerDict =
        Object.keys(headers).length > 0
            ? JSON.stringify(headers, null, 2)
                  .split('\n')
                  .map((l, i) => (i === 0 ? l : '    ' + l))
                  .join('\n')
            : '{}';
    const lines: string[] = ['import requests', ''];
    lines.push(`url = ${JSON.stringify(req.url)}`);
    lines.push(`headers = ${headerDict}`);
    if (req.body && String(req.body).length > 0) {
        lines.push(`data = ${JSON.stringify(req.body)}`);
        lines.push(`res = requests.${method}(url, headers=headers, data=data)`);
    } else {
        lines.push(`res = requests.${method}(url, headers=headers)`);
    }
    lines.push('print(res.status_code)');
    lines.push('print(res.text)');
    return lines.join('\n');
};

export const powershellSnippet = (req: SnippetRequest, opts: SnippetOptions = {}): string => {
    if (isUndefinedOrNull(req) || !req.url) return '# Unable to format request';
    const headers = sanitizeHeadersForSnippet(req.headers, opts.redactHeaders);
    const method = req.method || 'GET';
    const parts: string[] = [];
    const hashtable = Object.keys(headers)
        .map(k => `    ${JSON.stringify(k)} = ${JSON.stringify(headers[k])}`)
        .join('\n');
    parts.push(`$headers = @{`);
    if (hashtable) parts.push(hashtable);
    parts.push(`}`);
    if (req.body && String(req.body).length > 0) {
        parts.push(`$body = ${JSON.stringify(req.body)}`);
        parts.push(
            `Invoke-RestMethod -Uri ${JSON.stringify(req.url)} -Method ${method} -Headers $headers -Body $body`
        );
    } else {
        parts.push(
            `Invoke-RestMethod -Uri ${JSON.stringify(req.url)} -Method ${method} -Headers $headers`
        );
    }
    return parts.join('\n');
};

const GENERATORS: Record<SnippetLanguage, (req: SnippetRequest, opts: SnippetOptions) => string> = {
    apex: apexSnippet,
    curl: curlSnippet,
    jsforce: jsforceSnippet,
    fetch: fetchSnippet,
    python: pythonSnippet,
    powershell: powershellSnippet,
};

export const generateSnippet = (
    language: SnippetLanguage,
    req: SnippetRequest,
    opts: SnippetOptions = {}
): string => {
    const fn = GENERATORS[language];
    if (!fn) return '';
    return fn(req, opts);
};

export const SNIPPET_LANGUAGES: readonly SnippetLanguage[] = Object.freeze([
    'apex',
    'curl',
    'jsforce',
    'fetch',
    'python',
    'powershell',
]);
