import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverUrl = process.env.VITE_SERVER_URL || 'http://localhost:3000';

export default defineConfig({
    base: process.env.UI_BASE_PATH || '/',
    server: {
        host: '0.0.0.0',
        port: 27100,
        // Cross-origin links (docs, vscode IDE) are env-driven absolute URLs — see .env.development.
        // Only same-origin paths handled by the Express API need a dev proxy here.
        proxy: {
            '/api': serverUrl,
            '/oauth2': serverUrl,
        },
    },
    plugins: [react()],
    build: {
        outDir: '../../dist/ui',
        emptyOutDir: true,
        assetsDir: 'ui-assets',
    },
});
