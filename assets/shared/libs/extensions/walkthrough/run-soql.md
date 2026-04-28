## Query your org with SOQL

Write SOQL directly inside the workbench — no need to leave VS Code to inspect records.

### What to do

1. Open the Command Palette and run **Salesforce: Open SOQL Scratch** (`salesforceMetadata.openSoqlScratch`) to create a scratch `.soql` document.
2. Type a query, e.g. `SELECT Id, Name FROM Account LIMIT 20`.
3. Run it with **Salesforce: Run SOQL Query** (`salesforceMetadata.runSoqlQuery`) — results open in a side panel.
4. For Tooling objects (ApexClass, CustomField, FlowDefinition, …) use **Salesforce: Run Tooling Query** (`salesforceMetadata.runToolingQuery`) instead.

### Tips

- Save a scratch as a regular `.soql` file inside the project to keep it around.
- The SOQL Builder view lets you compose queries visually — toggle with `soql.builder.toggle`.
- Results are exportable from the results panel.
