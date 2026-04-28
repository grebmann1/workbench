---
name: sidepanel-always-on
overview: "Reintroduce the side panel behavior setting as a real two-mode control: default preserves the current tab-scoped behavior, while Always On follows tab switches within the window after the user opens the panel, until the user closes it."
todos:
  - id: rename-sidepanel-setting
    content: Rename side panel mode setting values and labels to Default / Always On with legacy value normalization
    status: pending
  - id: background-always-on-state
    content: Add window-scoped Always On state in background.js started only by explicit openSideBar
    status: pending
  - id: mode-aware-tab-opening
    content: Make handleTabOpening preserve default behavior and enable tabs in Always On windows
    status: pending
  - id: close-detection
    content: Use side-panel port disconnect to stop Always On for that window after user close
    status: pending
  - id: routing-verification
    content: Preserve tab-safe side-panel message routing and verify multi-view behavior
    status: pending
isProject: false
---

# Plan: Side Panel Default vs Always On

## Goal

Restore the settings control as an actual runtime behavior without regressing the current default behavior.

- Default mode remains the default value and keeps the current tab-scoped behavior.
- Always On replaces the old Agent mode label and follows tab switches within the current browser window after the user explicitly opens the side panel.
- Always On stops following when the user closes the side panel.
- Existing multi-view routing should remain tab-safe: side-panel messages should still target the correct panel view.

## Current Context

The current background behavior is driven by `packages/extension/src/workers/background.js`:

- `openedSidePanelTabIds` tracks tabs where the panel was explicitly opened.
- `handleTabOpening(tab)` enables the side panel only if that tab is in `openedSidePanelTabIds`.
- `openSideBar(tab)` marks one tab as opened and opens the panel there.
- `sidePanelTabIdByPort` maps connected side-panel views back to their source tab.

The settings UI still exposes `sidepanel_mode`, but runtime code no longer reads it:

- `packages/lwc/main/pages/settings/app/app.html` shows the Side Panel Behavior card.
- `packages/lwc/main/pages/settings/app/app.js` still labels options as App mode / Agent mode.
- `packages/lwc/shared/modules/cacheManager/cacheManager.ts` defines `SIDEPANEL_MODE` as `'agent' | 'app'`, defaulting to `'app'`.

## Requirements

- R1. Preserve current default behavior exactly: panel opens only for the explicitly opened tab and does not follow other tabs.
- R2. Rename settings options to user-facing `Default` and `Always On`.
- R3. Keep default mode as the default persisted value.
- R4. Always On should apply only to the current browser window after the user opens the side panel in that window.
- R5. In Always On, the panel should follow tab activation/update in that window until the user closes it.
- R6. Closing the panel should stop Always On for that window until the user opens it again.
- R7. Existing tab-scoped panel message routing must not regress.

## Key Decisions

- Keep the existing storage key `sidepanel_mode` to avoid breaking saved settings and generic settings persistence.
- Change canonical values to `default` and `always_on`.
- Treat old values as compatibility aliases:
  - `app` maps to `default`.
  - `agent` maps to `always_on`.
- Model Always On as window-scoped runtime state, not global extension state. This matches the selected scope: current window only.
- Do not use `chrome.sidePanel.open()` during tab activation. Opening remains user-gesture driven via action/context/shortcut/message. Always On should work by keeping/enabling side-panel options for tabs in an already-open window.

## Implementation Units

### U1. Rename and Normalize the Setting

Files:

- `packages/lwc/shared/modules/cacheManager/cacheManager.ts`
- `packages/lwc/main/pages/settings/app/app.js`
- `packages/lwc/main/pages/settings/app/app.html`

Approach:

- Update `CACHE_CONFIG.SIDEPANEL_MODE` type/default from `'agent' | 'app'` to `'default' | 'always_on'`, with default value `default`.
- Update settings option labels:
  - `Default — open only for the current tab`
  - `Always On — keep open while switching tabs in this window`
- Update the Side Panel Behavior description so it no longer mentions Agent mode or opening Workbench in a tab as the primary behavior.
- Add a small normalization helper near setting consumers or cache helper usage so legacy stored values still behave predictably.

Test scenarios:

- Existing users with no setting get `default`.
- Existing stored `app` resolves as `default`.
- Existing stored `agent` resolves as `always_on`.
- Saving the settings page persists `default` or `always_on`, not old labels.

### U2. Add Background Runtime State for Always On Windows

Files:

- `packages/extension/src/workers/background.js`

Approach:

- Add a window-scoped state set, for example `alwaysOnWindowIds`, to track windows where Always On is active after explicit user open.
- Add a dismissed/closed state for windows, for example `dismissedAlwaysOnWindowIds`, to prevent re-enabling after the user closes the panel.
- Add a helper to load and normalize the side panel mode from `CACHE_CONFIG.SIDEPANEL_MODE.key`.
- Update `openSideBar(tab)`:
  - Always keep current default behavior: add the explicit `tab.id` to `openedSidePanelTabIds`.
  - If mode is `always_on`, also mark `tab.windowId` as Always On and clear dismissed state for that window.
- Keep `openSideBar` as the only place that starts Always On. Tab activation alone should not start it.

Test scenarios:

- In default mode, opening side panel in tab A does not enable tab B.
- In Always On mode, opening side panel in tab A marks only A's window as Always On.
- Opening the side panel in one window does not affect another window.

### U3. Make `handleTabOpening` Mode-Aware

Files:

- `packages/extension/src/workers/background.js`

Approach:

- Keep current default behavior unchanged:
  - `enabled = openedSidePanelTabIds.has(tab.id)`.
- For Always On:
  - If `tab.windowId` is in `alwaysOnWindowIds` and not dismissed, set `enabled = true` for the activated/updated tab.
  - Otherwise fall back to the default tab-scoped check.
- Continue using the existing debounce map, but include the resolved enabled state so mode transitions are not skipped.
- Avoid calling `chrome.sidePanel.open()` from activation/update handlers.

Test scenarios:

- Default mode follows today’s behavior exactly.
- Always On enables newly activated tabs in the same window after the panel has been opened once.
- Always On does not enable tabs in another window.
- Switching back to default stops enabling new tabs beyond explicitly opened ones.

### U4. Detect User Close Without Breaking Default Mode

Files:

- `packages/extension/src/workers/background.js`
- `packages/lwc/extension/views/default/default.ts`

Approach:

- Reuse the existing side-panel port connection lifecycle.
- Ensure each side-panel port is mapped to both `tabId` and `windowId`:
  - `default.ts` already sends `registerSidePanelTab` with `sourceTabId`.
  - Background can resolve `windowId` from that tab and store it in a `sidePanelWindowIdByPort` map.
- On side-panel port disconnect:
  - Remove the port mappings.
  - If the mapped window is currently Always On, treat disconnect as a user close and clear Always On for that window.
  - Keep default mode semantics unchanged.
- Clean up state when tabs are removed; optionally remove window state when no tabs remain in that window.

Important implementation note:

- Chrome side panel does not provide a rich “close reason” event. The plan should treat port disconnect as the close signal only for windows currently in Always On mode. This minimizes impact on the default behavior.

Test scenarios:

- In Always On, closing the side panel stops it from following subsequent tab switches in that window.
- Reopening the side panel in Always On restarts following for that window.
- In default mode, port disconnect cleanup does not change tab-scoped behavior beyond removing stale port mappings.

### U5. Keep Message Routing Tab-Safe

Files:

- `packages/extension/src/workers/background.js`
- `packages/lwc/extension/extension/root/root.ts`
- `packages/lwc/extension/extension/root/root.html`
- `packages/lwc/extension/views/default/default.ts`

Approach:

- Preserve the current `sourceTabId` registration model.
- Preserve `broadcastMessageToSidePanel` targeting by `targetTabId` / sender tab before falling back to global broadcast.
- When Always On enables a new tab in the same window, do not mutate an unrelated hidden panel view to a different source tab.
- If implementation discovers that the same side-panel document is reused across tab switches in Always On, keep the `sourceTabId` semantics aligned with the active tab only through an explicit background message, not implicit “active tab everywhere” behavior.

Test scenarios:

- Smart Input quick pick still opens in the side panel associated with the Salesforce tab that triggered it.
- Refresh messages with a target tab only reach that tab’s side-panel view.
- Multiple `views/default.html` inspectable views do not randomly update each other.

## Verification Plan

Manual extension scenarios are important here because Chrome side-panel lifecycle behavior is difficult to prove with the existing unit test setup.

- Default mode:
  - Open side panel in tab A.
  - Switch to tab B in the same window.
  - Verify the panel is not shown for tab B unless explicitly opened there.
- Always On mode:
  - Select Always On in settings and save.
  - Open side panel in tab A.
  - Switch to tab B in the same window.
  - Verify the panel remains visible/follows tab B.
  - Close the side panel.
  - Switch tabs again and verify it stays closed.
  - Reopen it and verify following resumes.
- Multi-window:
  - Open Always On in window 1.
  - Switch tabs in window 2 and verify window 2 is unaffected until the panel is opened there.
- Message routing:
  - Trigger Smart Input / refresh flows with multiple side-panel views inspectable.
  - Verify only the intended panel view reacts.

## Risks

- Chrome’s side-panel close signal is inferred from port disconnect, not an explicit close event. Limiting that inference to Always On windows reduces blast radius.
- If Chrome reuses or reloads side-panel documents differently across versions, the implementation may need a small runtime adjustment around `registerSidePanelTab` and window mapping.
- Changing stored values from `app`/`agent` to `default`/`always_on` needs compatibility normalization so existing users do not get unexpected behavior.

## Out of Scope

- Reintroducing the old `sidepanel_request_close` behavior for default mode.
- Making Always On global across all windows.
- Changing Chrome debugger optional permission work.
- Reworking unrelated settings layout or cache infrastructure.
