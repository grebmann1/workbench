# Application Gap Analysis

Research artifact — no code yet. Captures what's missing from Workbench relative to the original Salesforce Workbench and similar tools (Salesforce Inspector Reloaded), plus the next priority.

## Current apps (18)

`accessAnalyzer`, `anonymousApex`, `api`, `code`, `dataImport`, `files`, `graphql`, `jobs`, `metadata`, `object`, `org`, `package`, `platformevent`, `recordviewer`, `smartinput`, `soql`, `textCompare`, `urlencoder`

## High-value gaps

| Category | Gap                                           | Suggested id  | Effort |
| -------- | --------------------------------------------- | ------------- | ------ |
| Dev      | Debug Log viewer (trace flags, tail, filter)  | `debuglogs`   | M      |
| Testing  | Apex Test Runner (classes/methods + coverage) | `apexTests`   | M      |
| Ops      | Org Limits live monitor (`/limits`)           | `limits`      | S      |
| Ops      | Setup Audit Trail viewer                      | `auditTrail`  | S      |
| Dev      | SOQL Query Plan (explain)                     | extend `soql` | S      |

## Medium-value gaps

| Category   | Gap                                               | Suggested id   | Effort |
| ---------- | ------------------------------------------------- | -------------- | ------ |
| Session    | Login-As / user session inspector                 | `sessions`     | M      |
| Automation | Flow / Process inspector (list, versions, status) | `flows`        | M      |
| Config     | Custom Metadata + Custom Settings editor          | `customConfig` | S      |
| Data       | Async SOQL for Big Objects                        | extend `soql`  | M      |

## Documentation gaps

`apps/docs/docs/applications/` covers 13 apps. Undocumented: `graphql`, `code`, `smartinput`, `files`, `package`, `textCompare`, `urlencoder`. Follow-up pass, out of scope for this file.
