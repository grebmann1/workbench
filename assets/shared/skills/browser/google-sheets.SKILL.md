---
name: google-sheets
description: Use workspace.sheets APIs for structured Sheets read/write operations without UI automation.
---

# Google Sheets (workspace.sheets)

Use this skill when tasks require spreadsheet CRUD and data movement.

## Authentication check first

```javascript
const status = await workspace.sheets.requestAccess();
if (!status.authorized) return "Please connect Google in Settings.";
```

## Common operations

- `createSpreadsheet({ title, sheets })`
- `listSheets({ spreadsheetId })`
- `readRange({ spreadsheetId, range })`
- `writeRange({ spreadsheetId, range, values })`
- `appendRows({ spreadsheetId, range, values })`
- `batchRead`, `batchWrite`, `batchUpdate`, `setFormat`

## Decision rule

- Prefer `workspace.sheets` for data operations.
- Use browser automation only when explicit Sheets UI interaction is required.
