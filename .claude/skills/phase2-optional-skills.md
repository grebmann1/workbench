# Phase 2 Optional Skills (Deferred)

These skills are intentionally deferred to keep the local skill catalog lean.
Add them only if the corresponding workflow becomes a recurring pain point.

## 1) playwright-e2e-bootstrap-and-triage

**When to add**

- Frequent debugging of Playwright setup, env-gating, or extension test instability.

**Primary scope**

- `packages/tests-e2e/playwright.config.ts`
- `packages/tests-e2e/README.md`
- extension/live-extension project setup and baseline failure classification

**Expected command playbook**

```bash
npx playwright install chromium
npm run test:e2e:serve
E2E=1 E2E_BASE_URL=http://localhost:27100 npm run test:e2e:smoke
E2E=1 npm run test:e2e:ext
```

## 2) desktop-release-preflight

**When to add**

- Frequent release pipeline issues for desktop packaging/publish.

**Primary scope**

- `.github/workflows/desktop-release.yml`
- `packages/desktop/README.md`
- packaging/signing/publish readiness checks

**Expected command playbook**

```bash
npm --prefix packages/desktop ci --no-audit --no-fund
npm --prefix packages/desktop run test
npm run build:shared && npm run build:workers && npm run build:extension
npm --prefix packages/desktop run make
```

## Deferred by default

Do not create these skills proactively unless requested or justified by repeated incidents.
