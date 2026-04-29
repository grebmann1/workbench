import { test, expect, request } from '@playwright/test';

/**
 * The Express API gateway runs on a separate port from the apps/ui dev
 * server. Resolve its base URL from E2E_API_BASE_URL (defaults to
 * http://localhost:3000, matching packages/server/server-dev.ts).
 */
const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:3000';

test.describe('@smoke server', () => {
    test('/config returns JSON with clientId and chromeId keys', async () => {
        const ctx = await request.newContext({ baseURL: API_BASE_URL });
        const res = await ctx.get('/config');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body).toHaveProperty('clientId');
        expect(body).toHaveProperty('chromeId');
        await ctx.dispose();
    });

    test('/version endpoint responds with a version key', async () => {
        const ctx = await request.newContext({ baseURL: API_BASE_URL });
        const res = await ctx.get('/version');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body).toHaveProperty('version');
        await ctx.dispose();
    });
});
