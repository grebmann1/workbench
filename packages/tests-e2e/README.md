# tests-e2e

Playwright end-to-end tests for Workbench. Three projects:

| Project          | Gate            | What it covers                                       |
| ---------------- | --------------- | ---------------------------------------------------- |
| `smoke`          | `E2E=1`         | Landing site + server endpoints (no extension)       |
| `extension`      | `E2E=1`         | In-extension LWC apps, **no org connection required** |
| `live-extension` | `E2E=1 LIVE=1`  | In-extension LWC apps against a **real Salesforce sandbox** |

The offline projects run in every environment. `live-extension` requires a
pre-captured sandbox session — see below.

## Prereqs

```sh
npx playwright install chromium
npm run build:prod:extension   # or build:extension:main — faster
```

## Running

```sh
# Landing/server smokes
E2E=1 E2E_BASE_URL=http://localhost:27100 npm run test:e2e:smoke

# Offline extension apps (urlencoder, textcompare, files, smartinput, …)
npm run test:e2e:ext

# Live-org extension apps (soql, auditTrail, jobs, metadata, recordviewer, org)
npm run test:e2e:live
```

Without `LIVE=1`, the live project's test directory is empty — Playwright
reports "no tests found" and exits 0, so the live suite never blocks CI
environments that lack credentials.

## Live-org workflow

Live tests inject a pre-captured connection into `chrome.storage.local`
before each spec, skipping the OAuth UI entirely. The session lives in
`.auth/session.json` (gitignored).

**First run / after the session expires:**

```sh
npm run e2e:capture-session
```

This launches a headed Chromium with the Workbench extension loaded. Go
through the normal connection wizard against your sandbox. When the
alias appears in the extension header, close the window. The script writes
`.auth/session.json` and prints the alias + username captured.

**Then:**

```sh
npm run test:e2e:live
```

The session stays valid as long as the refresh token works — re-run
`e2e:capture-session` if live specs start failing with `INVALID_SESSION_ID`.

## Scope

- ✅ In-extension LWC apps (shell + 2–3 user journeys per app).
- ✅ Live SOQL / audit / jobs / metadata flows against a sandbox.
- ❌ OAuth UI itself (tested manually once per session capture).
- ❌ Electron + VS Code targets (out of scope per testing strategy).
- ❌ Visual regression / performance budgets.
