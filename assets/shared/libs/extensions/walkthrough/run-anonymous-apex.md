## Run Anonymous Apex

Execute ad-hoc Apex against the connected org — useful for one-off data fixes, probing behavior, or scripting debug traces.

### What to do

1. Create or open an `.apex` file in the workspace (or select Apex inside any document).
2. Run **Salesforce: Execute Anonymous** (`salesforceMetadata.executeAnonymous`) — the result is shown in Output.
3. For a full debug log, run **Salesforce: Execute Anonymous with Logs** (`salesforceMetadata.executeAnonymousWithLogs`). It enables a trace flag, runs the block, and opens the resulting log.

### Safety

- Respect the org banner at the top of the workbench — running DML in a production org is irreversible.
- Prefer `Database.rollback` patterns when validating behavior on live orgs.

### Tips

- Selection-based execution lets you run just the highlighted block.
- The results panel preserves stdout, governor limits, and compile errors.
