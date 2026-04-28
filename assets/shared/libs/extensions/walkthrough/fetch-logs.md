## Fetch and tail debug logs

The **Salesforce Logs** activity-bar panel is the one-stop view for everything log-related. It surfaces trace flags, debug levels, recent `ApexLog` records, and the auto-collect stream in a single side bar.

### What to do

1. Open the **Salesforce Logs** panel from the activity bar (the notebook icon on the left) — or use the command: **Salesforce Logs: Open Panel** (`salesforceMetadata.logs.openPanel`).
2. From the panel, enable debug logs on the current user (or another user) with one click.
3. Trigger the code you want to observe (click a button, run Anonymous Apex, fire an automation).
4. Pick a log from the recent list — it opens directly in the editor.
5. Start **auto-collect** from the panel to stream new logs into the workspace under `.salesforce/logs/`.

### Tips

- Trace flags and debug levels are manageable inline from the panel — no need to juggle commands.
- Logs are regular files in the workspace, so you can grep, diff, and share them.
- The status bar reflects the auto-collect state so you never leave collection running accidentally.
