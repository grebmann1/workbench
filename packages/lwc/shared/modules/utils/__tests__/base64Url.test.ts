import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeJsonToBase64Url, decodeBase64UrlToJson } from '../base64Url.ts';

test('encode → decode round-trips simple JSON objects', () => {
    const obj = { a: 1, b: 'two', c: [true, null, 3] };
    const encoded = encodeJsonToBase64Url(obj);
    assert.equal(typeof encoded, 'string');
    assert.deepEqual(decodeBase64UrlToJson(encoded), obj);
});

test('encoded output is URL-safe (no +, /, =)', () => {
    // Pick a payload likely to yield + and / in raw base64: { "??": ">?>" }
    const encoded = encodeJsonToBase64Url({ v: '?>?>' });
    assert.equal(encoded.includes('+'), false);
    assert.equal(encoded.includes('/'), false);
    assert.equal(encoded.includes('='), false);
});

test('round-trip preserves unicode', () => {
    const obj = { name: 'héllo 🌍' };
    const encoded = encodeJsonToBase64Url(obj);
    assert.deepEqual(decodeBase64UrlToJson(encoded), obj);
});

test('decodeBase64UrlToJson: empty / non-string input returns null', () => {
    assert.equal(decodeBase64UrlToJson(''), null);
    assert.equal(decodeBase64UrlToJson(null as unknown as string), null);
    assert.equal(decodeBase64UrlToJson(123 as unknown as string), null);
});

test('decodeBase64UrlToJson: invalid base64 returns null instead of throwing', () => {
    assert.equal(decodeBase64UrlToJson('@@@not-base64###'), null);
});
