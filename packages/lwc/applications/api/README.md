# API Explorer

Compose and send REST API requests against your org with saved requests and recents.

## Where to find
- Developer → API Explorer

## Key features
- Choose method, endpoint, and raw, form-data, binary, or empty bodies; add headers
- Execute requests using the connected session
- View response body and headers
- Recents and Saved requests (Global / Org-specific)
- Optional OpenAPI schema storage for reuse

## Persistence
- Recent API requests: local per org
- Saved requests:
  - Global: available to all orgs
  - Org-specific: scoped to current org
  - Schemas: stored separately for reuse

## Tips
- Use saved requests for common integrations
- Store and reuse headers (e.g., content-type) as needed
- For form-data and binary requests, selected files are kept only in the active browser session.
  They are never saved with requests or included in request history.
- File uploads are restricted to the connected Salesforce org origin. Leave `Content-Type`
  unset for form-data requests so the browser can generate the multipart boundary.

