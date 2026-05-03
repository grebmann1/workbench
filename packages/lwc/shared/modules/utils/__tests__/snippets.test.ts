import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    apexSnippet,
    curlSnippet,
    jsforceSnippet,
    fetchSnippet,
    pythonSnippet,
    powershellSnippet,
    sanitizeHeadersForSnippet,
    generateSnippet,
    SNIPPET_LANGUAGES,
    type SnippetRequest,
} from '../modules/snippets.ts';

const SAMPLE: SnippetRequest = {
    method: 'POST',
    url: 'https://ex.my.salesforce.com/services/data/v59.0/sobjects/Account',
    endpoint: '/services/data/v59.0/sobjects/Account',
    body: '{"Name":"Acme"}',
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer 00D000...REAL_TOKEN',
    },
};

test('sanitizeHeadersForSnippet: redacts Authorization → Bearer {sessionId}', () => {
    const out = sanitizeHeadersForSnippet({ Authorization: 'Bearer secret' });
    assert.equal(out.Authorization, 'Bearer {sessionId}');
});

test('sanitizeHeadersForSnippet: custom redact list replaces with {redacted}', () => {
    const out = sanitizeHeadersForSnippet(
        { 'X-Custom': 'abc', Authorization: 'Bearer x' },
        ['x-custom']
    );
    assert.equal(out['X-Custom'], '{redacted}');
    // Authorization not in the custom redact list → left as-is.
    assert.equal(out.Authorization, 'Bearer x');
});

test('apexSnippet: includes method, endpoint, headers, and body; redacts token', () => {
    const s = apexSnippet(SAMPLE);
    assert.match(s, /HttpRequest req = new HttpRequest\(\);/);
    assert.match(s, /req\.setMethod\('POST'\);/);
    assert.match(s, /req\.setEndpoint\('https:\/\/ex\.my\.salesforce\.com/);
    assert.match(s, /req\.setHeader\('Authorization', 'Bearer \{sessionId\}'\);/);
    assert.ok(!s.includes('REAL_TOKEN'));
    assert.match(s, /req\.setBody\('\{"Name":"Acme"\}'\);/);
});

test('apexSnippet: escapes single quotes in body', () => {
    const s = apexSnippet({ ...SAMPLE, body: `{"Name":"O'Brien"}` });
    assert.match(s, /req\.setBody\('\{"Name":"O\\'Brien"\}'\);/);
});

test('curlSnippet: single-quote escapes the URL and body; redacts auth', () => {
    const s = curlSnippet({ ...SAMPLE, url: "https://ex.com/a'b" });
    assert.match(s, /curl -X POST 'https:\/\/ex\.com\/a'"'"'b'/);
    assert.match(s, /-H 'Authorization: Bearer \{sessionId\}'/);
    assert.ok(!s.includes('REAL_TOKEN'));
});

test('curlSnippet: no body omitted for methods with empty body', () => {
    const s = curlSnippet({ method: 'GET', url: 'https://ex.com/a' });
    assert.ok(!s.includes('--data-raw'));
});

test('jsforceSnippet: embeds instanceUrl, endpoint, headers, and parsed body', () => {
    const s = jsforceSnippet(SAMPLE);
    assert.match(s, /instanceUrl: "https:\/\/ex\.my\.salesforce\.com"/);
    assert.match(s, /url: "\/services\/data\/v59\.0\/sobjects\/Account"/);
    assert.match(s, /"Authorization": "Bearer \{sessionId\}"/);
    // JSON body should be rendered as an object, not a string
    assert.match(s, /body: \{\s+"Name": "Acme"/);
});

test('jsforceSnippet: falls back to string body when JSON.parse fails', () => {
    const s = jsforceSnippet({ ...SAMPLE, body: 'not-json' });
    assert.match(s, /body: "not-json"/);
});

test('fetchSnippet: emits a runnable fetch() with headers and body', () => {
    const s = fetchSnippet(SAMPLE);
    assert.match(s, /const res = await fetch\(/);
    assert.match(s, /"method": "POST"/);
    assert.match(s, /"Authorization": "Bearer \{sessionId\}"/);
    assert.match(s, /"body": "\{\\"Name\\":\\"Acme\\"\}"/);
});

test('pythonSnippet: uses requests.post for POST and includes data=', () => {
    const s = pythonSnippet(SAMPLE);
    assert.match(s, /import requests/);
    assert.match(s, /res = requests\.post\(url, headers=headers, data=data\)/);
    assert.match(s, /"Authorization": "Bearer \{sessionId\}"/);
});

test('powershellSnippet: emits Invoke-RestMethod with hashtable headers', () => {
    const s = powershellSnippet(SAMPLE);
    assert.match(s, /\$headers = @\{/);
    assert.match(s, /Invoke-RestMethod -Uri "https/);
    assert.match(s, /-Method POST/);
});

test('generateSnippet: dispatches to the named generator', () => {
    for (const lang of SNIPPET_LANGUAGES) {
        const s = generateSnippet(lang, SAMPLE);
        assert.ok(typeof s === 'string' && s.length > 0, `empty for ${lang}`);
    }
});

test('generateSnippet: unknown language → empty string', () => {
    // @ts-expect-error deliberately invalid language
    assert.equal(generateSnippet('nope', SAMPLE), '');
});

test('all snippets: return a helpful stub when url is missing', () => {
    const bad: SnippetRequest = { method: 'GET', url: '' };
    assert.match(apexSnippet(bad), /Unable to format request/);
    assert.match(curlSnippet(bad), /Unable to format request/);
    assert.match(jsforceSnippet(bad), /Unable to format request/);
    assert.match(fetchSnippet(bad), /Unable to format request/);
    assert.match(pythonSnippet(bad), /Unable to format request/);
    assert.match(powershellSnippet(bad), /Unable to format request/);
});
