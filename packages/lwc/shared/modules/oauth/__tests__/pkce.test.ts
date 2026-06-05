import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pkcePair, randomToken } from '../pkce.ts';

function base64UrlOfDigest(digest: ArrayBuffer): string {
    let binary = '';
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('pkcePair: verifier and challenge are base64url with no padding', async () => {
    const { verifier, challenge } = await pkcePair();
    assert.match(verifier, /^[A-Za-z0-9_-]+$/);
    assert.match(challenge, /^[A-Za-z0-9_-]+$/);
    assert.ok(verifier.length >= 43, 'verifier must satisfy the RFC 7636 minimum length');
});

test('pkcePair: challenge is exactly S256(verifier)', async () => {
    const { verifier, challenge } = await pkcePair();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    assert.equal(challenge, base64UrlOfDigest(digest));
});

test('pkcePair: each call produces a fresh verifier', async () => {
    const a = await pkcePair();
    const b = await pkcePair();
    assert.notEqual(a.verifier, b.verifier);
    assert.notEqual(a.challenge, b.challenge);
});

test('randomToken: url-safe and unique', () => {
    const a = randomToken();
    const b = randomToken();
    assert.match(a, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(a, b);
});
