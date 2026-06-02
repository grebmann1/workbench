# Slack feedback follow-up — actionable items

## Context

A user-feedback review of `#sf-workbench` for the last 10 days (2026-05-08 → 2026-05-18) surfaced 11 items. Six are already resolved or out of scope:

- **F. Documentation Explorer search hang** — already fixed in commit `2cee9bf0` (`packages/lwc/main/pages/documentation/doc/app/app.js:316-325` adds `response.ok` guard + try/catch).
- **C. SOQL text-mode discoverability** — resolved on Slack (Francesco found the inline "Run SQL" CodeLens after a screen-recording reply).
- **D. Browser automation hangs on drag-and-drop / clicking** — **explicitly excluded** from this plan.
- **G. Chat give-up / model unresponsiveness** — root-caused but not part of this plan; user confirmed it might have been an Anthropic 4.7 incident.
- **J. Katherine's `invalid_grant: ip restricted` OAuth error** — external (org IP allowlist / zscaler), not a tool fix.
- **K. Danilo's "does CSV bulk + sfbill_Transaction__c still work?"** — Guillaume asked to continue in a side thread; not engineering work.

This plan turns the **four remaining unfixed items** into concrete, scoped engineering tasks. Each names the exact file:line where the change lands and the existing pattern to reuse.

---

## TL;DR

| Item | Severity | Fix | Effort |
|---|---|---|---|
| **A** Org Overview unreachable when header tabs disabled | UX bug | Add `org` to the launcher's `application_mapping`; keyboard shortcut already works | XS |
| **I** SObject Explorer skips SfdcInternalQA internal objects | Enhancement | Call `ensureSessionClientCallOption(connector)` before `describeGlobal()` | XS |
| **B** "Open in VS Code" should auto-download metadata | Enhancement | Replace `window.open(url)` with retrieve-then-open-in-VSCode-editor flow | M |
| **H** Customer-org guardrail for the AI agent | Compliance | Query `Organization.TrialExpirationDate`/`OrganizationType` once on connector login; gate agent UI on a Redux flag | S |

Recommended sequencing: **A → I → H → B**. A and I are nearly free wins. H is compliance-relevant and unblocks fearful adoption. B is the largest scope and worth doing last.

---

## Item A — Org Overview unreachable when header tabs are disabled

### Problem
With `CACHE_CONFIG.UI_IS_APPLICATION_TAB_VISIBLE` set to `false`, the entire app-tab bar (`packages/lwc/main/component/skeleton/header/header.html:40-53`, gated by `<template lwc:if={isApplicationTabVisible}>`) is hidden. The `org` application has `isMenuVisible: false` in `packages/lwc/main/application/applicationRegistry/applicationRegistry.ts:238-254`, so it's not in the side menu either. Net result: only users who know the keyboard shortcut (`CACHE_CONFIG.SHORTCUT_OVERVIEW`, `packages/lwc/main/component/skeleton/app/shortcuts.ts:39-48`) can reach it.

### Fix
Add the `org` app to the launcher modal's `application_mapping` at `packages/lwc/main/component/slds/launcher/launcher.ts:5-68`. The launcher is the always-available alternate entry point (it does not depend on `isApplicationTabVisible`).

- One entry: `{ id: 'org', label: 'Org Overview', icon: '<existing org icon>' }` matching the surrounding mapping shape.
- No registry change. No setting change. No header change.
- Keyboard shortcut already works as a backup; this just gives mouse-only users a discoverable path.

### Verification
1. Toggle "Header Application Tabs" off in Settings.
2. Open the launcher (existing UI affordance).
3. "Org Overview" appears and navigates to the `org` app.

---

## Item I — SObject Explorer should list internal SfdcInternalQA objects

### Problem
`packages/lwc/applications/object/app/app.ts:196` calls `connector.describeGlobal()` to populate the SObject Explorer. The `client_id = SfdcInternalQA/` toggle, stored in `CACHE_SESSION_CONFIG` at `packages/lwc/shared/modules/cacheManager/cacheManager.ts:311` and applied via `Sforce-Call-Options` header during connector enrichment (`packages/lwc/main/core/connector/connectorClass.ts:208-209`), is **not** re-applied on demand inside this app, so internal objects don't appear. The SOQL Explorer (`packages/lwc/applications/soql/app/app.ts:163`) calls `DESCRIBE.describeSObjects()` directly via the Tooling API, which surfaces internal objects through a different path — that's why it works there.

Note: the Phase 1 explorer's auto-summary swapped which app calls `ensureSessionClientCallOption`. Confirm direction by reading both files before implementing — but the gap and the helper to invoke are both real.

### Fix
Before `describeGlobal()` in the SObject Explorer, call the existing helper that ensures the `Sforce-Call-Options` header carries the cached `client_id`. The helper exists in the codebase already (the SOQL or Object app, whichever has it, calls it via `ensureSessionClientCallOption(connector)` — confirm during implementation).

- Single-line change in `packages/lwc/applications/object/app/app.ts` immediately before line 196.
- No connector change. No new header logic.

### Verification
1. Connect to an internal org.
2. Enable SfdcInternalQA in Settings → Session.
3. Open SObject Explorer; verify `ManagedContentSpaceChannel` (and other internal sobjects) appear in the list.
4. Disable SfdcInternalQA, refresh; the internal sobjects disappear.

---

## Item H — AI agent guardrail for customer (paying) orgs

### Problem
LLM Gateway policy forbids running the AI agent against paying-customer orgs. Today the agent is gated only on `isAgentDisplayed = !isEmpty(application.openaiKey)` at `packages/lwc/extension/panels/default/default.ts:142` — no org-type check. Kyle Kim suggested using `Organization.TrialExpirationDate` (paying customers' orgs are `Active` and typically have a null `TrialExpirationDate`); this is a heuristic, not a definitive guard, but it matches the policy's intent and is consistent with what the gateway team uses.

### Fix
Piggyback the `Organization` query that already runs at `packages/lwc/extension/views/overlay/overlay.ts:692-695`:

```ts
SELECT Id, Name, IsSandbox, OrganizationType, TrialExpirationDate FROM Organization LIMIT 1
```

Plumbing:

1. **Add `isAgentBlockedForCustomerOrg` to the application Redux slice.** Default `false`. Dispatched from a single point: when a connector becomes active, fire the org query (or extend the existing overlay one to add the field), apply the rule (`isPayingOrg = OrganizationType === 'Production' && TrialExpirationDate == null`), and dispatch the flag.
2. **Honor it in three places:**
   - `packages/lwc/extension/panels/default/default.ts:142` — extend `isAgentDisplayed` so the agent button hides on customer orgs.
   - `packages/lwc/main/agent/app/app.ts:225` (`connectedCallback`) — early-return with a friendly inline message ("Disabled on customer orgs per LLM Gateway policy") if the flag is true, so direct deep-links can't bypass the menu.
   - Chat extension (`packages/extension-chat/`) — same gate at the chat panel mount.
3. **Wording:** the inline disabled-message must include a link/reference to the LLM Gateway FAQ Guillaume cited in the Slack thread, so the user understands the *why*.

### Heuristic limitations to flag in code comments
- Sandbox orgs of paying customers (`IsSandbox: true`) are *not* blocked — we want the agent to remain usable in test environments.
- The Org query failing should NOT block the agent (network failure ≠ customer org). On query error, log + proceed with `isAgentBlockedForCustomerOrg = false` and a debug-level log.
- Overrides: read an environment / settings escape hatch (e.g. `CACHE_CONFIG.AGENT_OVERRIDE_CUSTOMER_BLOCK`) so the team can demo the agent on customer orgs in approved settings.

### Tests
- `packages/lwc/main/agent/__tests__/customerOrgGuard.test.ts` (new): unit-test the rule function with a matrix of `OrganizationType × TrialExpirationDate × IsSandbox` values.
- Update overlay test if it exists to assert the new field is requested.

### Verification
1. Connect to an internal/sandbox org → agent visible.
2. Connect to a `Production` org with no `TrialExpirationDate` → agent hidden + inline message.
3. Toggle the override → agent appears again.
4. Disconnect, reconnect to a different org → flag re-evaluated.

---

## Item B — "Open in VS Code" should auto-download metadata + open in the editor

### Problem
`packages/lwc/applications/metadata/app/app.ts:265-269` `openVSCode()` currently calls `window.open(url)`. The user expectation is: clicking the button on a metadata record (e.g. ApexClass) downloads the body and opens it in the bundled VS Code editor (Monaco-based, already shipped in the desktop + extension), in the **same workbench session**.

### Fix
Replace the `window.open` call with a two-step flow:

1. **Reuse the existing retrieve path.** The `sf metadata retrieve` agent shell handler at `packages/lwc/main/agent/tools/modules/shell.ts` (`retrieveMetadata`) already implements `query → fetch Body → write to /workspace/<name>.<ext>` for `ApexClass / ApexTrigger / ApexPage / ApexComponent / StaticResource`. Extract the file-fetch portion into a shared helper (e.g. `packages/lwc/shared/modules/metadataApi/retrieveBody.ts`) so the metadata app can call it directly without going through the shell.
2. **Hand off to the VS Code editor.** Use `host-api/commands` to invoke a registered command (e.g. `vscode.openFile`). If that command doesn't exist yet, register it in the VS Code panel package (`packages/vscode/`) so the metadata app's button can dispatch `invokeCommand('vscode.openFile', { path })` and have the editor take focus on the new file. The host-api commands registry is already used the same way for `anonymousApex.executeApex` and `soql.executeQueryIncognito` — same pattern, new command name.

### Why this is M-effort, not S
- The retrieve helper extraction is straightforward but touches both packages.
- Cross-package command registration must be tested in three runtime targets (Chrome extension, Electron desktop, web app).
- File extension mapping (`ApexClass → .cls`, etc.) is already encoded in `retrieveMetadata`; reuse the existing map.
- Per the project's conventions: do NOT add a third namespace; keep the helper in `shared/metadataApi/` and re-export from `host-api/` only if a stable import prefix is wanted.

### What this does NOT do
- Does NOT add new metadata types beyond the 5 the agent shell already handles. If the user clicks "Open in VS Code" on, say, a `Flow`, fall through to the legacy `window.open` behavior with a console warning.
- Does NOT auto-open on every navigation — only when the user explicitly clicks the button.
- Does NOT modify the VS Code panel's editor itself; only registers a `vscode.openFile` command + opens an existing file path.

### Verification
1. Open Metadata Explorer; navigate to an ApexClass record.
2. Click "Open in VS Code".
3. The body is fetched, written to `/workspace/<ClassName>.cls`, the VS Code editor takes focus, and the file is open.
4. Repeat for ApexTrigger / ApexPage / ApexComponent / StaticResource. Each lands with the correct extension.
5. For an unsupported metadata type (e.g. Flow), the old `window.open(url)` behavior runs.

---

## Critical files

- `packages/lwc/main/component/slds/launcher/launcher.ts:5-68` — Item A: add `org` mapping
- `packages/lwc/applications/object/app/app.ts:196` — Item I: insert `ensureSessionClientCallOption`
- `packages/lwc/extension/views/overlay/overlay.ts:692-695` — Item H: extend org query
- `packages/lwc/extension/panels/default/default.ts:142` — Item H: gate `isAgentDisplayed`
- `packages/lwc/main/agent/app/app.ts:225` — Item H: secondary gate at agent mount
- `packages/extension-chat/` — Item H: same gate at chat panel mount
- `packages/lwc/applications/metadata/app/app.ts:265-269` — Item B: replace `openVSCode`
- `packages/lwc/main/agent/tools/modules/shell.ts` — Item B: extract `retrieveMetadata`'s file-fetch
- `packages/lwc/shared/modules/metadataApi/` — Item B: home for the new shared retrieve helper
- `packages/vscode/` — Item B: register `vscode.openFile` command via `host-api/commands`

## What this plan does NOT do

- Does not address Item D (drag-and-drop / click reliability) — explicitly excluded by the user.
- Does not chase Item G (chat give-up). Needs a separate session to instrument the agent loop and reproduce.
- Does not back-port the launcher change to historical pre-2.0 builds — only the current `feature/agentforce-explorer` branch.

## Verification (full plan)

For each item, the per-item verification block above is the smoke test. Add to `npm run validate`:

```sh
npm run lint
npm run test -- --test-name-pattern='customerOrgGuard|launcher|sobject|metadata'
```

End-to-end:
1. Build the dev extension; load it.
2. Connect to a sandbox org — confirm A (launcher), I (internal sobjects with SfdcInternalQA on), B (metadata download).
3. Connect to a Production-no-trial org — confirm H (agent hidden) + override (agent re-appears).

---

## Tracking — issues filed (2026-05-18)

| Item | GitHub issue | Status when filed |
|---|---|---|
| A | [#12](https://github.com/grebmann1/workbench/issues/12) — Org Overview unreachable when Header Application Tabs is disabled | Ready to execute |
| I | [#13](https://github.com/grebmann1/workbench/issues/13) — SObject Explorer should list internal SfdcInternalQA objects | **Body inaccurate — see Audit notes** |
| H | [#14](https://github.com/grebmann1/workbench/issues/14) — Add an admin guardrail to gate AI agent visibility per org | Ready to execute (verify cited line in `agent/app/app.ts` before starting) |
| B | [#15](https://github.com/grebmann1/workbench/issues/15) — "Open in VS Code" should auto-download metadata | **Body misdirects edit site — see Audit notes** |

Slack thread replies posted in `#sf-workbench` (channel `C0727S369EY`) on 2026-05-18 linking each filed issue back to the original reporter.

`#10` (community report: "Please upload a valid zip file") closed as `not planned` on 2026-05-18 — works as designed; left a triage comment listing the common user-side mistakes (re-zipping, archive root, Windows path, stale extension cache).

---

## Audit notes — corrections to filed issues (deferred)

After filing, a deeper code re-check uncovered two issue bodies that would mislead whoever picks them up. Captured here so the corrections aren't lost. **No edits applied yet** — left for future cleanup.

### Issue #13 — fix description is wrong

**What the issue currently claims:** `ensureSessionClientCallOption(connector)` is missing before `describeGlobal()`; calling it should be a one-line fix.

**What's actually in the code:**
- `ensureSessionClientCallOption(this.connector)` is **already called** at `packages/lwc/applications/object/app/app.ts:196` and twice in `object/sobject/sobject.ts:197,213`.
- Both SOQL Explorer and SObject Explorer go through the same Redux thunk `describeSObjects` at `packages/lwc/main/core/store/modules/describe.ts:50-91`, which uses the same per-alias cache key `CACHE_ORG_DATA_TYPES.DESCRIBE_GLOBAL`.

**Real candidate causes (need investigation, not yet root-caused):**
1. The helper at `packages/lwc/applications/object/sessionCallOptions.ts:18` early-returns when `_callOptions.client` is already populated. If the connector was enriched with a non-empty `client` value before SfdcInternalQA was toggled on, the helper bails and the cached `client_id` from `CACHE_SESSION_CONFIG` is never re-applied.
2. Cache poisoning. A user opens SObject Explorer first (without SfdcInternalQA) → describe result cached without internal objects → enabling SfdcInternalQA later doesn't bust the cache. The "SOQL works but SObject doesn't" asymmetry the user reported is most likely a stale-cache artifact: SOQL was opened *after* enabling, SObject before.

**Suggested fix shape (to replace the issue body):**
- Either make `ensureSessionClientCallOption` unconditionally merge the cached `client_id` (overwriting any existing `client`).
- OR include `client_id` in the `DESCRIBE_GLOBAL` cache key so the toggle invalidates it.
- OR explicitly bust `CACHE_ORG_DATA_TYPES.DESCRIBE_GLOBAL` for the alias when the SfdcInternalQA setting changes in Settings → Session.

### Issue #15 — fix points at the wrong file

**What the issue currently claims:** Replace `window.open(url)` in the metadata app with a retrieve-then-open-in-editor flow; extract a `retrieveBody` helper and register a `vscode.openFile` host-api command dispatched from the metadata app.

**What's actually in the code:**
- `openVSCode()` at `packages/lwc/applications/metadata/app/app.ts:265-269` is **not** raw `window.open(url)`; it calls `_buildVscodeEditorUrlWithSelection()` (line 271) which builds a URL containing `metadataType + memberName + alias + sessionId + serverUrl`.
- That URL opens the VS Code panel page. The page on the receiving side (under `packages/vscode/`) reads those query params; today it does not trigger a metadata retrieve + editor open when they're present.

**Real edit site:** `packages/vscode/`'s URL handler. When the panel boots and sees `metadataType` + `memberName` query params, it should retrieve the body and open the file in the editor.

**Suggested fix shape (to replace the issue body):**
- Reuse the agent shell's `retrieveMetadata` body-fetch (at `packages/lwc/main/agent/tools/modules/shell.ts`) by extracting the file-fetch portion into `packages/lwc/shared/modules/metadataApi/retrieveBody.ts`.
- In the VS Code panel boot path, when `metadataType` + `memberName` are present in the URL, call the shared retrieve helper, write to `/workspace/<name>.<ext>`, and open the file in the editor with focus.
- Metadata app needs no change beyond what it already does (it's already passing the right info).

### When to apply these corrections

User asked to defer. Apply when picking up the actual implementation, OR earlier if a contributor outside the team starts on either issue and would benefit from accurate framing.
