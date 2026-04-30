import {
    normalizeApiVersion,
    normalizeInstanceUrl,
    normalizeProxyUrl,
    toSalesforcePath,
} from 'shared/salesforceUrl';
import type { JsforceConnection, HttpRequestOptions } from 'shared/types';
import { HttpError } from 'shared/types';
import { isRecord } from 'shared/utils';

/** Options accepted when constructing the tooling client. */
export type CreateToolingClientOptions = {
    instanceUrl?: string;
    accessToken?: string;
    apiVersion?: string;
    proxyUrl?: string;
    connection?: JsforceConnection;
    connector?: { conn?: JsforceConnection | null };
};

type RequestOptions = HttpRequestOptions;

/** @deprecated Subclass retained for callers that still reference the name; prefer {@link HttpError}. */
class SalesforceApiError extends HttpError {
    constructor(message: string, status: number, payload: unknown) {
        super(message, status, payload);
        this.name = 'SalesforceApiError';
    }
}

function formatSfError(status: number, payload: unknown) {
    const details = Array.isArray(payload) ? payload[0] : payload;
    const d = isRecord(details) ? details : null;
    const message = d?.message || d?.error || d?.error_description;
    const code = d?.errorCode || d?.error_code;
    const suffix = [code, message].filter(Boolean).join(': ');
    return `Salesforce API error (${status})${suffix ? ` - ${suffix}` : ''}`;
}

function isLikelyCorsOrNetworkError(err: unknown) {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
        err.name === 'TypeError' &&
        (msg.includes('failed to fetch') ||
            msg.includes('load failed') ||
            msg.includes('networkerror'))
    );
}

export function createToolingClient(options: CreateToolingClientOptions = {}) {
    const { instanceUrl, accessToken, apiVersion, proxyUrl } = options;
    const jsforceConnection: JsforceConnection | null =
        options.connection || options.connector?.conn || null;

    if (jsforceConnection) {
        if (!jsforceConnection.request || !jsforceConnection.tooling?.query) {
            throw new Error('jsforce connection is missing required request/tooling methods.');
        }
        const normalizedInstanceUrl = normalizeInstanceUrl(
            instanceUrl || jsforceConnection.instanceUrl
        );
        const normalizedApiVersion = normalizeApiVersion(apiVersion || jsforceConnection.version);

        const buildRequestOptions = (
            upstreamPath: string,
            { method = 'GET', body, headers }: RequestOptions
        ) => ({
            method,
            url: upstreamPath,
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                ...(body ? { 'Content-Type': 'application/json' } : null),
                ...(headers || null),
            },
        });

        const resolveUpstreamPath = (urlOrPath: string) => {
            const path = toSalesforcePath(urlOrPath, normalizedInstanceUrl);
            return path.startsWith('/services/data/')
                ? path
                : `/services/data/v${normalizedApiVersion}${path}`;
        };

        const requestJson = async (urlOrPath: string, options: RequestOptions = {}) => {
            const upstreamPath = resolveUpstreamPath(urlOrPath);
            return await jsforceConnection.request!(buildRequestOptions(upstreamPath, options));
        };

        const requestText = async (urlOrPath: string, options: RequestOptions = {}) => {
            const upstreamPath = resolveUpstreamPath(urlOrPath);
            const response = await jsforceConnection.request!(
                buildRequestOptions(upstreamPath, options)
            );
            return typeof response === 'string' ? response : JSON.stringify(response ?? '');
        };

        const toolingQueryAll = async (soql: string) => {
            const queryExec = jsforceConnection.tooling!.query(soql);
            return (
                (await queryExec.run({
                    responseTarget: 'Records',
                    autoFetch: true,
                    maxFetch: 100000,
                })) || []
            );
        };

        return {
            instanceUrl: normalizedInstanceUrl,
            apiVersion: normalizedApiVersion,
            proxyUrl: null as string | null, // widen literal type for interface compatibility
            requestJson,
            requestText,
            toolingQueryAll,
            async ping() {
                await toolingQueryAll('SELECT Id FROM ApexClass LIMIT 1');
                return true;
            },
            async listApexClasses() {
                return await toolingQueryAll('SELECT Id, Name FROM ApexClass ORDER BY Name');
            },
            async listApexTriggers() {
                return await toolingQueryAll('SELECT Id, Name FROM ApexTrigger ORDER BY Name');
            },
            async getApexClassBody(id: string) {
                const rows = await toolingQueryAll(
                    `SELECT Id, Name, Body FROM ApexClass WHERE Id='${id}'`
                );
                return rows?.[0] || null;
            },
            async getApexTriggerBody(id: string) {
                const rows = await toolingQueryAll(
                    `SELECT Id, Name, Body FROM ApexTrigger WHERE Id='${id}'`
                );
                return rows?.[0] || null;
            },
            async listLwcBundles() {
                return await toolingQueryAll(
                    'SELECT Id, DeveloperName, NamespacePrefix FROM LightningComponentBundle ORDER BY DeveloperName'
                );
            },
            async listLwcResources(bundleId: string) {
                return await toolingQueryAll(
                    `SELECT Id, FilePath, Format FROM LightningComponentResource WHERE LightningComponentBundleId='${bundleId}' ORDER BY FilePath`
                );
            },
            async getLwcResourceSource(id: string) {
                const rows = await toolingQueryAll(
                    `SELECT Id, FilePath, Format, Source FROM LightningComponentResource WHERE Id='${id}'`
                );
                return rows?.[0] || null;
            },
            async listAuraBundles() {
                return await toolingQueryAll(
                    'SELECT Id, DeveloperName, NamespacePrefix FROM AuraDefinitionBundle ORDER BY DeveloperName'
                );
            },
            async listAuraDefinitions(bundleId: string) {
                return await toolingQueryAll(
                    `SELECT Id, DefType, Format FROM AuraDefinition WHERE AuraDefinitionBundleId='${bundleId}' ORDER BY DefType`
                );
            },
            async getAuraDefinitionSource(id: string) {
                const rows = await toolingQueryAll(
                    `SELECT Id, DefType, Format, Source FROM AuraDefinition WHERE Id='${id}'`
                );
                return rows?.[0] || null;
            },
        };
    }

    const normalizedInstanceUrl = normalizeInstanceUrl(instanceUrl);
    const normalizedApiVersion = normalizeApiVersion(apiVersion);
    const normalizedProxyUrl = normalizeProxyUrl(proxyUrl);
    const token = (accessToken ?? '').trim();

    if (!normalizedInstanceUrl) {
        throw new Error('Missing Instance URL.');
    }
    if (!token) {
        throw new Error('Missing Access Token.');
    }

    const proxyBase = normalizedProxyUrl ? `${normalizedProxyUrl}/proxy` : '';

    async function requestJson(
        urlOrPath: string,
        { method = 'GET', body, headers, signal }: RequestOptions = {}
    ) {
        const path = toSalesforcePath(urlOrPath, normalizedInstanceUrl);
        const upstreamPath = path.startsWith('/services/data/')
            ? path
            : `/services/data/v${normalizedApiVersion}${path}`;
        const upstreamUrl = `${normalizedInstanceUrl}${upstreamPath}`;
        const url = normalizedProxyUrl ? `${proxyBase}${upstreamPath}` : upstreamUrl;

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    ...(normalizedProxyUrl ? { 'Salesforceproxy-Endpoint': upstreamUrl } : null),
                    Authorization: `Bearer ${token}`,
                    ...(body ? { 'Content-Type': 'application/json' } : null),
                    ...(headers || null),
                },
                body: body ? JSON.stringify(body) : undefined,
                signal,
            });

            const text = await res.text();
            const json = text
                ? (() => {
                      try {
                          return JSON.parse(text);
                      } catch {
                          return null;
                      }
                  })()
                : null;

            if (!res.ok) {
                throw new SalesforceApiError(
                    formatSfError(res.status, json ?? text),
                    res.status,
                    json ?? text
                );
            }

            return json;
        } catch (err) {
            if (isLikelyCorsOrNetworkError(err)) {
                if (normalizedProxyUrl) {
                    throw new Error(
                        `Unable to reach local proxy at ${normalizedProxyUrl}. ` +
                            'Start it (npm run sf:proxy) and retry.'
                    );
                }
                throw new Error(
                    'Network/CORS error calling Salesforce. ' +
                        'Add this app origin to Setup → CORS in your org, then retry, ' +
                        'or enable the local proxy.'
                );
            }
            throw err;
        }
    }

    async function requestText(
        urlOrPath: string,
        { method = 'GET', body, headers, signal }: RequestOptions = {}
    ) {
        const path = toSalesforcePath(urlOrPath, normalizedInstanceUrl);
        const upstreamPath = path.startsWith('/services/data/')
            ? path
            : `/services/data/v${normalizedApiVersion}${path}`;
        const upstreamUrl = `${normalizedInstanceUrl}${upstreamPath}`;
        const url = normalizedProxyUrl ? `${proxyBase}${upstreamPath}` : upstreamUrl;

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    ...(normalizedProxyUrl ? { 'Salesforceproxy-Endpoint': upstreamUrl } : null),
                    Authorization: `Bearer ${token}`,
                    ...(body ? { 'Content-Type': 'application/json' } : null),
                    ...(headers || null),
                },
                body: body ? JSON.stringify(body) : undefined,
                signal,
            });

            const text = await res.text();
            if (!res.ok) {
                throw new SalesforceApiError(formatSfError(res.status, text), res.status, text);
            }
            return text;
        } catch (err) {
            if (isLikelyCorsOrNetworkError(err)) {
                if (normalizedProxyUrl) {
                    throw new Error(
                        `Unable to reach local proxy at ${normalizedProxyUrl}. ` +
                            'Start it (npm run sf:proxy) and retry.'
                    );
                }
                throw new Error(
                    'Network/CORS error calling Salesforce. ' +
                        'Add this app origin to Setup → CORS in your org, then retry, ' +
                        'or enable the local proxy.'
                );
            }
            throw err;
        }
    }

    async function toolingQueryAll(soql: string) {
        const first = await requestJson(`/tooling/query?q=${encodeURIComponent(soql)}`);
        const firstRecord = isRecord(first) ? first : {};
        const out = [...(Array.isArray(firstRecord.records) ? firstRecord.records : [])];
        let nextUrl =
            typeof firstRecord.nextRecordsUrl === 'string' ? firstRecord.nextRecordsUrl : undefined;
        while (nextUrl) {
            // eslint-disable-next-line no-await-in-loop
            const page = await requestJson(nextUrl);
            const pageRecord = isRecord(page) ? page : {};
            out.push(...(Array.isArray(pageRecord.records) ? pageRecord.records : []));
            nextUrl =
                typeof pageRecord.nextRecordsUrl === 'string'
                    ? pageRecord.nextRecordsUrl
                    : undefined;
        }
        return out;
    }

    return {
        instanceUrl: normalizedInstanceUrl,
        apiVersion: normalizedApiVersion,
        proxyUrl: (normalizedProxyUrl || null) as string | null,

        requestJson,
        requestText,
        toolingQueryAll,

        async ping() {
            await toolingQueryAll('SELECT Id FROM ApexClass LIMIT 1');
            return true;
        },

        async listApexClasses() {
            return await toolingQueryAll('SELECT Id, Name FROM ApexClass ORDER BY Name');
        },

        async listApexTriggers() {
            return await toolingQueryAll('SELECT Id, Name FROM ApexTrigger ORDER BY Name');
        },

        async getApexClassBody(id: string) {
            const rows = await toolingQueryAll(
                `SELECT Id, Name, Body FROM ApexClass WHERE Id='${id}'`
            );
            return rows?.[0] || null;
        },

        async getApexTriggerBody(id: string) {
            const rows = await toolingQueryAll(
                `SELECT Id, Name, Body FROM ApexTrigger WHERE Id='${id}'`
            );
            return rows?.[0] || null;
        },

        async listLwcBundles() {
            return await toolingQueryAll(
                'SELECT Id, DeveloperName, NamespacePrefix FROM LightningComponentBundle ORDER BY DeveloperName'
            );
        },

        async listLwcResources(bundleId: string) {
            return await toolingQueryAll(
                `SELECT Id, FilePath, Format FROM LightningComponentResource WHERE LightningComponentBundleId='${bundleId}' ORDER BY FilePath`
            );
        },

        async getLwcResourceSource(id: string) {
            const rows = await toolingQueryAll(
                `SELECT Id, FilePath, Format, Source FROM LightningComponentResource WHERE Id='${id}'`
            );
            return rows?.[0] || null;
        },

        async listAuraBundles() {
            return await toolingQueryAll(
                'SELECT Id, DeveloperName, NamespacePrefix FROM AuraDefinitionBundle ORDER BY DeveloperName'
            );
        },

        async listAuraDefinitions(bundleId: string) {
            return await toolingQueryAll(
                `SELECT Id, DefType, Format FROM AuraDefinition WHERE AuraDefinitionBundleId='${bundleId}' ORDER BY DefType`
            );
        },

        async getAuraDefinitionSource(id: string) {
            const rows = await toolingQueryAll(
                `SELECT Id, DefType, Format, Source FROM AuraDefinition WHERE Id='${id}'`
            );
            return rows?.[0] || null;
        },
    };
}
