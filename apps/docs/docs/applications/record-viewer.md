---
title: Record Viewer
---

# Record Viewer

**Menu path:** Explorers → Record Viewer  
**URL parameter:** `applicationName=recordviewer`

The Record Viewer displays all fields of a single Salesforce record by ID. It is useful for debugging data issues, verifying field values, and inspecting records without navigating through the Salesforce UI.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **Record Viewer** in the left menu (under **Explorers**).
3. Enter a **record ID** (15 or 18-character) in the ID field.
4. Optionally select the **SObject type** — Workbench can detect it automatically from the ID prefix.
5. Click **View** — all fields and their values load in the panel below.

---

## What it shows

The record is displayed in a two-column table:

| Column | Content |
| --- | --- |
| Field Label | Display label of the field |
| Value | The current value stored on the record |

All fields returned by the `describe` endpoint for the object are shown, including:

- Standard fields (`Id`, `Name`, `CreatedDate`, `OwnerId`, etc.)
- Custom fields (`My_Custom_Field__c`)
- System fields (`LastModifiedDate`, `LastModifiedById`, `SystemModstamp`)

Relationship fields show the ID of the related record. Click a related record ID to open that record in the viewer.

---

## Opening from SOQL Explorer

When viewing SOQL query results in the [SOQL Explorer](./soql-explorer), click any record ID in the results table to open it directly in the Record Viewer — no copy-paste required.

---

## Tips

- Use the Record Viewer to confirm that a Data Import or Apex script updated a record with the expected values.
- The 18-character ID is shown at the top of the panel so you can copy it for use in SOQL queries or Apex.
- Related record IDs are clickable — navigate the record graph without leaving the tool.

---

## Related tools

- [SOQL Explorer](./soql-explorer) — query for record IDs and click through to the viewer
- [SObject Explorer](./sobject-explorer) — understand what fields exist on the object
- [Data Import](./data-import) — push corrected data back after investigating records
