import { test, expect, request } from '@playwright/test';

/**
 * Extra coverage for the Express API (packages/server). Expands the
 * existing /config + /version spec with shape-locking assertions and
 * protective checks for endpoints that must not 5xx under trivial
 * (no-credentials) use: the OpenAI proxy and the Chrome OAuth callback.
 */
const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:3000';

test.describe('@smoke server extras', () => {
    test('/config exposes googleClientId (value may be null)', async () => {
        const ctx = await request.newContext({ baseURL: API_BASE_URL });
        const res = await ctx.get('/config');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        // The key must exist even when the env var is unset — drop-in
        // changes that silently remove the key would break consumers.
        expect(
            Object.prototype.hasOwnProperty.call(body, 'googleClientId'),
            'response body must include a googleClientId key (value may be null)'
        ).toBe(true);
        await ctx.dispose();
    });

    test('/version.version is a semver-looking string', async () => {
        const ctx = await request.newContext({ baseURL: API_BASE_URL });
        const res = await ctx.get('/version');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(typeof body.version, '/version.version must be a string').toBe('string');
        expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
        await ctx.dispose();
    });

    test('/openai/v1/models returns 200 or 401 (never 5xx)', async () => {
        // The OpenAI proxy may reject without credentials — 401 is the
        // expected shape. Anything 5xx indicates the proxy layer itself
        // fell over, which this smoke guards against.
        const ctx = await request.newContext({ baseURL: API_BASE_URL });
        const res = await ctx.get('/openai/v1/models');
        const status = res.status();
        expect([200, 401]).toContain(status);
        await ctx.dispose();
    });

    test('/chrome/callback without code returns 4xx (not 500)', async () => {
        const ctx = await request.newContext({ baseURL: API_BASE_URL });
        const res = await ctx.get('/chrome/callback');
        const status = res.status();
        expect(status, 'missing-code response must be a client error').toBeGreaterThanOrEqual(400);
        expect(status, 'missing-code must not surface as a server error').toBeLessThan(500);
        await ctx.dispose();
    });
});
