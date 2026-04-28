import { test, expect } from '@playwright/test';

test.describe('@smoke server', () => {
    test('/config returns JSON with clientId and chromeId keys', async ({ request }) => {
        const res = await request.get('/config');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        // Values may be undefined when .env.dev is incomplete; we only assert
        // the shape so this spec surfaces a misconfigured dev env before the
        // other specs time out mysteriously.
        expect(body).toHaveProperty('clientId');
        expect(body).toHaveProperty('chromeId');
    });

    test('/version endpoint responds with a version string or null', async ({ request }) => {
        const res = await request.get('/version');
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        expect(body).toHaveProperty('version');
    });
});
