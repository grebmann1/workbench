## Deploy changes back to the org

Deploy keeps the org in sync with your local changes. The workbench supports three styles: automatic, manual, and validate-only.

### Auto-deploy on save

Tracked Salesforce files deploy automatically when you save. Toggle this on the **Salesforce** panel under "Deploy options":

- **Auto-deploy on save** — deploy every save.
- **Prefer Tooling API** — faster path for Apex / LWC / Aura; falls back to Metadata API.
- **Notify on success** — toast on successful deploys.

### Manual deploy

- **Salesforce: Deploy (Metadata API)** (`salesforceMetadata.deployMetadataApi`) — deploy current file or selection.
- **Salesforce: Validate Deploy (Metadata API)** (`salesforceMetadata.validateDeployMetadataApi`) — dry-run a deploy without committing.

### Conflict detection

The workbench tracks remote changes and warns when a local deploy would overwrite newer org state. Open **Salesforce: View Source Tracking Conflicts** (`salesforceMetadata.view.conflicts`) to review and resolve.

### Before you deploy to production

- Check the org banner — is this really the target you intended?
- Prefer **Validate Deploy** first when touching critical metadata.
- Keep an eye on the Output channel for detailed deploy results and component-level failures.
- For pulling metadata back from the org, use the **Org Browser** panel from the activity bar.
