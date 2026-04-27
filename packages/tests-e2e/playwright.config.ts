import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000' },
    reporter: [['list']],
    forbidOnly: !!process.env.CI,
});
