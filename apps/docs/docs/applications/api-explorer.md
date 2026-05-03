---
title: API Explorer
---

# API Explorer

**Menu path:** Code → API Explorer
**URL parameter:** `applicationName=api`

The API Explorer is Workbench's HTTP client, pre-loaded with your active org session. It ships with a multi-tab editor, code-snippet generation, OpenAPI schema import, a request-chain runner for sequencing calls, and agent / CLI integrations so the same execution path is reachable from your keyboard, the AI assistant, and the desktop shell.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **API Explorer** in the left menu (under **Code**) — or type `/api` in the agent publisher.
3. Choose a method (`GET`, `POST`, `PATCH`, `DELETE`, `PUT`, `HEAD`, `OPTIONS`) and enter an endpoint path (e.g. `/services/data/v59.0/sobjects/Account`).
4. Add request headers, a body (JSON/XML/GraphQL/form), and variables as needed.
5. Click **Send** — the response panel below shows status, timing, headers, body, and code snippets.

---

## Request panel

### HTTP methods
All standard methods are supported: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`.

### Body editors
The body editor auto-switches mode based on the active `Content-Type` header. Modes:

- **None** — no request body
- **JSON** / **XML** / **Text** — raw string body with syntax highlighting
- **GraphQL** — side-by-side query + variables editor, sent as `{query, variables}`
- **form-urlencoded** — key/value rows serialised with `URLSearchParams`
- **form-data** — multipart/form-data rows (text fields today, files on the roadmap)
- **Binary** — single-file upload (planned)

### Headers
Free-form header editor with reusable **presets** — Content-Type, Accept, If-Match, If-None-Match, Sforce-Call-Options, and any you define under **Settings → API Explorer → Header redaction**.

### Variables (`{key}` substitution)
The Variables tab exposes a JSON map. Any `{key}` token in the URL, headers, or body is replaced at send time. `{sessionId}` is special — it substitutes the active connector's access token. The substitution is `$`-sequence-safe so values containing `$&` / `$1` are not mis-interpreted.

### Auth profiles
Per-tab authentication override. Choose from:

- **Inherit from org** (default) — Bearer token from the current connector
- **Bearer** — explicit token
- **API key** — custom header + value
- **Basic** — base64-encoded `user:pass`
- **Custom** — free-form headers map
- **None** — strip all auth

Profiles are saved at user scope and tagged with a `sensitive` flag so they're redacted in snippet output.

---

## Response panel

- HTTP status badge, wall-clock duration, content length, content-type
- Viewer modes: **Pretty** (syntax-highlighted) / **Raw** / **Workbench** (structured tree) / **Preview** (HTML iframe) / **Snippet** (code generation)
- **Download** and **Copy** response body
- **Search** — substring or JSONPath (`$.a.b[0]`)
- Responses exceeding the **preview byte threshold** (configurable — default 100 KB) fall back to download-only to keep the UI responsive

### Snippet generation

The Snippet view emits a ready-to-run code block for the current request in your choice of:

- **Apex** `HttpRequest` + `Http.send()`
- **cURL** with bash-safe escaping
- **jsforce** Node.js `conn.request()`
- **Node `fetch`**
- **Python** `requests`
- **PowerShell** `Invoke-RestMethod`

Configure which languages appear and set the default via **Settings → API Explorer → Snippets**. Authorization and other sensitive headers are redacted to `{sessionId}` / `{redacted}` so you can paste snippets into issue trackers safely. Adjust the redacted-header list under **Settings → API Explorer → Header redaction**.

---

## OpenAPI schema import

Import an OpenAPI 3.x spec (JSON or YAML). The spec is dereferenced and rendered as a navigable tree — click a path to prefill the request panel with the method, sample body, sample path parameters, and server URL.

---

## Chain runner (`/api-chain`)

Build Postman-style sequences of requests with JSONPath-based variable extraction between steps and per-step assertions.

Example flow:

1. `POST /sobjects/Account` → extract `$.id` as `accountId`.
2. `POST /sobjects/Contact` with `{"AccountId":"{accountId}"}` — assert `status == 201`.
3. `GET /sobjects/Account/{accountId}/contacts` — assert `$.totalSize == 1`.

Assertions supported:

- `{ status: 200 }` or `{ status: [200, 201] }`
- `{ jsonPath: "$.foo", equals: "bar" }`
- `{ jsonPath: "$.id", exists: true }`
- `{ contains: "…" }` (substring match against raw body)
- `{ headerPresent: "X-Sforce-…" }`

Steps run sequentially. On failure, later steps are marked `skipped` unless the step declares `bailOnFailure: false`.

---

## Slash commands

The API Explorer registers five slash commands that the agent publisher auto-completes:

| Command        | Action                                 |
| -------------- | -------------------------------------- |
| `/api`         | Open the API Explorer app              |
| `/api-new`     | Open a new blank tab                   |
| `/api-send`    | Send the current request               |
| `/api-chain`   | Open the chain runner side panel       |
| `/api-import`  | Trigger the OpenAPI / Postman importer |

---

## Agent tool

When **Settings → API Explorer → Agent integration → Enable agent tool** is on (default), the agent gains an `api_execute_request` tool:

```text
Please list the limits of my current org.
→ api_execute_request({ method: "GET", url: "/services/data/v59.0/limits" })
```

The tool runs through the API Explorer's canonical execution path (`api.sendStandalone`), inheriting the current connector's Bearer token — no shell-out, no `sf CLI` dependency. Bodies larger than 50 KB are truncated in the agent result (signalled via `truncated: true`) so large responses don't blow up the context window.

The legacy `sf-api-request` skill (which shells out to `sf api request rest`) is now **deprecated** in favour of this tool. It's kept only for `sf CLI`-specific features (binary streaming via `-S`, Postman-style file input via `-f`, and the `@{refId.field}` composite batch reference syntax).

---

## Desktop CLI

`workbench-desktop` exposes the API Explorer as a top-level verb:

```sh
workbench-desktop api request GET /services/data/v59.0/limits --target-org my-org
workbench-desktop api request POST /services/data/v59.0/sobjects/Account \
  --target-org my-org \
  -H "Content-Type: application/json" \
  --body '{"Name":"Acme"}'

# Load a JSON body from a file:
workbench-desktop api request POST /services/data/v59.0/sobjects/Account \
  --target-org my-org -H "Content-Type: application/json" --body @account.json

# Machine-readable JSON output (status, headers, parsed body):
workbench-desktop api request GET /services/data/v59.0/limits -o my-org --json
```

The legacy `sf`-prefixed form (`workbench-desktop sf api request …`) remains supported.

---

## Settings

Under **Settings → API Explorer**:

- **Layout** — splitter orientation (horizontal / vertical)
- **Defaults** — API version, Content-Type, request timeout, abort-on-navigate
- **Response handling** — preview byte threshold, auto-prettify JSON / XML
- **Header redaction** — header names (newline-separated) whose values are hidden in generated snippets
- **Snippets** — default language + per-language enable toggles
- **Agent integration** — expose / hide the `api_execute_request` tool

All settings persist at user scope via the host cacheManager.

---

## Related tools

- [Anonymous Apex](./anonymous-apex) — execute server-side Apex logic
- [SOQL Explorer](./soql-explorer) — query data without constructing raw REST calls
- [AI Agent](../ai-agent/setup) — the agent uses `api_execute_request` to call endpoints on your behalf
