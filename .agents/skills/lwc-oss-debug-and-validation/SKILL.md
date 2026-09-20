---
name: lwc-oss-debug-and-validation
description: Debug and validate LWC OSS issues in this repo with a minimal, path-based command strategy (lint vs build vs e2e) and clear baseline-vs-regression classification.
---

# LWC OSS Debug and Validation

Use this skill when a user reports LWC runtime/UI issues, regressions, or build failures.

## Goal

Find root cause quickly and run only the smallest meaningful validation set.

## Triage flow

1. Reproduce symptom scope:
    - core extension only
    - chat extension only
    - shared LWC surface
2. Map touched files to target(s).
3. Run focused checks in this order:
    - lint/format
    - build(s)
    - optional e2e/manual proof

## Command matrix

### Lint/format (always first)

```bash
npx eslint <changed .js/.ts files>
npx prettier --check <changed .html/.css/.js/.ts files>
```

### Build checks

- Core extension path:

```bash
npm run build:extension:main
```

- Chat extension path:

```bash
npm run build:extension:chat:main
```

- Shared LWC changes:

```bash
npm run build:extension:main
npm run build:extension:chat:main
```

- If shared registry/manifests involved:

```bash
npm run build:shared
```

## Playwright guidance

Only run Playwright when explicitly needed for runtime confidence.

Primary command:

```bash
npm run test:e2e:ext
```

If known baseline failures exist:

- classify failures as:
    - pre-existing baseline
    - new regression from current diff
    - environment/flake
- avoid presenting baseline noise as new breakage.

## Common LWC OSS regression classes

- Shared component default changed unintentionally
- Event contract drift (`detail` fields renamed/removed)
- Target-specific behavior missing guard flag
- Sidepanel gesture-context violation in background interaction paths

## Reporting template

- Repro scope: `core-only | chat-only | shared`
- Root cause summary
- Validation run:
    - lint/format
    - build/type
    - runtime/e2e
- Confidence + remaining gaps
