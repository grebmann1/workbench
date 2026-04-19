---
title: API Explorer
---

# API Explorer

**Menu path:** Code → API Explorer  
**URL parameter:** `applicationName=api`

The API Explorer lets you construct and send Salesforce REST and SOAP API calls directly from Workbench. It is the equivalent of a Salesforce-aware HTTP client, pre-loaded with your active session credentials.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **API Explorer** in the left menu (under **Code**).
3. Select the API type: **REST** or **SOAP**.
4. Enter the endpoint path (e.g. `/services/data/v62.0/sobjects/Account`).
5. Choose the HTTP method (`GET`, `POST`, `PATCH`, `DELETE`).
6. Add a request body if needed (JSON for REST, XML for SOAP).
7. Click **Send** — the response appears in the panel below.

---

## REST API

The REST interface supports all standard Salesforce REST endpoints:

- **SObject CRUD** — `/services/data/vXX.0/sobjects/<Object>/<Id>`
- **SOQL via REST** — `/services/data/vXX.0/query/?q=SELECT+...`
- **Tooling API** — `/services/data/vXX.0/tooling/`
- **Metadata API (REST)** — `/services/data/vXX.0/metadata/`
- **Composite / Batch** — `/services/data/vXX.0/composite/`

Headers are pre-populated with `Authorization: Bearer <sessionId>` and `Content-Type: application/json`. You can add or override any header.

---

## SOAP API

The SOAP interface accepts raw SOAP envelopes. Workbench injects your active session ID into the envelope before sending, so you do not need to manually include it.

Common SOAP endpoints:

- Partner WSDL — `/services/Soap/u/XX.0`
- Enterprise WSDL — `/services/Soap/c/XX.0`
- Metadata WSDL — `/services/Soap/m/XX.0`

---

## Response panel

- Syntax-highlighted JSON or XML response
- HTTP status code and response time
- Copy-to-clipboard button for the full response body

---

## Tabs

The API Explorer supports multiple simultaneous tabs. Click **+** to open a new tab and keep several requests open at once. Each tab maintains its own endpoint, method, headers, and body.

---

## Related tools

- [Anonymous Apex](./anonymous-apex) — execute server-side Apex logic
- [SOQL Explorer](./soql-explorer) — query data without constructing raw REST calls
- [AI Agent](../ai-agent/setup) — the agent can call API endpoints on your behalf
