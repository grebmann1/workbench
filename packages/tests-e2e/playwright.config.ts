import { defineConfig } from '@playwright/test';

const LIVE = process.env.LIVE === '1';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:27100' },
    reporter: process.env.CI
        ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
        : [['list']],
    forbidOnly: !!process.env.CI,
    projects: [
        {
            name: 'smoke',
            testDir: './tests',
            testMatch: /smoke\..*\.spec\.ts/,
            testIgnore: /extension\//,
        },
        {
            // Extension project launches a persistent Chromium context
            // with --load-extension, which is substantially slower to boot
            // than the landing-site smokes — give it more headroom.
            //
            // Uses Playwright's bundled Chromium (channel: 'chromium') in
            // headed mode because MV3 extensions don't load in the old
            // headless shell. On CI the `e2e-extension` job wraps this in
            // xvfb-run. See fixtures.ts for the flag set.
            name: 'extension',
            testDir: './tests/extension',
            testMatch: /.*\.spec\.ts/,
            // Skip the live/ subtree — those need LIVE=1 + a captured session.
            testIgnore: /live\//,
            timeout: 90_000,
        },
        {
            // Live extension specs hit a real Salesforce sandbox. Gated by
            // LIVE=1: without the flag we point testDir at a non-existent
            // folder so Playwright reports "no tests found" and exits 0
            // rather than failing hard on missing credentials.
            name: 'live-extension',
            testDir: LIVE ? './tests/extension/live' : './tests/extension/__disabled__',
            testMatch: /.*\.live\.spec\.ts/,
            timeout: 120_000,
            retries: process.env.CI ? 1 : 0,
            globalSetup: LIVE ? './globalSetup.live.ts' : undefined,
        },
    ],
});
