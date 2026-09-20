---
name: google-sheets
description: Create, read, edit and format Google Sheets through workspace.sheets in sandbox JS. Use for Salesforce exports, spreadsheet analysis, tables and charts feeding Google Slides presentations.
---

Enable and connect Google Workspace in AI settings. These methods run through the
host credential boundary. Never request or print access tokens.

`workspace.status()` returns `{cwd, available}` for the local workspace.
`workspace.sheets.requestAccess()` returns `{authorized: boolean}` for the cached
Google token. It does not open Google Picker or grant access to a specific file.
For missing access, reconnect in AI settings or choose an accessible file.

Every operation on an existing spreadsheet requires an explicit `spreadsheetId`.
Get it from a user-provided Sheets URL, a create response, or
`workspace.drive.listFiles({query: "name"})`. There is no `workspace.current()`.

Available methods and inputs:

| Method | Input |
| --- | --- |
| createSpreadsheet | `{title, sheets?: ["Sheet1", "Summary"]}` |
| getSpreadsheet | `{spreadsheetId}` |
| listSheets | `{spreadsheetId}`; returns `{sheets: ["title"]}` |
| readRange | `{spreadsheetId, range}` |
| batchRead | `{spreadsheetId, ranges: ["Sheet1!A1:D20"]}` |
| writeRange | `{spreadsheetId, range, values: [["cell"]], valueInputOption?: "RAW"}` |
| batchWrite | `{spreadsheetId, data: [{range, values}], valueInputOption?: "RAW"}` |
| appendRows | `{spreadsheetId, range, values, valueInputOption?: "RAW"}` |
| clearRange | `{spreadsheetId, range}` |
| batchClear | `{spreadsheetId, ranges}` |
| batchUpdate | `{spreadsheetId, requests: [/* Sheets API requests */]}` |
| setFormat | `{spreadsheetId, requests: [/* Sheets API format requests */]}` |

Values default to USER_ENTERED; use RAW for literal user data to avoid interpreting
formulas. `batchUpdate` supports addChart and formatting requests. Read metadata
first for numeric sheet IDs. Write values, then format bounded ranges, then reread
to verify. Do not blindly repeat appends after an uncertain network failure.

Example using JS through bash:

```js
const sheet = await workspace.sheets.createSpreadsheet({title: "Pipeline", sheets: ["Data"]});
await workspace.sheets.writeRange({
  spreadsheetId: sheet.spreadsheetId,
  range: "Data!A1:B3",
  values: [["Stage", "Amount"], ["Prospecting", 12000], ["Negotiation", 8000]],
  valueInputOption: "RAW"
});
console.log(JSON.stringify(await workspace.sheets.readRange({spreadsheetId: sheet.spreadsheetId, range: "Data!A1:B3"})));
```

For a presentation, read the google-slides skill and insert the created chart with
`createSheetsChart`. Include final spreadsheet and presentation links in the answer.
