---
name: repo-validation-selector
description: Select the smallest correct validation commands for this repo based on touched paths, while distinguishing lint, build/type, and runtime confidence.
---

# Repo Validation Selector

Use this skill after code changes to choose minimal, sufficient verification.

## Goal

Prevent both:

- **under-validation** (missing regressions)
- **over-validation** (wasting time on full-repo checks)

## Core principle

Lint, build/type, and runtime/e2e are different signals. Report them separately.

## Path-to-command decision rules

## 1) Chat extension-only changes

When changes are only under `packages/extension-chat/*`:

```bash
npx eslint <changed chat .js/.ts files>
npx prettier --check <changed chat .html/.css/.js/.ts files>
npm run build:extension:chat:main
```

Optional (if requested): extension Playwright subset.

## 2) Core extension-only changes

When changes are only under `packages/extension/*`:

```bash
npx eslint <changed core .js/.ts files>
npx prettier --check <changed core .html/.css/.js/.ts files>
npm run build:extension:main
```

## 3) Shared runtime changes

When touching `packages/lwc/main/*`, `packages/lwc/extension/*`, or `packages/lwc/shared/*`:

```bash
npx eslint <changed .js/.ts files>
npx prettier --check <changed .html/.css/.js/.ts files>
npm run build:extension:main
npm run build:extension:chat:main
```

Also run `npm run build:shared` if:

- manifest generation may be impacted
- shared module compilation paths changed
- application registry behavior changed

## 4) Application manifest/app scaffolding updates

When touching:

- `packages/lwc/applications/*`
- `tools/scripts/generate_application_manifest.js`

Run:

```bash
npm run build:shared
npm run build:extension:main
```

Include chat build too when shared `lwc` files changed.

## 5) E2E selection

Only run Playwright when requested or when runtime confidence is needed.

Baseline commands:

```bash
npm run test:e2e:ext
```

If known baseline failures exist, classify as baseline vs new regression and, when useful, run targeted specs.

## Output contract (required)

Always report verification in this structure:

1. **Lint/format**
    - commands
    - pass/fail
2. **Build/type**
    - commands
    - pass/fail
3. **Runtime/E2E confidence**
    - commands
    - pass/fail
    - baseline issues vs new regressions

## Anti-patterns

- Don’t claim “fully validated” from lint-only.
- Don’t default to `npm run validate` unless explicitly requested.
- Don’t run full e2e by default for narrow, local UI tweaks.
