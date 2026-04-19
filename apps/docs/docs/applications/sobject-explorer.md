---
title: SObject Explorer
---

# SObject Explorer

**Menu path:** Explorers → SObject Explorer  
**URL parameter:** `applicationName=sobject`

The SObject Explorer provides a detailed schema browser for any Salesforce object — standard or custom. Use it to understand field types, relationships, picklist values, and field-level security without leaving Workbench.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **SObject Explorer** in the left menu (under **Explorers**).
3. Type an object API name in the search box (e.g. `Account`, `Opportunity`, `My_Object__c`).
4. Select the object from the dropdown — the schema loads immediately.

---

## What it shows

### Object summary

- Label and API name
- Whether the object is createable, updateable, queryable, deletable
- Key prefix (the 3-character prefix of record IDs)
- Namespace (if any)

### Fields

A table listing every field on the object:

| Column | Description |
| --- | --- |
| Label | Display label |
| API Name | Programmatic name used in SOQL and Apex |
| Type | Field data type (Text, Lookup, Picklist, etc.) |
| Required | Whether the field is required on create |
| Length | Character or digit limit for applicable types |
| Nillable | Whether `null` is a valid value |

Click a field row to see extended details — reference object for lookups, picklist values for picklist/multi-select fields, and formula expression for formula fields.

### Relationships

A separate tab lists child relationships — which objects have a lookup or master-detail pointing to this object, and the relationship name used for sub-queries in SOQL (e.g. `SELECT Id, (SELECT Id FROM Contacts) FROM Account`).

---

## Tips

- Use SObject Explorer alongside [SOQL Explorer](./soql-explorer) to find the exact API names before writing a query.
- Picklist values shown here reflect the org's current values including any custom picklist entries.
- The AI agent uses SObject Explorer's underlying `describe` calls — you can ask it to "describe the Account object" and it returns the same data.

---

## Related tools

- [SOQL Explorer](./soql-explorer) — write queries using the field names you find here
- [Record Viewer](./record-viewer) — view an actual record instance
- [Access Analyzer](./access-analyzer) — check field-level security by profile or permission set
