---
title: Org Overview
---

# Org Overview

**Menu path:** Explorers → Org Overview  
**URL parameter:** `applicationName=org`

The Org Overview gives you an at-a-glance health check of your Salesforce org without navigating through Setup.

---

## What it shows

### Organization details

- Org name, edition, and org ID
- Primary country and default language
- Namespace prefix (if any)

### Users

- Total active and inactive user count
- License type breakdown
- List of recently active users

### License utilization

A table of all purchased license types and how many seats are in use versus available. Helps you spot licenses that are over-provisioned or close to their limit.

### Code health

A summary of code-quality indicators for the org:

- Number of Apex classes and triggers
- Test coverage percentage (last known run)
- Number of Flows and active Processes
- Any components approaching Salesforce governor limits

---

## Getting started

1. Open Workbench and ensure you have a connected org (see [Managing Org Access](../getting-started/org-access)).
2. Click **Org Overview** in the left menu (under **Explorers**).
3. The dashboard loads the org summary automatically — no additional steps required.

Data is fetched live from the Salesforce REST API each time you open the page.

---

## Related tools

- [SObject Explorer](./sobject-explorer) — drill into specific object schemas
- [Access Analyzer](./access-analyzer) — review user permissions
- [Metadata Explorer](./metadata-explorer) — inspect metadata components
