# Extension Safety Shared Checklist

Use this checklist whenever working with either:

- `chat-extension-safe-changes`
- `core-extension-safe-changes`

## Scope declaration

- Explicitly label request scope as one of:
    - `chat-only`
    - `core-only`
    - `shared`

## Guardrails

- Prefer target-local files first.
- If shared files are changed, keep defaults backward-compatible.
- Use explicit flags/conditions for target-specific behavior.

## Sidepanel gesture safety

- Keep `chrome.sidePanel.open()` in action/command user-gesture paths.
- Avoid calling `open()` from generic runtime message handlers.

## Required verification

1. Targeted lint/format on changed files.
2. Build the primary target affected.
3. If any shared file changed, build the secondary extension target too.

### Command baseline

```bash
npx eslint <changed .js/.ts files>
npx prettier --check <changed .html/.css/.js/.ts files>
```

Primary/secondary build matrix:

- Chat primary: `npm run build:extension:chat:main`
- Core primary: `npm run build:extension:main`
- Shared edits: run both commands

## Reporting template

- Files changed by target bucket
- Guardrails applied
- Verification commands + pass/fail
- Residual risk or known baseline issues
