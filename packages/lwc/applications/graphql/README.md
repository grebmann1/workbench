# GraphQL Explorer

Workbench application that sends GraphQL queries to Salesforce's
`/services/data/v{apiVersion}/graphql` endpoint and renders the response
as a collapsible JSON tree.

## Structure

- `graphql.manifest.json` — app registration (menu group `code`, order 15).
- `app/` — shell wired to `builder-editor` with editor + variables + output
  panel inside a split view.
- `slices/ui.ts` — tabs, editor body, variables text, panel toggles; tab
  cache + recent history persisted to localStorage.
- `slices/query.ts` — async thunk `executeQuery` that POSTs to the
  GraphQL endpoint via `connector.conn.request`. Keeps `data` + `errors`
  in an entity-adapter keyed by tab id.
- `outputPanel/` — renders inline GraphQL errors plus the JSON tree.
- `jsonTree/` — flat-row JSON viewer with expand/collapse, no external deps.

## Adding the Monaco GraphQL language

Minimal Monarch tokenizer in
`packages/lwc/main/editor/languages/graphql.js`, wired into
`editor/default` via `GRAPHQL.configureGraphqlLanguage(this.monaco)`.
