## Browse and retrieve metadata with the Org Browser

The **Org Browser** activity-bar panel is the fastest way to pull metadata out of the org without hand-writing a `package.xml`.

### What to do

1. Open the **Org Browser** from the activity bar — or run **Salesforce Org Browser: Open View** (`salesforceOrgBrowser.openView`).
2. Expand any metadata type (Apex Class, Custom Object, Flow, …) to load the list of components from the org.
3. Click the **retrieve** action next to a component (or the type itself) to pull it into `force-app/`.
4. Use the **refresh** action on a type to re-query the org if things have changed.

### Tips

- Retrieval uses the Metadata API under the hood and updates local source tracking automatically.
- Folder-scoped types (Dashboard, Document, EmailTemplate, Report) expand folder-by-folder.
- Combine this with the Salesforce panel's **Source Status** to verify what diverged before you retrieve.
- For larger bulk pulls, keep using **Sync Project (fetch/update)** — the Org Browser is tuned for targeted, per-component retrieves.
