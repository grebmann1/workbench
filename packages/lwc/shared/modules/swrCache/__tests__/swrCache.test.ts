// swrCache.test.ts
// Module: shared/swrCache/swrCache
// Runner: node:test + node:assert/strict via `node --experimental-strip-types --test`
//
// Time control: we use an injected `clock` callback rather than `mock.timers`.
// Reasons:
//   - The cache reads `Date.now` via `opts.clock ?? Date.now`. Passing a
//     test-controlled clock isolates each test from any global timer mocking
//     (and avoids interfering with promise microtask scheduling, which is
//     finicky under `mock.timers`).
//   - It exercises the public surface exactly as a future caller would if
//     they needed deterministic time.

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

import { swr, invalidate, _clearAllForTesting, type SwrOptions } from '../swrCache.ts';

/* -------------------------------------------------------------------------- */
/*  Test harness                                                               */
/* -------------------------------------------------------------------------- */

/** Mutable clock; tests bump `current` and pass `clock` into `swr`. */
function makeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
    let current = start;
    return {
        now: () => current,
        advance: (ms: number) => {
            current += ms;
        },
    };
}

/** Counts loader invocations so tests can assert call counts. */
function makeLoader<T>(value: T): { fn: () => Promise<T>; calls: () => number } {
    let count = 0;
    return {
        fn: async () => {
            count += 1;
            return value;
        },
        calls: () => count,
    };
}

/**
 * Awaits enough microtasks to let an inner promise chain
 * (`runLoader().then(setCache).finally(clearRevalidating)`) settle.
 * Two `await Promise.resolve()` calls cover the deepest chain in this module.
 */
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    _clearAllForTesting();
});

/* -------------------------------------------------------------------------- */
/*  1. Cache miss → fetch                                                      */
/* -------------------------------------------------------------------------- */

test('cache miss: loader is called once and value is returned', async () => {
    const clock = makeClock();
    const loader = makeLoader('hello');
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    const result = await swr('k1', loader.fn, opts);

    assert.equal(result, 'hello');
    assert.equal(loader.calls(), 1);
});

/* -------------------------------------------------------------------------- */
/*  2. Fresh hit                                                               */
/* -------------------------------------------------------------------------- */

test('fresh hit: second call within ttlMs returns cached value without invoking loader', async () => {
    const clock = makeClock();
    const loader = makeLoader('value');
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    const r1 = await swr('k', loader.fn, opts);
    clock.advance(500); // still within ttlMs
    const r2 = await swr('k', loader.fn, opts);

    assert.equal(r1, 'value');
    assert.equal(r2, 'value');
    assert.equal(loader.calls(), 1, 'loader should not be called for a fresh hit');
});

/* -------------------------------------------------------------------------- */
/*  3. In-flight dedupe                                                        */
/* -------------------------------------------------------------------------- */

test('in-flight dedupe: two concurrent calls share one loader invocation', async () => {
    const clock = makeClock();
    let resolveLoader!: (v: string) => void;
    let calls = 0;
    const loader = (): Promise<string> => {
        calls += 1;
        return new Promise<string>(resolve => {
            resolveLoader = resolve;
        });
    };
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    const p1 = swr('shared-key', loader, opts);
    const p2 = swr('shared-key', loader, opts);

    // Both attached to the same in-flight promise; loader was only called once.
    assert.equal(calls, 1);

    resolveLoader('shared-value');
    const [v1, v2] = await Promise.all([p1, p2]);
    assert.equal(v1, 'shared-value');
    assert.equal(v2, 'shared-value');
    assert.equal(calls, 1);
});

/* -------------------------------------------------------------------------- */
/*  4. Stale-while-revalidate                                                  */
/* -------------------------------------------------------------------------- */

test('stale-while-revalidate: returns stale value AND fires bg refresh, next call sees fresh value', async () => {
    const clock = makeClock();
    let counter = 0;
    const loader = async (): Promise<string> => {
        counter += 1;
        return `v${counter}`;
    };
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    // Initial fetch: counter=1 → 'v1'.
    const r1 = await swr('k', loader, opts);
    assert.equal(r1, 'v1');
    assert.equal(counter, 1);

    // Move into the SWR window (past ttlMs but within ttlMs+swrMs).
    clock.advance(2000);

    // This call should return the STALE value 'v1' immediately, while
    // firing a background refresh that increments counter to 2.
    const r2 = await swr('k', loader, opts);
    assert.equal(r2, 'v1', 'should return stale value');

    // Let the bg refresh settle.
    await flushMicrotasks();
    assert.equal(counter, 2, 'bg refresh should have run exactly once');

    // Next call (still within fresh window of the new fetch) sees the refreshed value.
    const r3 = await swr('k', loader, opts);
    assert.equal(r3, 'v2', 'next call returns refreshed value');
    assert.equal(counter, 2, 'no additional loader call for fresh hit');
});

test('stale-while-revalidate: only one bg refresh fires for multiple stale reads', async () => {
    const clock = makeClock();
    let resolveLoader!: (v: string) => void;
    let counter = 0;
    let firstResolved = false;

    const loader = (): Promise<string> => {
        counter += 1;
        if (counter === 1) {
            // First (priming) load — resolve sync.
            return Promise.resolve('v1');
        }
        // Subsequent (bg) load — block until released.
        return new Promise<string>(resolve => {
            resolveLoader = resolve;
        });
    };
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    await swr('k', loader, opts);
    assert.equal(counter, 1);

    // Move into SWR window.
    clock.advance(2000);

    // Two stale reads back-to-back. The second must NOT trigger a second bg
    // refresh — `revalidating` flag prevents it.
    const a = await swr('k', loader, opts);
    const b = await swr('k', loader, opts);
    assert.equal(a, 'v1');
    assert.equal(b, 'v1');
    assert.equal(counter, 2, 'exactly one bg loader call regardless of how many stale reads');

    resolveLoader('v2');
    firstResolved = true;
    await flushMicrotasks();
    assert.ok(firstResolved);
});

/* -------------------------------------------------------------------------- */
/*  5. Hard expiry                                                             */
/* -------------------------------------------------------------------------- */

test('hard expiry: past ttlMs+staleWhileRevalidateMs triggers a fresh awaited fetch', async () => {
    const clock = makeClock();
    let counter = 0;
    const loader = async (): Promise<string> => {
        counter += 1;
        return `v${counter}`;
    };
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 2000, clock: clock.now };

    const r1 = await swr('k', loader, opts);
    assert.equal(r1, 'v1');

    // Past the entire window: ttl(1000) + swr(2000) = 3000.
    clock.advance(5000);

    const r2 = await swr('k', loader, opts);
    assert.equal(r2, 'v2', 'hard miss must await a fresh load');
    assert.equal(counter, 2);
});

/* -------------------------------------------------------------------------- */
/*  6. Loader rejection                                                        */
/* -------------------------------------------------------------------------- */

test('loader rejection: promise rejects, error is not cached, next call retries', async () => {
    const clock = makeClock();
    let calls = 0;
    const loader = async (): Promise<string> => {
        calls += 1;
        if (calls === 1) {
            throw new Error('first-failure');
        }
        return 'recovered';
    };
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    await assert.rejects(swr('k', loader, opts), /first-failure/);
    assert.equal(calls, 1);

    // Next call must retry (not a cached error).
    const r = await swr('k', loader, opts);
    assert.equal(r, 'recovered');
    assert.equal(calls, 2);
});

test('synchronous throw in loader: behaves like an async rejection', async () => {
    const clock = makeClock();
    const loader = (): Promise<string> => {
        throw new Error('sync-boom');
    };
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    await assert.rejects(swr('k', loader, opts), /sync-boom/);

    // Cache should remain empty; a subsequent successful call repopulates.
    const ok = makeLoader('ok');
    const r = await swr('k', ok.fn, opts);
    assert.equal(r, 'ok');
    assert.equal(ok.calls(), 1);
});

/* -------------------------------------------------------------------------- */
/*  7. invalidate(prefix)                                                      */
/* -------------------------------------------------------------------------- */

test('invalidate(prefix): drops only matching keys', async () => {
    const clock = makeClock();
    const aLoader = makeLoader('A');
    const bLoader = makeLoader('B');
    const opts: SwrOptions = { ttlMs: 60_000, staleWhileRevalidateMs: 60_000, clock: clock.now };

    await swr('agentforce:agents:org1', aLoader.fn, opts);
    await swr('agentforce:topics:org1', bLoader.fn, opts);
    assert.equal(aLoader.calls(), 1);
    assert.equal(bLoader.calls(), 1);

    invalidate('agentforce:agents:');

    // agents key is gone → loader is called again.
    await swr('agentforce:agents:org1', aLoader.fn, opts);
    assert.equal(aLoader.calls(), 2);

    // topics key still cached → loader is NOT called again.
    await swr('agentforce:topics:org1', bLoader.fn, opts);
    assert.equal(bLoader.calls(), 1);
});

/* -------------------------------------------------------------------------- */
/*  8. Concurrent dedupe with rejection                                        */
/* -------------------------------------------------------------------------- */

test('concurrent dedupe with rejection: both concurrent callers reject with the same error', async () => {
    const clock = makeClock();
    let rejectLoader!: (err: Error) => void;
    let calls = 0;
    const loader = (): Promise<string> => {
        calls += 1;
        return new Promise<string>((_, reject) => {
            rejectLoader = reject;
        });
    };
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000, clock: clock.now };

    const p1 = swr('k', loader, opts);
    const p2 = swr('k', loader, opts);
    assert.equal(calls, 1, 'concurrent calls share a single loader invocation');

    const err = new Error('shared-rejection');
    rejectLoader(err);

    const r1 = await p1.then(
        () => 'fulfilled',
        e => e
    );
    const r2 = await p2.then(
        () => 'fulfilled',
        e => e
    );
    assert.equal(r1, err);
    assert.equal(r2, err);

    // After rejection, cache is still empty — a follow-up call retries.
    const ok = makeLoader('recovered');
    const result = await swr('k', ok.fn, opts);
    assert.equal(result, 'recovered');
    assert.equal(ok.calls(), 1);
});

/* -------------------------------------------------------------------------- */
/*  9. _clearAllForTesting                                                     */
/* -------------------------------------------------------------------------- */

test('_clearAllForTesting: drops every key', async () => {
    const clock = makeClock();
    const a = makeLoader('A');
    const b = makeLoader('B');
    const opts: SwrOptions = { ttlMs: 60_000, staleWhileRevalidateMs: 60_000, clock: clock.now };

    await swr('x', a.fn, opts);
    await swr('y', b.fn, opts);
    assert.equal(a.calls(), 1);
    assert.equal(b.calls(), 1);

    _clearAllForTesting();

    await swr('x', a.fn, opts);
    await swr('y', b.fn, opts);
    assert.equal(a.calls(), 2);
    assert.equal(b.calls(), 2);
});

/* -------------------------------------------------------------------------- */
/*  Input validation                                                           */
/* -------------------------------------------------------------------------- */

test('swr: rejects empty key', async () => {
    const opts: SwrOptions = { ttlMs: 1000, staleWhileRevalidateMs: 5000 };
    await assert.rejects(
        swr('', async () => 'x', opts),
        /key must be a non-empty string/
    );
});

test('swr: rejects negative ttlMs', async () => {
    const opts: SwrOptions = { ttlMs: -1, staleWhileRevalidateMs: 5000 };
    await assert.rejects(
        swr('k', async () => 'x', opts),
        /ttlMs must be a non-negative number/
    );
});
