import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    VIEWERS,
    TABS,
    METHOD,
    DEFAULT,
    DEFAULT_API_VERSION,
    generateDefaultTab,
    formattedContentType,
    formatApiRequest,
    substituteVariables,
    parseVariables,
    executeApiRequest,
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

test('DEFAULT_API_VERSION is a non-empty version string', () => {
    assert.match(DEFAULT_API_VERSION, /^\d+\.\d+$/);
});

test('substituteVariables: replaces {key} tokens with variable values', () => {
    assert.equal(substituteVariables('/x/{id}', { id: '123' }), '/x/123');
    assert.equal(
        substituteVariables('Hello {name}, id {id}', { name: 'John', id: 7 }),
        'Hello John, id 7'
    );
});

test('substituteVariables: replaces {sessionId} when a session token is provided', () => {
    assert.equal(
        substituteVariables('Bearer {sessionId}', {}, 'TOKEN123'),
        'Bearer TOKEN123'
    );
});

test('substituteVariables: is safe against $-sequences in values', () => {
    // '$&' in a value must NOT be interpreted as the whole-match replacement.
    assert.equal(substituteVariables('X={v}', { v: '$&' }), 'X=$&');
    assert.equal(substituteVariables('X={v}', { v: '$1 $2 $`' }), 'X=$1 $2 $`');
});

test('substituteVariables: ignores null/undefined values, leaves token as-is', () => {
    assert.equal(substituteVariables('/x/{id}', { id: null }), '/x/{id}');
    assert.equal(substituteVariables('/x/{id}', { id: undefined }), '/x/{id}');
});

test('parseVariables: valid JSON object → object; anything else → {}', () => {
    assert.deepEqual(parseVariables('{"a":1}'), { a: 1 });
    assert.deepEqual(parseVariables('not json'), {});
    assert.deepEqual(parseVariables('[1,2]'), {});
    assert.deepEqual(parseVariables(null), {});
    assert.deepEqual(parseVariables(undefined), {});
});

test('executeApiRequest: success path returns parsed JSON + headers + timing', async () => {
    const fakeFetch = async (url: string, init: RequestInit) => {
        assert.equal(url, 'https://ex/api');
        assert.equal(init.method, 'GET');
        return new Response('{"ok":true}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }) as unknown as Response;
    };
    const out = await executeApiRequest({
        method: 'GET',
        url: 'https://ex/api',
        fetchImpl: fakeFetch as typeof fetch,
    });
    assert.deepEqual(out.content, { ok: true });
    assert.equal(out.contentRaw, '{"ok":true}');
    assert.equal(out.statusCode, 200);
    assert.equal(out.contentType, 'application/json');
    assert.ok(out.executionEndDate >= out.executionStartDate);
});

test('executeApiRequest: non-JSON response returns raw string content', async () => {
    const fakeFetch = async () =>
        new Response('<hello/>', {
            status: 200,
            headers: { 'content-type': 'application/xml' },
        }) as unknown as Response;
    const out = await executeApiRequest({
        method: 'GET',
        url: 'https://ex/api',
        fetchImpl: fakeFetch as typeof fetch,
    });
    assert.equal(out.content, '<hello/>');
    assert.equal(out.contentRaw, '<hello/>');
});

test('executeApiRequest: injects Bearer Authorization from accessToken when absent', async () => {
    let seen: Record<string, string> = {};
    const fakeFetch = async (_url: string, init: RequestInit) => {
        seen = (init.headers as Record<string, string>) || {};
        return new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }) as unknown as Response;
    };
    await executeApiRequest({
        method: 'GET',
        url: 'https://ex/api',
        accessToken: 'TOKEN',
        fetchImpl: fakeFetch as typeof fetch,
    });
    assert.equal(seen.Authorization, 'Bearer TOKEN');
});

test('executeApiRequest: does not override an existing Authorization header', async () => {
    let seen: Record<string, string> = {};
    const fakeFetch = async (_url: string, init: RequestInit) => {
        seen = (init.headers as Record<string, string>) || {};
        return new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }) as unknown as Response;
    };
    await executeApiRequest({
        method: 'GET',
        url: 'https://ex/api',
        headers: { Authorization: 'Bearer EXPLICIT' },
        accessToken: 'TOKEN',
        fetchImpl: fakeFetch as typeof fetch,
    });
    assert.equal(seen.Authorization, 'Bearer EXPLICIT');
});

test('executeApiRequest: missing URL throws', async () => {
    await assert.rejects(
        () =>
            executeApiRequest({
                method: 'GET',
                url: '',
                fetchImpl: (async () => new Response('')) as unknown as typeof fetch,
            }),
        /Missing request URL/
    );
});
