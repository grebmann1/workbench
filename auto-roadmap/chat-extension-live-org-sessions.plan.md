# Workbench Chat — agent-driven org-session discovery

## Context

The chat extension (`packages/extension-chat/`) ships its own MV3 build with a side panel that hosts `<agent-app>`. Today it does **not** let the user reach the orgs they're already signed into. Two gaps:

1. The chat extension's background worker (`background-chat.js:123-146`) handles `fetchCookie`, `findExistingSession`, OAuth, MCP — but **does not** expose `listOrgSessionsFromTabs()`. That function (already implemented in the main extension's shared util at `packages/extension/src/workers/utils/salesforce.js:239`) sweeps every open tab, extracts the `sid` cookie from each Salesforce-domain tab, validates the session against `/services/data/.../limits`, and returns a deduplicated `{ serverUrl, sessionId, label, detail }[]` of live sessions. The chat extension already imports other helpers from that file, so wiring this one is a one-liner in the message handler.
2. The agent has `list_connections` (saved configurations from `chrome.storage`), `connect_org`, `check_user_logged_in`, and `ask_user` — but no way to see the **live cookie-discovered sessions**, which is what the user actually needs in chat (no login UI, just "use what you're already signed in to").

Two design decisions captured up front:

- **Add a new agent tool** `list_org_sessions_from_tabs` rather than overloading `list_connections`. Keeps the two sources distinct in the prompt; doesn't change any existing tool's response shape.
- **Trigger lazily**: only when a Salesforce tool fails with "No active org connector found". No proactive prompting on chat boot.

While reading, I also found a real bug in `connect_org` at `packages/lwc/main/agent/tools/modules/workbenchContextTools.ts:99`:
- It calls `credentialStrategies.SESSION?.createConnector?.({ sessionId, instanceUrl })`. That method does not exist — `SESSION.connect` is the right entrypoint, and it expects `serverUrl`, not `instanceUrl` (`packages/lwc/main/core/connector/credentialStrategies/session.ts:13-23`). So the `{ sessionId, instanceUrl }` branch is silently broken today. Fixing it is required for this feature to work end-to-end.

## TL;DR

- Add `list_org_sessions_from_tabs` agent tool that sends a `runtime.sendMessage` to the chat background worker, which calls `listOrgSessionsFromTabs()` from the shared `salesforce.js` util.
- Wire the message handler in `background-chat.js`.
- Fix `connect_org`'s session branch so the agent can actually create a connector from `{ sessionId, instanceUrl }`.
- Update the agent's tool descriptions / prompt so it knows: when a `bash`/Salesforce tool fails with "No active org connector found", fall back to `list_org_sessions_from_tabs` + `list_connections` → `ask_user` → `connect_org`.
- No new LWC component. No picker UI. The `ask_user` tool with options is the picker.

---

## Files to modify

### 1. `packages/extension-chat/src/workers/background-chat.js`
- Import `listOrgSessionsFromTabs` from `../../../extension/src/workers/utils/salesforce.js` (alongside the existing imports at lines 3-9).
- In `handleRuntimeMessage` (line 123), add:
  ```js
  if (message.action === 'listOrgSessions') {
      return listOrgSessionsFromTabs();
  }
  ```
- Manifest already has `cookies` + `tabs` + `storage` permissions (`manifest.template.json:39-50`), so no manifest change.

### 2. `packages/lwc/main/agent/tools/modules/workbenchContextTools.ts`
Two changes:

**a. Fix `connect_org`'s session branch** (around line 98-103):
```ts
} else if (sessionId && instanceUrl) {
    connector = await credentialStrategies[OAUTH_TYPES.SESSION].connect({
        sessionId,
        serverUrl: instanceUrl,  // SESSION.connect expects serverUrl, not instanceUrl
        alias,                    // pass through so the connector picks up the requested alias
    });
}
```
This makes `connect_org({ alias: 'live-...', sessionId, instanceUrl })` actually create a working connector.

**b. Add `listOrgSessionsFromTabsTool`**:
```ts
export const listOrgSessionsFromTabsTool = {
    name: 'list_org_sessions_from_tabs',
    description: CONNECTION_TOOL_DESCRIPTIONS.listOrgSessionsFromTabs,
    parameters: z.object({}),
    execute: async () => {
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
                return { sessions: [], error: 'chrome runtime unavailable' };
            }
            const res = await chrome.runtime.sendMessage({ action: 'listOrgSessions' });
            // Background returns either an array or `{ error }`.
            if (Array.isArray(res)) {
                return { sessions: res };
            }
            return { sessions: [], error: res?.error || 'No live tab sessions found' };
        } catch (err) {
            LOGGER.error('[list_org_sessions_from_tabs] Error:', err);
            return { sessions: [], error: err instanceof Error ? err.message : String(err) };
        }
    },
};
```

Add to the exported `workbenchContextTools` array at line 144.

### 3. `packages/lwc/main/agent/tools/constants.ts`
Add `CONNECTION_TOOL_DESCRIPTIONS.listOrgSessionsFromTabs` with copy that tells the agent:
- "Discovers Salesforce org sessions from currently-open browser tabs by reading the active `sid` cookie. Use this when the user wants to act on an org they're already signed into in another tab, especially when `list_connections` is empty or when `check_user_logged_in` returns false. Each entry has `serverUrl`, `sessionId`, `label` (host), and `detail` (tab count + first title). Pass `sessionId` + `instanceUrl: serverUrl` to `connect_org`."
- Mention the stale-token contract: "If `connect_org` returns `success: false`, the cookie is dead — drop that entry and ask the user to choose another."

### 4. `packages/lwc/main/agent/agents/instructions/browserAgentInstructions.ts` (or wherever the chat agent's system prompt lives)
Add a short instruction:
> If a Salesforce tool fails with "No active org connector found", recover by:
> 1. Call `list_connections` (saved orgs) and `list_org_sessions_from_tabs` (live cookie-discovered sessions in the user's browser tabs).
> 2. Use `ask_user` with the union of both sources as the options. Show alias for saved entries and `label (detail)` for live sessions.
> 3. On the user's choice, call `connect_org` with `{ alias }` for saved entries or `{ alias: 'live-<host>', sessionId, instanceUrl: serverUrl }` for live sessions.
> 4. Retry the original tool. If `connect_org` failed, the token is stale — ask the user again with that entry removed.

### 5. Tests
- `packages/lwc/main/agent/tools/modules/__tests__/workbenchContextTools.test.ts` (create or extend if it exists):
  - `connect_org` with `{ sessionId, instanceUrl }` calls `SESSION.connect` with `{ sessionId, serverUrl: instanceUrl, alias }` (regression for the bug fix).
  - `list_org_sessions_from_tabs` returns `{ sessions: [...] }` when chrome.runtime returns an array.
  - `list_org_sessions_from_tabs` returns `{ sessions: [], error }` when chrome.runtime returns `{ error }`.
  - `list_org_sessions_from_tabs` handles `chrome` being undefined (web target).

## What this plan does NOT do

- Does NOT add a picker LWC component. `ask_user` is the picker.
- Does NOT touch `panels/chat/chat.{ts,html}`. The active-tab auto-connect in `Root.loadSessionFromCurrentTab` keeps working as-is.
- Does NOT change the saved-connection storage model. `list_connections` still surfaces only what the user has explicitly saved; `list_org_sessions_from_tabs` is a separate, transient view.
- Does NOT proactively prompt on chat boot. The agent only intervenes when a tool errors out for missing connector.

## Verification

After implementing:

```sh
npm run lint
node --experimental-strip-types --import=./tools/testing/register.mjs --test \
  packages/lwc/main/agent/tools/modules/__tests__/workbenchContextTools.test.ts
```

End-to-end smoke test (manual):
1. `npm run start:dev:extension` (chat target — confirm script name) and load Workbench Chat.
2. Open a tab to `*.lightning.force.com` and sign in. Open another to a different org.
3. Open the side panel from a non-Salesforce tab (so `Root.loadSessionFromCurrentTab` finds nothing).
4. Ask the agent "list my orgs and run a SOQL query". Expect: agent calls `list_connections` (likely empty) + `list_org_sessions_from_tabs` (finds 2), then `ask_user` with both. Pick one. Agent calls `connect_org`, then runs the query.
5. Repeat with one tab logged out. Expect: that tab's entry is filtered out by `validateSession` inside `listOrgSessionsFromTabs`.

## Critical files

- `packages/extension-chat/src/workers/background-chat.js` — wire the message handler
- `packages/extension/src/workers/utils/salesforce.js:239` — `listOrgSessionsFromTabs` (already implemented, no change)
- `packages/lwc/main/agent/tools/modules/workbenchContextTools.ts` — fix `connect_org`, add new tool
- `packages/lwc/main/agent/tools/constants.ts` — add tool description
- `packages/lwc/main/core/connector/credentialStrategies/session.ts` — reference (no change), but its signature `{ sessionId, serverUrl }` is what the fix conforms to
- `packages/lwc/main/agent/agents/instructions/browserAgentInstructions.ts` — add the recovery loop instruction
