import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    VIEWERS,
    TABS,
    METHOD,
    DEFAULT,
    generateDefaultTab,
    formattedContentType,
    formatApiRequest,
} from '../modules/api.ts';

test('constants: exports expected enums', () => {
    assert.equal(VIEWERS.PRETTY, 'Pretty');
    assert.equal(TABS.HEADERS, 'Headers');
    assert.equal(METHOD.POST, 'POST');
    assert.equal(DEFAULT.ENDPOINT('61.0'), '/services/data/v61.0');
});

test('generateDefaultTab: builds a tab with a guid id and the DEFAULT values', () => {
    const tab = generateDefaultTab('61.0');
    assert.match(tab.id, /^[0-9a-f]{8}-[0-9a-f]{4}-/);
    assert.equal(tab.endpoint, '/services/data/v61.0');
    assert.equal(tab.method, 'GET');
});

test('generateDefaultTab: honours explicit id', () => {
    const tab = generateDefaultTab('61.0', 'fixed-id');
    assert.equal(tab.id, 'fixed-id');
});

test('formattedContentType: recognises json/xml/csv/html/image types', () => {
    assert.equal(formattedContentType('application/json'), 'json');
    assert.equal(formattedContentType('application/xml'), 'xml');
    assert.equal(formattedContentType('text/xml; charset=utf-8'), 'xml');
    assert.equal(formattedContentType('text/csv'), 'csv');
    assert.equal(formattedContentType('text/html'), 'html');
    assert.equal(formattedContentType('image/png'), 'png');
    assert.equal(formattedContentType('image/jpeg'), 'jpeg');
});

test('formattedContentType: unknown / null → text', () => {
    assert.equal(formattedContentType(null), 'text');
    assert.equal(formattedContentType('application/octet-stream'), 'text');
});

test('formatApiRequest: GET against relative endpoint uses instanceUrl', () => {
    const { request, error } = formatApiRequest({
        endpoint: 'services/data/v61.0/sobjects',
        method: 'GET',
        body: '',
        header: null,
        connector: { conn: { instanceUrl: 'https://ex.my.salesforce.com' } },
    });
    assert.equal(error, null);
    assert.equal(request.method, 'GET');
    assert.equal(request.url, 'https://ex.my.salesforce.com/services/data/v61.0/sobjects');
    assert.equal(request.body, undefined);
});

test('formatApiRequest: absolute http URL is used as-is', () => {
    const { request } = formatApiRequest({
        endpoint: 'https://external.example/api',
        method: 'GET',
        body: '',
        header: null,
        connector: { conn: { instanceUrl: 'https://ex.my.salesforce.com' } },
    });
    assert.equal(request.url, 'https://external.example/api');
});

test('formatApiRequest: POST includes body + parses header string', () => {
    const { request, error } = formatApiRequest({
        endpoint: '/services/data/v61.0/sobjects',
        method: 'POST',
        body: '{"Name":"Acme"}',
        header: 'Content-Type: application/json\nAccept: application/json',
        connector: { conn: { instanceUrl: 'https://ex.my.salesforce.com' } },
    });
    assert.equal(error, null);
    assert.equal(request.body, '{"Name":"Acme"}');
    assert.equal(request.headers!['Content-Type'], 'application/json');
    assert.equal(request.headers!.Accept, 'application/json');
});

test('formatApiRequest: invalid header string sets error="Invalid Header"', () => {
    const { error } = formatApiRequest({
        endpoint: '/x',
        method: 'GET',
        body: '',
        header: 'bogus-no-colon-line',
        connector: { conn: { instanceUrl: 'https://ex.my.salesforce.com' } },
    });
    assert.equal(error, 'Invalid Header');
});

test('formatApiRequest: injects Sforce-Call-Options from _callOptions.client', () => {
    const { request } = formatApiRequest({
        endpoint: '/x',
        method: 'GET',
        body: '',
        header: null,
        connector: {
            conn: { instanceUrl: 'https://ex.my.salesforce.com', _callOptions: { client: 'wb' } },
        },
    });
    assert.equal(request.headers!['Sforce-Call-Options'], 'client=wb');
});

test('formatApiRequest: header object is forwarded; replaceVariableValues applied', () => {
    const { request } = formatApiRequest({
        endpoint: '/x',
        method: 'GET',
        body: '',
        header: { 'X-Token': '{{t}}' },
        connector: { conn: { instanceUrl: 'https://ex.my.salesforce.com' } },
        replaceVariableValues: v => v.replace('{{t}}', 'secret'),
    });
    assert.equal(request.headers!['X-Token'], 'secret');
});
