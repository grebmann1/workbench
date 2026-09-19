---
name: shared-runtime-safe-changes
description: Safely modify shared runtime layers (`packages/lwc/main/*`, `packages/lwc/extension/*`, `packages/lwc/shared/*`) without regressing either core extension (`packages/extension/*`) or chat extension (`packages/extension-chat/*`).
---

# Shared Runtime Safe Changes

Use this skill when a request touches shared code consumed by multiple targets.

## Goal

Ship shared-runtime changes with explicit guardrails and cross-target verification.

## When to trigger

Trigger if any changed file is under:

- `packages/lwc/main/*`
- `packages/lwc/extension/*`
- `packages/lwc/shared/*`

Especially when changing:

- shared components used by both targets
- connector/store/agent runtime behavior
- sidepanel-related shared UI/logic

## Risk model

Shared edits can silently break one target while another still passes.

- Core extension target: `packages/extension/*`
- Chat extension target: `packages/extension-chat/*`

Never assume target parity without running both target builds after shared edits.

## Golden rules

1. Keep defaults backward compatible.
2. Prefer explicit feature flags for target-specific behavior.
3. Avoid hard-coding chat/core assumptions into shared modules.
4. Keep diffs minimal and scoped to the request.

## Guardrail patterns

### Target-specific behavior in shared UI

- Add API flags with safe defaults:
    - `@api useInlineOnboarding = false`
    - `@api hideLlmSettingsCard = false`
- Enable only in the consuming target template.

### Runtime sidepanel behavior

- `chrome.sidePanel.open()` should stay in user-gesture paths only (action/command).
- Avoid `open()` in generic runtime message handlers unless gesture is guaranteed.

### Shared state/config

- Avoid global behavior changes unless requested.
- Prefer additive changes over replacing existing semantics.

## Required verification matrix

Run these after shared-runtime edits:

1. Targeted lint/format:

```bash
npx eslint <changed .js/.ts files>
npx prettier --check <changed .html/.css/.js/.ts files>
```

2. Core extension regression:

```bash
npm run build:extension:main
```

3. Chat extension regression:

```bash
npm run build:extension:chat:main
```

4. If relevant to shared manifests/registry:

```bash
npm run build:shared
```

## Reporting format

Always report:

- Shared files touched
- Target-specific guardrails added (if any)
- Commands run and pass/fail
- Residual risk (if tests/builds are partially unavailable)

## Out of scope

- Chat-only changes fully isolated to `packages/extension-chat/*` (use `chat-extension-safe-changes`)
- Core-only changes fully isolated to `packages/extension/*` (use `core-extension-safe-changes`)
