---
title: Applications Overview
---

# Applications Overview

Workbench ships with a set of built-in applications covering the most common Salesforce administration and development tasks. All tools are available in the left-side menu inside the app.

---

## Explorers

Tools for browsing and understanding org data and metadata.

| Application                              | Description                                                       |
| ---------------------------------------- | ----------------------------------------------------------------- |
| [Org Overview](./org-overview)           | Users, company info, license utilization, and code health summary |
| [Metadata Explorer](./metadata-explorer) | Browse, inspect, and modify org metadata components               |
| [SObject Explorer](./sobject-explorer)   | Explore SObject schemas — fields, relationships, picklist values  |
| [Access Analyzer](./access-analyzer)     | Compare permission sets and profiles side by side                 |
| [Record Viewer](./record-viewer)         | Inspect individual Salesforce records by ID                       |

---

## Data

Tools for querying and importing data.

| Application                      | Description                                                            |
| -------------------------------- | ---------------------------------------------------------------------- |
| [SOQL Explorer](./soql-explorer) | Build and run SOQL queries with field suggestions; export results      |
| [Data Import](./data-import)     | Insert, update, or upsert records from a CSV file via REST or Bulk API |

---

## Code

Tools for executing and testing code against your org.

| Application                        | Description                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| [API Explorer](./api-explorer)     | Explore and call Salesforce REST and SOAP APIs directly                               |
| [Anonymous Apex](./anonymous-apex) | Write and execute Apex scripts on the fly                                             |
| [Event Explorer](./event-explorer) | Subscribe to platform events and visualize payloads in real time                      |
| [Code Toolkit](./org-overview)     | Retrieve source code, run static analysis, preview Visualforce pages _(Desktop only)_ |

---

## Deploy

| Application                            | Description                                                 |
| -------------------------------------- | ----------------------------------------------------------- |
| [Deploy & Retrieve](./deploy-retrieve) | Deploy or retrieve metadata packages using the Metadata API |

---

## Admin

| Application                    | Description                                                  |
| ------------------------------ | ------------------------------------------------------------ |
| [Jobs Monitor](./jobs-monitor) | Monitor Scheduled, Async Apex, Flex Queue, and Bulk API jobs |

---

## Utilities

Lighter tools accessible from the menu without a dedicated route.

| Tool                 | Description                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| Text Compare         | Side-by-side diff of any two text inputs                                                |
| Smart Input          | AI-powered input field for contextual Salesforce suggestions _(Chrome extension, beta)_ |
| SARIF Viewer         | Visualize static analysis results in SARIF format                                       |
| Documentation Search | Search the official Salesforce documentation without leaving Workbench                  |

---

## How to open an application

- **From the menu** — click any item in the left-side menu. See [Navigating the Menu](../getting-started/menu).
- **From the overlay** — press `Ctrl/Cmd + Shift + E` on any Salesforce page and click a Quick Link. See [Launching from the Overlay](../getting-started/overlay).
- **Direct URL** — append `?applicationName=<name>` to the app URL, e.g. `/app?applicationName=soql`.
