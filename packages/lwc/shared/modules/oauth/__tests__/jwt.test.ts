import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeJwtPayload, extractAccountId } from '../jwt.ts';

/** Build an unsigned-but-well-formed JWT for a given payload. */
function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.sig`;
}

test('decodeJwtPayload: reads the payload, returns null on garbage', () => {
    assert.deepEqual(decodeJwtPayload(makeJwt({ a: 1 })), { a: 1 });
    assert.equal(decodeJwtPayload('not-a-jwt'), null);
    assert.equal(decodeJwtPayload(''), null);
    assert.equal(decodeJwtPayload(null), null);
    assert.equal(decodeJwtPayload('a.b'), null); // payload "b" is not valid base64 JSON
});

test('extractAccountId: top-level chatgpt_account_id wins', () => {
    const token = makeJwt({ chatgpt_account_id: 'acct-top' });
    assert.equal(extractAccountId(token, null), 'acct-top');
});

test('extractAccountId: falls back to the api.openai.com/auth namespace', () => {
    const token = makeJwt({
        'https://api.openai.com/auth': { chatgpt_account_id: 'acct-ns' },
    });
    assert.equal(extractAccountId(token, null), 'acct-ns');
});

test('extractAccountId: falls back to organizations[0].id', () => {
    const token = makeJwt({ organizations: [{ id: 'org-0' }, { id: 'org-1' }] });
    assert.equal(extractAccountId(token, null), 'org-0');
});

test('extractAccountId: tries the access token when id_token lacks the claim', () => {
    const idToken = makeJwt({ sub: 'no-account' });
    const accessToken = makeJwt({ chatgpt_account_id: 'acct-access' });
    assert.equal(extractAccountId(idToken, accessToken), 'acct-access');
});

test('extractAccountId: returns null when nothing matches or tokens are malformed', () => {
    assert.equal(extractAccountId(makeJwt({ sub: 'x' }), makeJwt({ sub: 'y' })), null);
    assert.equal(extractAccountId(null, null), null);
    assert.equal(extractAccountId('garbage', 'also-garbage'), null);
    assert.equal(extractAccountId(makeJwt({ organizations: [] }), null), null);
});
