#!/usr/bin/env node
/**
 * Capture a Workbench sandbox session for Playwright live-extension tests.
 *
 * Flow:
 *   1. Launches a headed persistent-context Chromium with the built
 *      extension loaded (same flags as tests/extension/fixtures.ts).
 *   2. Opens the Workbench shell — you complete the OAuth wizard manually.
 *   3. Once `chrome.storage.local.connections` has at least one entry,
 *      the script dumps the storage to `packages/tests-e2e/.auth/session.json`
 *      and exits.
 *
 * Re-run this script when live tests start failing with
 * INVALID_SESSION_ID — typically when the refresh token is rotated.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const EXT_DIR = path.join(ROOT, 'dist/extension');
const AUTH_DIR = path.resolve(__dirname, '../.auth');
const SESSION_FILE = path.join(AUTH_DIR, 'session.json');

// How long to wait for the user to finish the OAuth dance.
const OAUTH_TIMEOUT_MS = 5 * 60_000;

function deriveExtensionId(manifestKeyB64) {
    const pub = Buffer.from(manifestKeyB64, 'base64');
    const hash = crypto.createHash('sha256').update(pub).digest('hex');
    return hash
        .slice(0, 32)
        .split('')
        .map(c => String.fromCharCode(parseInt(c, 16) + 'a'.charCodeAt(0)))
        .join('');
}

async function main() {
    if (!fs.existsSync(path.join(EXT_DIR, 'manifest.json'))) {
        throw new Error(
            `Extension not built at ${EXT_DIR}. Run \`npm run build:prod:extension\` (or build:extension:main) first.`
        );
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
    if (!manifest.key) {
        throw new Error(
            'manifest.json is missing the "key" field — capture script needs a stable extension id.'
        );
    }
    const extensionId = deriveExtensionId(manifest.key);

    fs.mkdirSync(AUTH_DIR, { recursive: true });

    const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        headless: false,
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [
            `--disable-extensions-except=${EXT_DIR}`,
            `--load-extension=${EXT_DIR}`,
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });

    try {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/views/app.html`);

        console.log('');
        console.log('  → Connect to your SANDBOX in the browser window that just opened.');
        console.log('    When the alias appears in the header, the script will auto-save.');
        console.log('');

        // Ensure the service worker is registered so we can poll chrome.storage.local.
        let [sw] = context.serviceWorkers();
        if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 30_000 });

        const deadline = Date.now() + OAUTH_TIMEOUT_MS;
        let connectionsCount = 0;
        while (Date.now() < deadline) {
            const snapshot = await sw.evaluate(async () => {
                // eslint-disable-next-line no-undef
                const all = await chrome.storage.local.get(null);
                return all;
            });
            const conns = snapshot.connections;
            const count = Array.isArray(conns) ? conns.length : conns ? Object.keys(conns).length : 0;
            if (count > 0 && count !== connectionsCount) {
                connectionsCount = count;
                console.log(`  ✓ Detected ${count} connection(s). Waiting 2s for storage writes to settle…`);
                await new Promise(r => setTimeout(r, 2_000));
                const finalSnapshot = await sw.evaluate(async () => {
                    // eslint-disable-next-line no-undef
                    return await chrome.storage.local.get(null);
                });
                fs.writeFileSync(SESSION_FILE, JSON.stringify(finalSnapshot, null, 2));
                const sampleAlias = Array.isArray(finalSnapshot.connections)
                    ? finalSnapshot.connections[0]?.alias
                    : Object.values(finalSnapshot.connections || {})[0]?.alias;
                console.log('');
                console.log(`  ✅ Saved ${SESSION_FILE}`);
                console.log(`     alias: ${sampleAlias ?? '(unknown)'}`);
                console.log('');
                console.log('  Close the browser window to exit, or wait — script will exit now.');
                return;
            }
            await new Promise(r => setTimeout(r, 1_000));
        }
        throw new Error(
            `Timed out after ${OAUTH_TIMEOUT_MS / 60_000} minutes waiting for a connection. Nothing was saved.`
        );
    } finally {
        await context.close();
    }
}

main().catch(err => {
    console.error(err?.stack || err);
    process.exit(1);
});
