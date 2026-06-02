---
name: error-recovery
description: Triage browser automation failures with a deterministic recovery loop for login redirects, Lightning spinners, blocked modals, and stale element handles.
---

# Browser Error Recovery

Use this skill when a browser automation step fails (selector timeout, click failure, stale handle, unexpected navigation).

## Always do first

1. Capture current URL and title.
2. Capture a screenshot with `logImage(...)`.
3. Gather minimal page state (short body text + key actions/buttons).

## Triage tree

- Login redirect detected (`/secur/login.jsp` or related auth pages):
  - reconnect with `sf org connect --target-org <alias>`
  - retry navigation
- Session expired indicators (toast/body text/401):
  - reconnect and retry
- Spinner present (`.slds-spinner_container[role="status"]` or `[aria-busy="true"]`):
  - run `waitForLightning(page)` and retry the last action
- Modal blocking interaction (`role="dialog"`):
  - dismiss with `Escape` first
  - if still present, click modal close control and retry
- Stale element/reference after route change:
  - never reuse old refs
  - run `getSnapshot(page)` again and acquire a new ref
- Landed on Classic (`/_ui/...`) unexpectedly:
  - warn and switch back to Lightning URL patterns or `sf open ...`

## Retry discipline

- Retry at most twice per step with fresh snapshot context.
- If still failing after two loops, ask user to choose next action (`ask_user`).

## When to ask user

- Destructive path requires confirmation.
- Target intent is ambiguous after two failed attempts.

## Boundaries

- Experience Cloud (`/s/...`) routing can differ significantly; treat as special-case scope.
- `frontDoorUrl` logic applies to Salesforce org pages, not generic `chrome-extension://` pages.
