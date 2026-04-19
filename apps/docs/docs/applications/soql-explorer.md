---
title: SOQL Explorer
---

# SOQL Explorer

**Menu path:** Data → SOQL Explorer  
**URL parameter:** `applicationName=soql`

The SOQL Explorer lets you write, run, and save SOQL queries against your connected org. It includes a field-level autocomplete, relationship traversal, and CSV export.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **SOQL Explorer** in the left menu (under **Data**).
3. Select an SObject from the object picker or type directly in the query editor.
4. Click **Run** (or press `Ctrl/Cmd + Enter`) to execute the query.
5. Results appear in the table below the editor.

---

## Features

### Query editor

- Full SOQL syntax support with keyword highlighting
- `Ctrl/Cmd + Enter` to run the query without clicking the button

### Field autocomplete

As you type a field name after `SELECT` or `WHERE`, Workbench suggests fields from the selected object, including:

- Standard and custom fields
- Relationship fields (e.g. `Account.Name` from a `Contact` query)
- Picklist values in `WHERE` clauses

### Saved queries

Click **Save** to store a query in your local workspace. Saved queries are listed in the side panel and can be re-opened at any time. The AI agent can also read and run your saved queries.

### Results table

- Sortable columns
- Pagination for large result sets
- Inline record navigation — click a record ID to open it in the [Record Viewer](./record-viewer)

### CSV export

Click **Export** to download the current result set as a CSV file. The export respects the current column order and any applied sorting.

---

## Tips

- Use the **SObject Explorer** first if you are unsure of field names — it lists all fields for an object with their API names.
- Queries that return more than 2,000 records are paginated automatically using `queryMore`.
- The AI agent can write SOQL for you: open the agent panel and describe what you need in natural language.

---

## Related tools

- [SObject Explorer](./sobject-explorer) — find field API names
- [Record Viewer](./record-viewer) — open a single record from query results
- [Data Import](./data-import) — push data back into the org after analysis
- [AI Agent](../ai-agent/setup) — generate and run SOQL using natural language
