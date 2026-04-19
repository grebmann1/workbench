---
title: Deploy & Retrieve
---

# Deploy & Retrieve

**Menu path:** Deploy → Deploy & Retrieve  
**URL parameter:** `applicationName=package`

The Deploy & Retrieve tool lets you deploy metadata to or retrieve metadata from your connected org using the Salesforce Metadata API. It is the Workbench equivalent of `sf project deploy` / `sf project retrieve`.

---

## Getting started

### Retrieve metadata

1. Open Workbench and connect to an org.
2. Click **Deploy & Retrieve** in the left menu (under **Deploy**).
3. Select the **Retrieve** tab.
4. Build a package manifest by selecting metadata types and component names, or paste an existing `package.xml`.
5. Click **Retrieve** — Workbench downloads the ZIP and saves the contents to the [virtual file system](../storage/indexeddb-workspace).
6. Open the retrieved files in the [VS Code editor](../vscode/overview) for inspection or editing.

### Deploy metadata

1. Select the **Deploy** tab.
2. Upload a ZIP file containing a valid Salesforce metadata package (with `package.xml`), or point to files already in the virtual workspace.
3. Set deployment options:
   - **Check only** — validates without committing changes
   - **Ignore warnings** — continues deployment even if warnings are returned
   - **Purge on delete** — permanently deletes components listed in `destructiveChanges.xml`
4. Click **Deploy**.
5. Monitor progress in the status panel — Workbench polls the deployment job until it completes.

---

## Package manifest (package.xml)

You can paste or type a `package.xml` directly:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>MyApexClass</members>
        <name>ApexClass</name>
    </types>
    <version>62.0</version>
</Package>
```

Workbench validates the manifest before sending it to the API.

---

## Deployment results

After deployment completes, the results panel shows:

- Overall status (Succeeded / Failed / PartialSuccess)
- Component-level results with success/failure per item
- Test run results if Apex tests were triggered
- Error messages with line numbers for failed components

You can download the full results as a report.

---

## Related tools

- [Metadata Explorer](./metadata-explorer) — inspect individual components before packaging
- [VS Code Integration](../vscode/overview) — edit retrieved source in the embedded editor
- [AI Agent](../ai-agent/setup) — the agent can retrieve, modify, and redeploy metadata components
