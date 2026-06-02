# "Open in VS Code" — fetch metadata into the bundled editor

**Status:** standby (deferred 2026-06-02)
**Tracking issue:** [#15](https://github.com/grebmann1/workbench/issues/15)

## Why this is on standby

The straightforward implementation calls the Tooling API
(`SELECT Body FROM <type> WHERE Name='<n>'`) every time a user clicks "Open in
VS Code". Under Salesforce **Shield** (Event Monitoring + Transaction Security),
that pattern is risky:

- Each click is a programmatic Tooling-API read against an Apex/VF source body.
  Shield's `ApiAnomalyEventStore` / Transaction Security policies can flag
  bursts of these reads as anomalous and lock the session — particularly for
  internal admins doing source review across many components.
- The legacy `window.open(url)` path delegates the actual fetch to the user's
  authenticated VS Code session in the browser. Shield sees a single user
  navigation, not N tool-driven reads, so the noise floor is far lower.
- Workbench is shipped to customers, including Shield-licensed orgs. Triggering
  TSP lockouts on users would be a worse regression than the missing
  convenience.

## Preconditions to lift the standby

Either of:

1. **Per-org dedup cache** keyed on `(orgId, metadataType, apiName, LastModifiedDate)`.
   Body is fetched at most once per modification; subsequent clicks reuse the
   cached file at `/workspace/<name>.<ext>`. Bounds the API-call rate to roughly
   one read per source change, which Shield models as expected developer
   activity.
2. **Shield-aware opt-out**. Detect Shield via org features
   (`Organization.IsSandbox` + Event Monitoring license signal) or expose an
   explicit per-org setting. When enabled, `Open in VS Code` reverts to the
   legacy URL path.

Either path needs a manual smoke against a Shield-enabled scratch org before
shipping.

## Implementation sketch (when revived)

Two-part change, otherwise unchanged from the original triage:

### Part A — shared retrieve helper
- New file: `packages/lwc/shared/modules/metadataApi/retrieveBody.ts`.
- Lift `SELECT Id, Name, Body FROM <type> WHERE Name='<n>' LIMIT 1` out of
  `packages/lwc/main/agent/tools/modules/shell.ts:1069-1112` into
  `retrieveMetadataBody({ connector, metadataType, apiName }) → { body, ext, filename }`.
- Supported types: `ApexClass | ApexTrigger | ApexPage | ApexComponent | StaticResource`.
- Refactor `shell.ts:retrieveMetadata` to call the helper. No behavior change.
- Colocated test: `__test__/retrieveBody.test.ts`.

### Part B — VS Code handoff
- Register `vscode.openFile` in `packages/vscode/` (mirrors
  `packages/lwc/applications/anonymousapex/app/app.ts:42`):
  `vscode.window.showTextDocument(vscode.Uri.file(path))`.
- Replace `openVSCode` in `packages/lwc/applications/metadata/app/app.ts:265-269`:
  - Supported type → `retrieveMetadataBody` → write `/workspace/<filename>` via
    `host-api/fs` → `invokeCommand('vscode.openFile', { path })`.
  - Unsupported type or `!hasCommand('vscode.openFile')` → fall back to
    `window.open(url)`.
  - Error path → toast + fallback to legacy URL.
- Add cache layer described under "Preconditions".

### Constraints
- Limit to the 5 metadata types; never expand without revisiting the Shield
  question for the new type's read profile.
- Do not introduce a third namespace — helper stays in `shared/metadataApi/`.
- Cross-target verification: Chrome extension, Electron desktop, web. The web
  target has no VS Code panel; `hasCommand` returns false → silent fallback.

## Verification (when shipping)

1. ApexClass → click "Open in VS Code" → file appears at
   `/workspace/<Name>.cls`, VS Code panel focuses it.
2. Repeat for ApexTrigger / ApexPage / ApexComponent / StaticResource.
3. Unsupported type (e.g. Flow) → legacy `window.open(url)` with a console
   warning.
4. Error path (no Body, network failure) → toast + fallback to legacy URL.
5. **Shield smoke:** click "Open in VS Code" 20× across 10 distinct components
   in a Shield-enabled scratch org. No Transaction Security lockout, no
   anomalous-read events fired. With cache enabled, second click on an
   unchanged component triggers no Tooling-API read.

## Release note (when shipping)

Developer Tools → Metadata Explorer: "'Open in VS Code' now fetches the source
body and opens it directly in the bundled editor for ApexClass, ApexTrigger,
ApexPage, ApexComponent, and StaticResource. Other types continue to open via
URL."
