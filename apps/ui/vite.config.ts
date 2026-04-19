import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverUrl = process.env.VITE_SERVER_URL || 'http://localhost:3000';

export default defineConfig({
    base: process.env.UI_BASE_PATH || '/',
    server: {
        host: '0.0.0.0',
        port: 27100,
        proxy: {
            '/app': serverUrl,
            '/docs': serverUrl,
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
