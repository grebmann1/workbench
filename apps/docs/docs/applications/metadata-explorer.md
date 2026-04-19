---
title: Metadata Explorer
---

# Metadata Explorer

**Menu path:** Explorers → Metadata Explorer  
**URL parameter:** `applicationName=metadata`

The Metadata Explorer lets you browse, inspect, and modify metadata components in your connected org using the Salesforce Metadata API.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **Metadata Explorer** in the left menu (under **Explorers**).
3. Select a metadata type from the type picker (e.g. `ApexClass`, `CustomObject`, `Flow`).
4. Workbench lists all components of that type in your org.
5. Click a component to view its detail or retrieve its source.

---

## Features

### Metadata type browser

All standard and custom Salesforce metadata types are listed and searchable. You can filter by type name to quickly find the category you need.

### Component listing

For each metadata type, the explorer shows:

- Component API name
- Namespace (if any)
- Last modified date and user

### Component detail

Click a component to open its detail panel:

- XML source preview (read-only) for most types
- Retrieve the component as a ZIP for local editing
- Open the component directly in the embedded [VS Code editor](../vscode/overview)

### Inline edit (selected types)

For certain metadata types (e.g. custom fields, validation rules), you can make small changes directly in the explorer without retrieving and re-deploying a package. Changes are applied via the Metadata API.

---

## Deploying changes

To deploy modifications made outside the explorer, use the [Deploy & Retrieve](./deploy-retrieve) tool. The Metadata Explorer is primarily for inspection and lightweight edits; larger change sets are better managed through Deploy & Retrieve.

---

## Related tools

- [Deploy & Retrieve](./deploy-retrieve) — package and deploy metadata changes
- [VS Code Integration](../vscode/overview) — open metadata files in the embedded editor
- [AI Agent](../ai-agent/setup) — describe a metadata change in natural language and let the agent retrieve and modify the component
