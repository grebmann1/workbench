## Sync your org's metadata into the workspace

The **Salesforce** bottom panel is the control surface for this workbench. It shows the current org and the primary actions you will use the most.

### What to do

1. Open the **Salesforce** panel from the bottom tab bar (it is auto-focused on startup).
2. Click **Sync Project (fetch/update)** to pull the org's source into `force-app/`.
3. Watch the **Output** channel (Salesforce: Show Output) for progress and completion.

### Why this matters

Most other commands (SOQL, Anonymous Apex, Deploy, Retrieve, conflict detection) read from this local source tree. Syncing first gives you a clean baseline to work from.

### Tips

- Source Status (next to Sync Project) compares the local files against the org.
- Re-run Sync Project any time the org changes under you — it is incremental.
- You can also run `Salesforce: Sync Project (fetch/update)` from the Command Palette.
