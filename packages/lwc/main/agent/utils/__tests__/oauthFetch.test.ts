import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CODEX_OAUTH } from 'shared/oauth';

import { createOAuthFetch } from '../provider/shared/oauthFetch.ts';

const FAR_FUTURE = 4_102_444_800_000; // year 2100 — never proactively expired

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/** Install a global fetch stub, run `fn`, and restore. Records {url, auth} per call. */
async function withFetch(
    handler: (url: string) => Response,
    fn: (calls: Array<{ url: string; auth?: string }>) => Promise<void>
): Promise<void> {
    const original = globalThis.fetch;
    const calls: Array<{ url: string; auth?: string }> = [];
    globalThis.fetch = (async (url: RequestInfo | URL, options?: RequestInit) => {
        const headers = (options?.headers ?? {}) as Record<string, string>;
        calls.push({ url: String(url), auth: headers.Authorization });
        return handler(String(url));
    }) as typeof fetch;
    try {
        await fn(calls);
    } finally {
        globalThis.fetch = original;
    }
}

const wham = (path = '/responses') => `https://chatgpt.com/backend-api/wham${path}`;

test('createOAuthFetch: refreshes once on 401 and retries with the new token', async () => {
    let apiHits = 0;
    let tokenHits = 0;
    await withFetch(
        url => {
            if (url === CODEX_OAUTH.tokenUrl) {
                tokenHits++;
                return jsonResponse({ access_token: 'fresh', expires_in: 3600 });
            }
            apiHits++;
            return new Response('', { status: apiHits === 1 ? 401 : 200 });
        },
        async calls => {
            const fetchImpl = createOAuthFetch({
                provider: CODEX_OAUTH,
                credentials: { access: 'stale', refresh: 'rt', expires: FAR_FUTURE },
            });
            const res = await fetchImpl(wham(), { method: 'POST', body: '{}' });
            assert.equal(res.status, 200);
            assert.equal(tokenHits, 1);
            const apiCalls = calls.filter(c => c.url.startsWith(wham()));
            assert.equal(apiCalls[0].auth, 'Bearer stale');
            assert.equal(apiCalls[1].auth, 'Bearer fresh');
        }
    );
});

test('createOAuthFetch: proactively refreshes a stale token before the first request', async () => {
    await withFetch(
        url =>
            url === CODEX_OAUTH.tokenUrl
                ? jsonResponse({ access_token: 'fresh', expires_in: 3600 })
                : new Response('', { status: 200 }),
        async calls => {
            const fetchImpl = createOAuthFetch({
                provider: CODEX_OAUTH,
                credentials: { access: 'stale', refresh: 'rt', expires: 0 }, // already expired
            });
            await fetchImpl(wham(), { method: 'POST', body: '{}' });
            const apiCalls = calls.filter(c => c.url.startsWith(wham()));
            assert.equal(apiCalls[0].auth, 'Bearer fresh');
        }
    );
});

test('createOAuthFetch: returns the 401 unchanged when there is no refresh token', async () => {
    await withFetch(
        () => new Response('', { status: 401 }),
        async calls => {
            const fetchImpl = createOAuthFetch({
                provider: CODEX_OAUTH,
                credentials: { access: 'tok', refresh: '', expires: FAR_FUTURE },
            });
            const res = await fetchImpl(wham(), { method: 'POST', body: '{}' });
            assert.equal(res.status, 401);
            assert.equal(calls.filter(c => c.url === CODEX_OAUTH.tokenUrl).length, 0);
            assert.equal(calls.filter(c => c.url.startsWith(wham())).length, 1); // no retry
        }
    );
});

test('createOAuthFetch: concurrent 401s share a single refresh (single-flight)', async () => {
    let apiHits = 0;
    let tokenHits = 0;
    await withFetch(
        url => {
            if (url === CODEX_OAUTH.tokenUrl) {
                tokenHits++;
                return jsonResponse({ access_token: 'fresh', expires_in: 3600 });
            }
            apiHits++;
            return new Response('', { status: apiHits <= 2 ? 401 : 200 });
        },
        async () => {
            const fetchImpl = createOAuthFetch({
                provider: CODEX_OAUTH,
                credentials: { access: 'stale', refresh: 'rt', expires: FAR_FUTURE },
            });
            const [a, b] = await Promise.all([
                fetchImpl(wham(), { method: 'POST', body: '{}' }),
                fetchImpl(wham(), { method: 'POST', body: '{}' }),
            ]);
            assert.equal(a.status, 200);
            assert.equal(b.status, 200);
            assert.equal(tokenHits, 1);
        }
    );
});
