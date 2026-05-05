import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import https from 'node:https';

const ALLOWED_HEADERS = [
    'authorization',
    'content-type',
    'x-authorization',
    'x-sfdc-session',
    'soapaction',
    'sforce-auto-assign',
    'sforce-call-options',
    'sforce-query-options',
    'x-sfdc-packageversion-clientpackage',
    'if-modified-since',
    'x-user-agent',
    'cookie',
];

const CONTROL_ENDPOINT_HEADER = 'salesforceproxy-endpoint';
const EXPOSED_HEADERS = ['SForce-Limit-Info'].join(',');
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
const ALLOWED_SALESFORCE_HOSTS = [
    /\.salesforce\.com$/i,
    /\.force\.com$/i,
    /\.cloudforce\.com$/i,
    /\.database\.com$/i,
    /\.salesforce-com\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+\.crm\.dev$/i,
];

export type SalesforceProxyRequest = {
    headers: Record<string, string>;
    method: string;
    url: string;
};

export function writeSalesforceProxyCorsHeaders(
    response: Pick<ServerResponse, 'setHeader'>,
    origin = '*'
): void {
    response.setHeader('Access-Control-Allow-Origin', origin || '*');
    response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
    response.setHeader(
        'Access-Control-Allow-Headers',
        [
            'Authorization',
            'Content-Type',
            'Salesforceproxy-Endpoint',
            'X-Authorization',
            'X-SFDC-Session',
            'SOAPAction',
            'Sforce-Auto-Assign',
            'Sforce-Call-Options',
            'Sforce-Query-Options',
            'x-sfdc-packageversion-clientPackage',
            'If-Modified-Since',
            'X-User-Agent',
            'Cookie',
        ].join(',')
    );
    response.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
}

function getHeaderValue(request: IncomingMessage, headerName: string): string {
    const value = request.headers[headerName.toLowerCase()];
    if (Array.isArray(value)) {
        return value[0] || '';
    }

    return typeof value === 'string' ? value : '';
}

export function isAllowedSalesforceEndpoint(endpoint: string): boolean {
    try {
        const url = new URL(endpoint);
        return (
            url.protocol === 'https:' &&
            ALLOWED_SALESFORCE_HOSTS.some(pattern => pattern.test(url.host))
        );
    } catch {
        return false;
    }
}

export function buildSalesforceProxyRequest(request: IncomingMessage): SalesforceProxyRequest {
    const endpoint = getHeaderValue(request, CONTROL_ENDPOINT_HEADER);
    const method = String(request.method || 'GET').toUpperCase();
    const headers = ALLOWED_HEADERS.reduce<Record<string, string>>((acc, headerName) => {
        const value = getHeaderValue(request, headerName);
        if (!value) {
            return acc;
        }

        acc[headerName === 'x-authorization' ? 'authorization' : headerName] = value;
        return acc;
    }, {});

    return {
        headers,
        method,
        url: endpoint,
    };
}

export function handleSalesforceProxyRequest(
    request: IncomingMessage,
    response: ServerResponse,
    origin = '*'
): void {
    writeSalesforceProxyCorsHeaders(response, origin);

    const method = String(request.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
        response.writeHead(200);
        response.end();
        return;
    }

    if (!ALLOWED_METHODS.includes(method)) {
        response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Method Not Allowed');
        return;
    }

    const proxyRequest = buildSalesforceProxyRequest(request);
    if (!isAllowedSalesforceEndpoint(proxyRequest.url)) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(
            `Proxying endpoint is not allowed. 'salesforceproxy-endpoint' header must be a valid Salesforce domain: ${proxyRequest.url}`
        );
        return;
    }

    const upstreamUrl = new URL(proxyRequest.url);
    const upstreamRequest = https.request(
        upstreamUrl,
        {
            headers: proxyRequest.headers,
            method: proxyRequest.method,
        },
        upstreamResponse => {
            response.writeHead(upstreamResponse.statusCode || 500, upstreamResponse.headers);
            upstreamResponse.pipe(response);
        }
    );

    upstreamRequest.on('error', () => {
        if (!response.headersSent) {
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        response.end('An error occurred while proxying the request.');
    });

    request.pipe(upstreamRequest);
}
