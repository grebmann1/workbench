---
name: lwc-oss-safe-changes
description: Safely implement or refactor LWC OSS code in this repo (LWR + Rollup targets) while preserving cross-target behavior across core extension, chat extension, and shared runtime modules.
---

# LWC OSS Safe Changes

Use this skill when editing LWC components/modules under:

- `packages/lwc/main/*`
- `packages/lwc/extension/*`
- `packages/lwc/applications/*`
- `packages/lwc/shared/*`

## Goal

Make LWC OSS changes that are small, target-aware, and regression-safe.

## Repo-specific constraints

- This repo builds multiple targets (`extension`, `extension-chat`, workers, server/web).
- Shared LWC changes can impact both:
    - `packages/extension/*` (core extension)
    - `packages/extension-chat/*` (chat extension)

## Golden rules

1. Prefer local edits over broad refactors.
2. Preserve backward-compatible defaults in shared components.
3. If behavior must differ by target, use explicit `@api` flags.
4. Do not degrade one target while fixing another.

## Safe change patterns

### 1) Target-specific UI behavior

- Add optional API flags in shared components:
    - `@api hideLlmSettingsCard = false`
    - `@api useInlineOnboarding = false`
- Enable flags only from target-specific host templates.

### 2) State and events

- Keep public event contracts stable (`detail` shape + event name).
- Prefer additive event payload fields over breaking changes.

### 3) Component composition

- Keep role boundaries clear:
    - host component owns navigation/layout mode
    - shared component owns internal controls and emits events

## Required verification

After LWC OSS edits:

1. Targeted lint/format:

```bash
npx eslint <changed .js/.ts files>
npx prettier --check <changed .html/.css/.js/.ts files>
```

2. Build matrix:

- If only target-local LWC changed, build that target.
- If shared LWC changed, build both:

```bash
npm run build:extension:main
npm run build:extension:chat:main
```

3. If shared module wiring/manifests changed:

```bash
npm run build:shared
```

## Output checklist

- LWC files changed (by folder)
- Any target guard/flag added
- Verification commands and outcomes
- Residual risk (if e2e/manual not run)
