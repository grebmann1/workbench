import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:27100' },
    reporter: process.env.CI
        ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
        : [['list']],
    forbidOnly: !!process.env.CI,
});
