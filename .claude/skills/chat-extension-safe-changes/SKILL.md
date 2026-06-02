---
name: chat-extension-safe-changes
description: Safely modify `packages/extension-chat/*` without regressing the original extension in `packages/extension/*`. Use when working on chat side panel UX, background worker behavior, manifest wiring, or chat-only scripts/views.
---

# Chat Extension Safe Changes

Use this skill whenever the request targets the chat extension and must not affect the original extension behavior.

## Goal

Deliver chat-only changes while preserving baseline behavior for:

- `packages/extension/*` (original extension)
- `packages/lwc/main/*` shared host flows used by both targets

Keep changes scoped, explicit, and regression-verified.

## Architecture split (must respect)

- **Chat extension target:** `packages/extension-chat/*`
    - Separate manifest template, worker, scripts, views, and build target.
- **Original extension target:** `packages/extension/*`
    - Existing production behavior must remain unchanged unless explicitly requested.
- **Shared runtime/UI:** `packages/lwc/main/*`, `packages/lwc/extension/*`, `packages/lwc/shared/*`
    - Any shared-file change must be gated so chat-specific UX does not leak into original extension.

## Golden rules

1. **Default to chat-local edits first**
    - Prefer `packages/extension-chat/src/*` over shared modules.
2. **If a shared component must change, add explicit chat-only flags**
    - Example pattern: `@api hideLlmSettingsCard = false`, then pass it only from chat host.
3. **Never “mirror edit” original extension files unless requested**
    - Do not touch `packages/extension/src/*` for chat-only asks.
4. **Avoid implicit behavior coupling**
    - If reusing shared worker helpers, ensure chat semantics stay independent.

## Safe file map

### Preferred chat-only edit surface

- `packages/extension-chat/src/workers/background-chat.js`
- `packages/extension-chat/src/scripts/*`
- `packages/extension-chat/src/views/*`
- `packages/extension-chat/manifest.template.json`

### Shared files (edit only with guards)

- `packages/lwc/extension/panels/chat/*`
- `packages/lwc/main/agent/aiSettings/*`
- `packages/lwc/main/agent/onboardaiProvider/*`

If touching shared files, ensure default behavior remains original-extension compatible.

## Common pitfalls and how to avoid them

### 1) Side panel gesture errors

Chrome can throw:
`sidePanel.open() may only be called in response to a user gesture`

Guideline:

- Call `chrome.sidePanel.open()` only from action/command user gesture paths.
- Do not call `open()` from generic runtime message handlers.

### 2) Chat UX leaking into original extension

When introducing modal/full-page chat UX using shared components:

- Add `@api` feature flags with safe defaults.
- Enable flags only from chat host templates.

### 3) Build target confusion

Chat and original extension are separate bundles:

- Chat verify: `npm run build:extension:chat:main`
- Original verify: `npm run build:extension:main`

A chat-only green build is not enough when shared files changed.

## Required verification checklist

Run the smallest relevant checks for touched scope:

1. Targeted lint/format on changed files:

```bash
npx eslint <changed .js/.ts files>
npx prettier --check <changed .html/.css/.js/.ts files>
```

2. Chat bundle verification:

```bash
npm run build:extension:chat:main
```

3. Original extension regression verification (required if any shared file changed):

```bash
npm run build:extension:main
```

4. If Playwright is requested, report baseline status clearly:

- `npm run test:e2e:ext` may fail due to existing unrelated test issues.
- Distinguish baseline failures from new regressions.

## Implementation playbook

1. Identify if request is chat-local or shared.
2. If shared, design a gated flag/API so default behavior remains unchanged.
3. Implement minimal diff.
4. Run chat build.
5. Run original extension build if shared files were touched.
6. Summarize:
    - what changed
    - what was intentionally not changed
    - exact verification run and outcomes

## Response style while applying this skill

- Be explicit about scope boundaries (`chat-only` vs `shared`).
- Call out regression risk before editing shared files.
- Report failures with root-cause classification:
    - new regression
    - pre-existing baseline issue
    - environment/test flake

## Shared checklist sync

For common cross-target safety steps, also follow:

- `.claude/skills/extension-safety-shared-checklist.md`
