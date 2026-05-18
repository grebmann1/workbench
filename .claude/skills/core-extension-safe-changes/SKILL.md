---
name: core-extension-safe-changes
description: Safely modify the classic/core extension in `packages/extension/*` without regressing chat extension behavior in `packages/extension-chat/*`. Use when working on core side panel, overlay, worker logic, manifest wiring, or extension scripts/views.
---

# Core Extension Safe Changes

Use this skill whenever the request targets the classic/core extension and must not break chat extension behavior.

## Goal

Deliver core-extension changes while preserving baseline behavior for:

- `packages/extension-chat/*` (chat extension target)
- shared host/runtime modules used by both targets

Keep the diff scoped, intentional, and regression-verified.

## Architecture split (must respect)

- **Core extension target:** `packages/extension/*`
    - Primary extension worker, scripts, views, overlay integrations.
- **Chat extension target:** `packages/extension-chat/*`
    - Separate manifest/worker/surface with its own UX and behavior.
- **Shared runtime/UI:** `packages/lwc/main/*`, `packages/lwc/extension/*`, `packages/lwc/shared/*`
    - Shared-file changes must preserve both targets.

## Golden rules

1. **Default to core-local edits first**
    - Prefer `packages/extension/src/*` when request is core-only.
2. **Do not mutate chat target unless explicitly requested**
    - Avoid `packages/extension-chat/*` edits for core-only asks.
3. **If shared file changes are required, guard by context**
    - Keep defaults compatible with existing behavior.
    - Add explicit flags/conditions when behavior should differ by target.
4. **Avoid hidden coupling**
    - Reused helpers should keep each target’s semantics explicit.

## Safe file map

### Preferred core-only edit surface

- `packages/extension/src/workers/background.js`
- `packages/extension/src/inject/*`
- `packages/extension/src/scripts/*`
- `packages/extension/src/views/*`
- `packages/extension/manifest.template.json`

### Shared files (edit only with clear guardrails)

- `packages/lwc/extension/*`
- `packages/lwc/main/*`
- `packages/lwc/shared/*`

If touching shared files, verify both core and chat extension builds.

## Common pitfalls and how to avoid them

### 1) Side panel gesture-context regressions

Chrome may throw:
`sidePanel.open() may only be called in response to a user gesture`

Guideline:

- Call `chrome.sidePanel.open()` only in action/command gesture paths.
- Avoid calling `open()` from generic async/runtime message paths.

### 2) Core UX leaking into chat target

When shared components are edited for core behavior:

- Add target-aware conditions.
- Keep shared defaults stable.
- Ensure chat usage does not inherit unintended core UI/behavior.

### 3) Build target mismatch

A green core build does not prove chat safety when shared files changed.

- Core verify: `npm run build:extension:main`
- Chat regression verify (if shared files changed): `npm run build:extension:chat:main`

## Required verification checklist

Run smallest relevant checks for the touched scope:

1. Targeted lint/format on changed files:

```bash
npx eslint <changed .js/.ts files>
npx prettier --check <changed .html/.css/.js/.ts files>
```

2. Core bundle verification:

```bash
npm run build:extension:main
```

3. Chat regression verification (required if any shared file changed):

```bash
npm run build:extension:chat:main
```

4. If e2e tests are requested, classify failures clearly:

- baseline pre-existing test issue
- new regression caused by change
- environment/test flake

## Implementation playbook

1. Confirm request scope is core-only or cross-target.
2. Edit core-local files first.
3. If shared changes are unavoidable, add explicit guardrails for target behavior.
4. Run targeted lint/format.
5. Run core build.
6. Run chat build when shared files changed.
7. Summarize:
    - what changed
    - what intentionally remained untouched
    - verification commands and outcomes

## Response style while applying this skill

- State scope boundaries explicitly (`core-only` vs `shared` vs `chat`).
- Call out cross-target risk before changing shared modules.
- Be explicit when a failure is unrelated baseline noise.

## Shared checklist sync

For common cross-target safety steps, also follow:

- `.claude/skills/extension-safety-shared-checklist.md`
