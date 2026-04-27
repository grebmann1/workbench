# tests-e2e

Playwright smoke tests for Workbench's hosted web target. Gated behind `E2E=1`
so regular `npm test` and CI runs stay fast; running without the flag prints
a short message and exits 0.

## Usage

One-time (downloads browsers the first time only):

```sh
npx playwright install chromium
```

Run the smoke test against a local dev server:

```sh
E2E=1 E2E_BASE_URL=http://localhost:3000 npm run test:e2e:smoke
```

Against a deployed environment, point `E2E_BASE_URL` at the host to test.

## Scope

Non-auth smoke only. OAuth-gated flows (connection wizard, app surfaces
that need `cookies`/`instanceUrl`) are NOT exercised here — they belong in
the jsforce-functional track when credentials are available.
