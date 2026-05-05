import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildSalesforceProxyRequest,
    isAllowedSalesforceEndpoint,
    writeSalesforceProxyCorsHeaders,
} from './desktopSalesforceProxy';

function makeResponse() {
    const headers: Record<string, string> = {};
    return {
        headers,
        setHeader(name: string, value: string) {
            headers[name] = value;
        },
    };
}

test('isAllowedSalesforceEndpoint accepts standard and Trailhead Salesforce endpoints', () => {
    assert.equal(
        isAllowedSalesforceEndpoint('https://acme.my.salesforce.com/services/data/'),
        true
    );
    assert.equal(
        isAllowedSalesforceEndpoint(
            'https://creative-goat-m8i8rc-dev-ed.trailblaze.my.salesforce.com/services/data/'
        ),
        true
    );
});

test('isAllowedSalesforceEndpoint rejects non-Salesforce endpoints', () => {
    assert.equal(isAllowedSalesforceEndpoint('https://evil.example.com/services/data/'), false);
    assert.equal(
        isAllowedSalesforceEndpoint('http://acme.my.salesforce.com/services/data/'),
        false
    );
});

test('writeSalesforceProxyCorsHeaders allows the desktop renderer origin', () => {
    const response = makeResponse();

    writeSalesforceProxyCorsHeaders(response as any, 'http://127.0.0.1:47321');

    assert.equal(response.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:47321');
    assert.match(response.headers['Access-Control-Allow-Headers'], /Salesforceproxy-Endpoint/);
    assert.equal(response.headers['Access-Control-Expose-Headers'], 'SForce-Limit-Info');
});

test('buildSalesforceProxyRequest forwards only allowed request headers', () => {
    const request = buildSalesforceProxyRequest({
        headers: {
            authorization: 'Bearer abc',
            cookie: 'sid=abc',
            'salesforceproxy-endpoint': 'https://acme.my.salesforce.com/services/data/',
            'x-evil': 'drop-me',
        },
        method: 'GET',
    } as any);

    assert.deepEqual(request, {
        headers: {
            authorization: 'Bearer abc',
            cookie: 'sid=abc',
        },
        method: 'GET',
        url: 'https://acme.my.salesforce.com/services/data/',
    });
});
