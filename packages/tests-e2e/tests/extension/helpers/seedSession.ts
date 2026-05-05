import fs from 'node:fs';
import path from 'node:path';

import type { BrowserContext } from '@playwright/test';

const AUTH_DIR = path.resolve(__dirname, '../../../.auth');
const SESSION_FILE = path.join(AUTH_DIR, 'session.json');

const CAPTURE_HINT =
    'Live tests need a captured sandbox session. Run `npm run e2e:capture-session` and complete the OAuth flow, then retry.';

/**
 * Load `.auth/session.json` into the extension's `chrome.storage.local`
 * via the extension's service worker. Call this once per persistent
 * context before the first app page opens. Subsequent calls are
 * idempotent (chrome.storage.local.set merges).
 *
 * The session file shape is whatever `capture-session.mjs` dumped —
 * typically `{ connections, openai_key }`. We do not assert a shape here;
 * if the extension's storage schema changes, update the capture script.
 */
export async function seedSession(context: BrowserContext): Promise<void> {
    if (!fs.existsSync(SESSION_FILE)) {
        throw new Error(
            `${SESSION_FILE} is missing.\n${CAPTURE_HINT}`
        );
    }
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    let payload: Record<string, unknown>;
    try {
        payload = JSON.parse(raw);
    } catch (err: any) {
        throw new Error(`session.json is not valid JSON: ${err?.message}\n${CAPTURE_HINT}`);
    }

    const [sw] = context.serviceWorkers();
    if (!sw) {
        // The extension service worker is lazy. Opening any extension page
        // wakes it, but for a live run the appPage fixture hasn't opened
        // a page yet. Wait a bounded time for SW to register.
        try {
            await context.waitForEvent('serviceworker', { timeout: 10_000 });
        } catch {
            throw new Error(
                'Extension service worker did not register within 10s — is dist/extension built?'
            );
        }
    }
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(async cfg => {
        // eslint-disable-next-line no-undef
        await chrome.storage.local.set(cfg);
    }, payload);
}
