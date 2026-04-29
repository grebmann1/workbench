import { defineConfig } from '@playwright/test';

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
            name: 'extension',
            testDir: './tests/extension',
            testMatch: /.*\.spec\.ts/,
            timeout: 90_000,
        },
    ],
});
