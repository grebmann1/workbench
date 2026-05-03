# host-api

The contract the Workbench host exposes to extension apps (the packages under `packages/lwc/applications/*`).

An extension must not reach into `core/*` directly. Everything it needs from the host is re-exported from here.

## `host-api/*` vs `shared/*`

Both are "things extensions import," but they mean different things:

- **`host-api/<name>`** — host contract. May be stateful (`host-api/commands` owns a Map), tied to the live store (`host-api/store` re-exports the running `store`), or coupled to the running app (`host-api/element` is the base LWC class). Only meaningful inside the Workbench runtime. These names are stable — extensions rely on them not changing.
- **`shared/<name>`** — pure utility library. Stateless, no host coupling. Examples: `shared/utils` (string/array helpers), `shared/logger` (console wrapper), `shared/sf` (Salesforce object mappers), `shared/llm` (token math). Could in principle be published to npm. Extensions can import directly.

Rule when adding a new module: **stateful or host-coupled → `host-api/`. Pure → `shared/`.** If it's pure but you want extensions to have a single stable import prefix, put it in `shared/` and add a thin re-export in `host-api/` (that's what `host-api/logger` and `host-api/analytics` do today).

Do not create a third namespace (`host-helper/`, `host-shared/`, etc.) — it blurs the boundary.

## Current modules

Host-state:

- `host-api/store` — `store`, `injectReducer`, `removeReducer`, `connectStore`, `reportError`. Redux slice injection is how extensions attach their own state.
- `host-api/commands` — `registerCommand`, `invokeCommand`, `hasCommand`. Named command registry; how the host (electron launch intents, agent tools) talks to extensions without importing them.
- `host-api/types` — `RootState`, `AppDispatch`.
- `host-api/element` — base LWC class for extension components.
- `host-api/connector` — connector types (extensions consume, don't instantiate).
- `host-api/builder` — shared builder UI: `SaveModal`, `CATEGORY_STORAGE`.
- `host-api/desktopBridge` — Electron IPC primitives.
- `host-api/fs` — host filesystem adapter.
- `host-api/worker` — host worker runtime.
- `host-api/utils` — host-facing helpers.

Pure (thin re-exports of `shared/*` kept for prefix stability):

- `host-api/logger` — re-exports `shared/logger`.
- `host-api/analytics` — re-exports `shared/analytics`.

## Cross-app command contracts

Apps expose their capabilities to other apps (and to the agent / desktop CLI) via the `registerCommand` → `invokeCommand` registry. Contracts worth knowing:

### API Explorer

| Command              | Purpose                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.executeRequest` | Execute a request and reflect state into a specific tab (creates a new tab if `isNewTab`). Used by the app UI and the existing electron launch intent.                                                          |
| `api.sendStandalone` | Execute a request with **no UI side-effects**. Reads the active connector from the store, supports `{key}` variable substitution, returns `{status, headers, body, bodyRaw, contentType, size, durationMs}`. Preferred entry for agent tools, CLI verbs, and the chain runner. |
| `api.open`           | Open the API Explorer app (no state change).                                                                                                                                                                    |
| `api.new`            | Add a fresh blank request tab.                                                                                                                                                                                  |
| `api.send`           | Re-execute the current request (emits `api:send` window event so the panel picks up live DOM state first).                                                                                                      |
| `api.chain`          | Open the chain runner side panel (emits `api:openChainRunner`).                                                                                                                                                 |
| `api.import`         | Trigger the OpenAPI / Postman schema importer (emits `api:openSchemaImport`).                                                                                                                                   |

### SOQL Explorer

| Command                      | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `soql.open`                  | Open the SOQL Explorer app.                                     |
| `soql.openOrSelectTab`       | Create a tab or switch to an existing one (by id).              |
| `soql.executeQuery`          | Run a SOQL query against the active (or a named) org.           |
| `soql.executeQueryIncognito` | Run a query without recording it in Recent or saving tab state. |
