// swrCache.ts
// Module: shared/swrCache/swrCache
//
// In-memory stale-while-revalidate cache primitive.
//
// Why this exists:
//   The original Agentforce Explorer plan mistakenly cited
//   `runAndCacheQuery` in `packages/lwc/applications/metadata/slices/metadata.ts`
//   as an SWR helper. It is not — it has no TTL, no in-flight dedupe, and
//   persists to disk via cacheManager. F2 (this module) introduces a proper,
//   in-memory SWR primitive that downstream items (X1, X4, X10, L4, L6) wire
//   into agentforce thunks.
//
// Boundary discipline:
//   - App-agnostic. Cache keys are opaque strings — callers shape them
//     (e.g. `agentforce:agents:${orgId}:${soqlHash}`).
//   - In-memory ONLY. Per the consensus plan, agentforce transcripts may
//     contain PII; persisting them to localStorage / IndexedDB is forbidden.
//     Use `cacheManager` (a different module) for legitimate persistent
//     org-data caching.
//   - Pure module. No I/O, no DOM, no chrome APIs. Only `Date.now()` (or an
//     injected clock for tests).

import logger from 'shared/logger';

/* -------------------------------------------------------------------------- */
/*  Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface SwrOptions {
    /** Hard expiry — past this, the entry is treated as a cache miss. */
    ttlMs: number;
    /**
     * Grace window AFTER `ttlMs` during which the cached value is returned
     * immediately while a background refresh runs.
     */
    staleWhileRevalidateMs: number;
    /**
     * Optional injected clock for tests. Defaults to `Date.now`.
     * Production callers should leave this unset.
     */
    clock?: () => number;
}

export interface SwrEntry<T> {
    data: T;
    fetchedAt: number;
    revalidating: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Internal state                                                             */
/* -------------------------------------------------------------------------- */

// Internal storage uses `unknown` and we cast at the public boundary. Each
// caller picks the type via the generic parameter on `swr<T>`; mismatched
// types per key would be a caller bug, not something we can defend against
// from inside an opaque-key cache.
const cache: Map<string, SwrEntry<unknown>> = new Map();

// In-flight loaders, keyed by the same opaque cache key. Lets concurrent
// callers share a single loader invocation (semantics rule 5).
const inflight: Map<string, Promise<unknown>> = new Map();

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function defaultNow(): number {
    return Date.now();
}

/**
 * Run the loader once, share the promise across concurrent callers, and on
 * success store the result. On rejection, do NOT cache the error — the next
 * call retries.
 */
function runLoader<T>(key: string, loader: () => Promise<T>, now: () => number): Promise<T> {
    const existing = inflight.get(key);
    if (existing) {
        return existing as Promise<T>;
    }

    // Normalize the loader's outcome to an always-async rejection. A loader
    // that THROWS synchronously (rather than returning a rejected promise)
    // must behave identically — otherwise concurrent dedupe would diverge:
    // the first caller would see a synchronous throw while a second caller
    // attaching microtasks later would see a rejected promise.
    let raw: Promise<T>;
    try {
        raw = Promise.resolve(loader());
    } catch (err) {
        raw = Promise.reject(err);
    }

    const promise: Promise<T> = raw.then(
        value => {
            cache.set(key, {
                data: value,
                fetchedAt: now(),
                revalidating: false,
            });
            inflight.delete(key);
            return value;
        },
        err => {
            // Rejection: do NOT cache the error. Clear the in-flight slot so
            // the next call retries.
            inflight.delete(key);
            throw err;
        }
    );

    inflight.set(key, promise as Promise<unknown>);
    return promise;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Stale-while-revalidate fetch.
 *
 * Behavior:
 *  1. Cache miss          → await loader, store, return.
 *  2. Fresh hit           → return cached data immediately, no loader call.
 *  3. Stale hit (in SWR)  → return cached data immediately, fire bg refresh.
 *  4. Hard miss (past SWR)→ treat as cache miss, await fresh loader.
 *  5. In-flight dedupe    → concurrent calls for the same key share one
 *                           loader invocation.
 *  6. Loader rejection    → do not cache the error; next call retries. The
 *                           current rejection propagates to all dedupe-
 *                           attached callers.
 *
 * Cache scope: in-memory per session. Do NOT persist to localStorage —
 * transcripts may contain PII per the consensus plan.
 */
export async function swr<T>(key: string, loader: () => Promise<T>, opts: SwrOptions): Promise<T> {
    if (typeof key !== 'string' || key === '') {
        throw new Error('swr: key must be a non-empty string.');
    }
    if (typeof loader !== 'function') {
        throw new Error('swr: loader must be a function.');
    }
    if (!opts || typeof opts.ttlMs !== 'number' || opts.ttlMs < 0) {
        throw new Error('swr: opts.ttlMs must be a non-negative number.');
    }
    if (typeof opts.staleWhileRevalidateMs !== 'number' || opts.staleWhileRevalidateMs < 0) {
        throw new Error('swr: opts.staleWhileRevalidateMs must be a non-negative number.');
    }

    const now = opts.clock ?? defaultNow;
    const entry = cache.get(key) as SwrEntry<T> | undefined;

    if (entry) {
        const age = now() - entry.fetchedAt;

        // 2. Fresh hit
        if (age < opts.ttlMs) {
            return entry.data;
        }

        // 3. Stale hit — return stale, refresh in background
        if (age < opts.ttlMs + opts.staleWhileRevalidateMs) {
            if (!entry.revalidating) {
                entry.revalidating = true;
                // Fire-and-forget background refresh. Errors are logged, not
                // thrown — the caller already got the stale value.
                runLoader(key, loader, now)
                    .catch(err => {
                        logger.warn('swr background refresh failed', {
                            key,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    })
                    .finally(() => {
                        const current = cache.get(key);
                        if (current) {
                            current.revalidating = false;
                        }
                    });
            }
            return entry.data;
        }

        // 4. Hard miss — fall through to fresh fetch
    }

    // 1. Cache miss / 4. hard miss → await fresh loader (with dedupe).
    return runLoader(key, loader, now);
}

/**
 * Drop all cache entries whose key starts with `keyPrefix`.
 *
 * Used by refresh buttons (N5) and by callers that know an upstream change
 * just invalidated a family of keys (e.g. "the user re-deployed agent X, so
 * everything under `agentforce:agents:org1:` is stale").
 *
 * Does NOT cancel in-flight loaders — they are allowed to complete and
 * repopulate the cache. If the result of an in-flight loader is no longer
 * desired, the caller should issue a fresh `swr(...)` after `invalidate(...)`
 * to re-trigger.
 */
export function invalidate(keyPrefix: string): void {
    if (typeof keyPrefix !== 'string') {
        throw new Error('invalidate: keyPrefix must be a string.');
    }
    for (const key of cache.keys()) {
        if (key.startsWith(keyPrefix)) {
            cache.delete(key);
        }
    }
}

/**
 * Test helper: clear the entire cache and any in-flight loader records.
 *
 * Production callers should use {@link invalidate} with a specific prefix.
 */
export function _clearAllForTesting(): void {
    cache.clear();
    inflight.clear();
}
