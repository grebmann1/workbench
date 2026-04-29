import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_RATE_LIMIT_DAILY = '3';

const { checkAndIncrement, getStatus } = await import('../userRateLimiter.ts');

test('checkAndIncrement: first call opens fresh window, remaining=limit-1', () => {
    const uid = `u-${Math.random()}`;
    const r = checkAndIncrement(uid);
    assert.equal(r.allowed, true);
    assert.equal(r.limit, 3);
    assert.equal(r.remaining, 2);
});

test('checkAndIncrement: increments up to limit, then denies further requests', () => {
    const uid = `u-${Math.random()}`;
    const a = checkAndIncrement(uid);
    const b = checkAndIncrement(uid);
    const c = checkAndIncrement(uid);
    const d = checkAndIncrement(uid);
    assert.equal(a.remaining, 2);
    assert.equal(b.remaining, 1);
    assert.equal(c.remaining, 0);
    assert.equal(d.allowed, false);
    assert.equal(d.remaining, 0);
});

test('getStatus: returns full quota for unseen user', () => {
    const s = getStatus(`fresh-${Math.random()}`);
    assert.equal(s.allowed, true);
    assert.equal(s.remaining, 3);
});

test('getStatus: reflects used count without incrementing', () => {
    const uid = `u-${Math.random()}`;
    checkAndIncrement(uid);
    const s1 = getStatus(uid);
    const s2 = getStatus(uid);
    // reading shouldn't change state
    assert.equal(s1.remaining, 2);
    assert.equal(s2.remaining, 2);
});
