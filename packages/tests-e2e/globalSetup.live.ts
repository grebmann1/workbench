/**
 * Live-extension globalSetup — runs once before any spec in the
 * live-extension project. Validates that .auth/session.json exists and
 * is fresh, so the developer sees one clear error rather than six per-spec
 * INVALID_SESSION_ID failures.
 */
import fs from 'node:fs';
import path from 'node:path';

const SESSION_FILE = path.resolve(__dirname, '.auth/session.json');
const AGE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const HINT =
    'Run `npm run e2e:capture-session` and complete the OAuth wizard against your sandbox, then retry.';

export default async function globalSetup(): Promise<void> {
    if (!fs.existsSync(SESSION_FILE)) {
        throw new Error(`Missing ${SESSION_FILE}.\n${HINT}`);
    }
    const payload = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const validatedAt = typeof payload._validatedAt === 'number' ? payload._validatedAt : 0;
    const age = Date.now() - validatedAt;
    if (age > AGE_LIMIT_MS) {
        throw new Error(`session.json is ${Math.floor(age / 86_400_000)} days old.\n${HINT}`);
    }
}
