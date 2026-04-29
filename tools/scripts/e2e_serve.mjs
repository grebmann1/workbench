#!/usr/bin/env node
// tools/scripts/e2e_serve.mjs
//
// Boots the Express API (packages/server) and the apps/ui Vite dev
// server in parallel, polls each for readiness, and prints `E2E_READY`
// once both respond OK. Intended for CI: the spawned children are left
// running (detached) so the parent job can then run Playwright; the CI
// job is responsible for tearing them down at job end.
//
// Exit codes:
//   0  — both servers responded within the timeout window ("E2E_READY")
//   1  — one or both servers did not come up in time (the last
//        non-200 response for each URL is printed to stderr first)

import { spawn } from 'node:child_process';
import http from 'node:http';

const API_URL = 'http://localhost:3000/config';
const UI_URL = 'http://localhost:27100/welcome/';
const TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

function log(msg) {
    process.stdout.write(`[e2e_serve] ${msg}\n`);
}

function spawnDetached(cmd, args, opts = {}) {
    const child = spawn(cmd, args, {
        stdio: 'inherit',
        detached: true,
        shell: process.platform === 'win32',
        ...opts,
    });
    // Unref so the parent can exit without waiting for these children.
    child.unref();
    return child;
}

function fetchStatus(url) {
    return new Promise(resolve => {
        const req = http.get(url, res => {
            // Drain the response so the socket can free up.
            res.resume();
            resolve({ status: res.statusCode ?? 0, error: null });
        });
        req.on('error', err => resolve({ status: 0, error: err.message }));
        req.setTimeout(2_000, () => {
            req.destroy(new Error('request timeout'));
        });
    });
}

async function waitFor(url, timeoutMs) {
    const start = Date.now();
    let last = { status: 0, error: 'not attempted' };
    while (Date.now() - start < timeoutMs) {
        last = await fetchStatus(url);
        if (last.status >= 200 && last.status < 400) return { ok: true, last };
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    return { ok: false, last };
}

async function main() {
    log('starting Express API (npm run start:dev:server)…');
    spawnDetached('npm', ['run', 'start:dev:server']);

    log('starting Vite dev (cd apps/ui && npm run dev)…');
    spawnDetached('npm', ['run', 'dev'], { cwd: 'apps/ui' });

    log(`polling ${API_URL} and ${UI_URL} (timeout ${TIMEOUT_MS}ms each)…`);
    const [api, ui] = await Promise.all([
        waitFor(API_URL, TIMEOUT_MS),
        waitFor(UI_URL, TIMEOUT_MS),
    ]);

    if (!api.ok || !ui.ok) {
        if (!api.ok) {
            process.stderr.write(
                `[e2e_serve] API at ${API_URL} never came up — last status=${api.last.status} error=${api.last.error}\n`
            );
        }
        if (!ui.ok) {
            process.stderr.write(
                `[e2e_serve] UI at ${UI_URL} never came up — last status=${ui.last.status} error=${ui.last.error}\n`
            );
        }
        process.exit(1);
    }

    log('E2E_READY');
    // Explicitly write the sentinel on its own line so CI can grep for it.
    process.stdout.write('E2E_READY\n');
    process.exit(0);
}

main().catch(err => {
    process.stderr.write(`[e2e_serve] fatal: ${err?.stack || err}\n`);
    process.exit(1);
});
