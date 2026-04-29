import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

// Set signing secret BEFORE importing the module — getSigningSecret caches on first call.
process.env.GOOGLE_SESSION_SECRET = 'test-secret-for-googleauth-hmac';

const { validateSession } = await import('../googleAuth.ts');

function mint(data: Record<string, unknown>, secret = process.env.GOOGLE_SESSION_SECRET!): string {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

test('validateSession: returns null for empty token', () => {
    assert.equal(validateSession(''), null);
});

test('validateSession: returns null when token has no separator dot', () => {
    assert.equal(validateSession('nodotsanywhere'), null);
});

test('validateSession: returns null when signature is invalid', () => {
    const payload = Buffer.from(
        JSON.stringify({ userId: 'u', expiresAt: Date.now() + 60_000 })
    ).toString('base64url');
    const bogus = `${payload}.not-a-valid-signature`;
    assert.equal(validateSession(bogus), null);
});

test('validateSession: returns null for tokens minted with a different secret', () => {
    const token = mint(
        { userId: 'u', email: 'e', name: 'n', picture: 'p', expiresAt: Date.now() + 60_000 },
        'other-secret'
    );
    assert.equal(validateSession(token), null);
});

test('validateSession: returns null when payload is expired', () => {
    const token = mint({
        userId: 'u',
        email: 'e',
        name: 'n',
        picture: 'p',
        expiresAt: Date.now() - 1,
    });
    assert.equal(validateSession(token), null);
});

test('validateSession: returns null when payload is not valid JSON', () => {
    const payload = Buffer.from('not-json').toString('base64url');
    const sig = crypto
        .createHmac('sha256', process.env.GOOGLE_SESSION_SECRET!)
        .update(payload)
        .digest('base64url');
    assert.equal(validateSession(`${payload}.${sig}`), null);
});

test('validateSession: returns session data for a valid signed token', () => {
    const expiresAt = Date.now() + 60_000;
    const token = mint({ userId: 'u1', email: 'e@x', name: 'N', picture: 'P', expiresAt });
    const session = validateSession(token);
    assert.ok(session);
    assert.equal(session!.userId, 'u1');
    assert.equal(session!.email, 'e@x');
    assert.equal(session!.expiresAt, expiresAt);
    assert.equal(session!.sessionToken, token);
});
