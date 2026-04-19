---
title: Data Import
---

# Data Import

**Menu path:** Data → Data Import  
**URL parameter:** `applicationName=dataimport`

The Data Import tool loads records into Salesforce from a CSV file. It supports insert, update, and upsert operations via the standard REST API or the Bulk API for large volumes.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **Data Import** in the left menu (under **Data**).
3. Select the **SObject** you want to load records into (e.g. `Contact`, `My_Object__c`).
4. Choose the **operation**: Insert, Update, or Upsert.
5. Upload your CSV file by clicking **Choose File** or dragging it onto the upload area.
6. Map CSV column headers to Salesforce field API names using the field mapper.
7. Click **Import** to start the load.

---

## Operations

| Operation | Description |
| --- | --- |
| **Insert** | Creates new records. Fails if a matching record already exists. |
| **Update** | Updates existing records by ID. The CSV must include a `Id` column. |
| **Upsert** | Inserts new records or updates existing ones based on an external ID field. |

For upsert, select the **external ID field** from the dropdown — this is the field used to match existing records.

---

## API modes

| Mode | Best for |
| --- | --- |
| **REST API** | Smaller batches (up to a few thousand records), immediate feedback |
| **Bulk API** | Large volumes (tens of thousands of records), processed asynchronously |

In Bulk API mode, Workbench monitors job progress and shows status updates as batches complete.

---

## Field mapping

After uploading the CSV, Workbench shows a mapping table:

- **CSV column** — the header from your file
- **Salesforce field** — select the target API name from a dropdown (pre-populated with fields for the selected object)
- Columns you do not want to import can be toggled off

---

## Import results

After the import completes, a results summary shows:

- Total records processed
- Successful records
- Failed records with row numbers and error messages

You can download the error report as a CSV to identify and fix problem rows before re-importing.

---

## Tips

- Date fields must be in ISO 8601 format (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ`).
- Use [SOQL Explorer](./soql-explorer) to export existing records as CSV, then modify and re-import to bulk-update data.
- The maximum file size for REST API mode is determined by your browser memory; use Bulk API for files over 10 MB.

---

## Related tools

- [SOQL Explorer](./soql-explorer) — export data as CSV for reference or modification
- [Record Viewer](./record-viewer) — verify individual records after import
