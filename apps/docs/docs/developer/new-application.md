---
title: Adding a New Application
---

# Adding a New Application

A **Workbench application** is a self-contained extension — a full-screen tool
accessible from the left-side menu and via the `?applicationName=<path>` URL
parameter. SOQL Explorer, Metadata Explorer, and API Explorer all follow the
same pattern described below.

Extensions live under `packages/lwc/applications/<name>/` and are discovered at
build time from a declarative manifest. Core never imports from an extension
directly; the two sides talk through the `host-api/*` contract and the
command/reducer registry.

This guide walks through adding one from scratch.

---

## How the pieces fit together

- Each extension is a folder under `packages/lwc/applications/<name>/` with its
  own `package.json` and `<name>.manifest.json`.
- `tools/scripts/generate_application_manifest.js` walks every manifest and
  emits `packages/lwc/main/application/applicationRegistry/applicationRegistry.ts`.
  The core host reads **only** that generated file — edits there are
  overwritten on the next build.
- Extensions consume core via the `host-api/*` namespace (stable contract) and
  `shared/*` (pure utilities). See
  [`packages/lwc/main/host-api/README.md`](https://github.com/tprouvot/sf-toolkit-web/blob/master/packages/lwc/main/host-api/README.md)
  for the boundary rules.
- Runtime wiring — Redux reducers, named commands — happens via
  `injectReducer()` and `registerCommand()`, not via static imports on the host
  side. This keeps core agnostic of which extensions exist.

---

## Starter template

The repo ships a deliberately minimal reference extension at
[`packages/lwc/applications/urlencoder/`](https://github.com/tprouvot/sf-toolkit-web/tree/master/packages/lwc/applications/urlencoder).
It's a working URL encode / decode utility — no Redux state, no connector,
no command registry — built as the smallest viable extension and
exercised by every CI build so it can't rot.

**Use it as your starting point**, not SOQL:

```bash
cp -r packages/lwc/applications/urlencoder packages/lwc/applications/myapp
mv packages/lwc/applications/myapp/urlencoder.manifest.json \
   packages/lwc/applications/myapp/myapp.manifest.json
```

Then edit:

1. `myapp/myapp.manifest.json` — set `id`, `name` (to `myapp/app`), `label`,
   `shortName`, `description`, `path`, `menuGroup`, `menuOrder`, and icons.
2. `myapp/package.json` — update the `name` field (convention:
   `@workbench/app-myapp`).
3. `myapp/app/app.ts` — your component logic.
4. `packages/lwc/main/tsconfig.json` — add two `paths` entries so
   TypeScript can resolve the module (see
   [Build and verify](#build-and-verify) below).

Walk through the sections below to understand what each piece does. The
SOQL extension is referenced throughout for larger patterns (Redux slices,
command registry) when you outgrow the template.

---

## Folder layout

Use `packages/lwc/applications/soql/` as the canonical reference:

```
packages/lwc/applications/myapp/
├── package.json                 # minimal, declares the boundary
├── myapp.manifest.json          # declarative metadata (see below)
├── app/
│   ├── app.ts                   # LWC entry, default export
│   ├── app.html
│   └── app.css
└── slices/                      # optional Redux state
    ├── slices.ts                # barrel: re-exports createSlice outputs
    └── myapp.ts                 # the actual reducer
```

The folder name **must** match the manifest `id` field (enforced by the
validator) and the `app/` sub-folder **must** exist with `app.ts` as the
default export — this maps to the `myapp/app` LWC module specifier.

### `package.json`

```json
{
    "name": "@workbench/app-myapp",
    "version": "0.0.0",
    "private": true,
    "main": "app/app.ts"
}
```

The `@workbench/app-*` prefix is convention; the package exists mainly to mark
the extension boundary for tooling.

---

## The manifest

Create `packages/lwc/applications/myapp/myapp.manifest.json`. Here is the SOQL
manifest verbatim as a starting template:

```json
{
    "id": "soql",
    "name": "soql/app",
    "label": "SOQL Explorer",
    "shortName": "SOQL",
    "description": "Build SOQL queries with fields suggestion and export them.",
    "path": "soql",
    "quickActionIcon": "standard:data_model",
    "type": "developer",
    "menuGroup": "data",
    "menuOrder": 10,
    "flags": {
        "isFullHeight": true,
        "isDeletable": true,
        "isElectronOnly": false,
        "isOfflineAvailable": false,
        "isMenuVisible": true,
        "isTabVisible": true
    }
}
```

### Field reference

| Field | Required | Format | Description |
| --- | --- | --- | --- |
| `id` | yes | `^[a-z][a-z0-9_-]*$` | Stable identifier. Used as Redux key and URL fragment. Must equal the folder name. |
| `name` | yes | `^[a-zA-Z][a-zA-Z0-9]*/app$` | LWC module specifier (e.g. `myapp/app`). Must be globally unique. |
| `label` | yes | string | Display name in the menu and tab bar. |
| `shortName` | yes | string | Abbreviated label used in narrow tabs. |
| `description` | yes | string | Shown in Quick Actions and tooltips. |
| `path` | yes | `^[a-z][a-z0-9-]*$` | Value of `?applicationName=<path>` and the URL router key. Must be unique. |
| `type` | yes | enum | One of `developer`, `explorer`, `data`. Used for filtering/grouping. |
| `menuGroup` | yes | enum | One of `data`, `code`, `explorers`, `deploy`. |
| `menuOrder` | yes | integer ≥ 0 | Sort order within the menu group (lower = higher in list). |
| `quickActionIcon` | yes | `namespace:icon_name` | SLDS icon. Namespace one of `standard`, `utility`, `custom`, `action`, `doctype`. |
| `menuIcon` | no | same as `quickActionIcon` | Optional distinct icon shown in the side menu. |
| `reducerKey` | no | string | Advertises which Redux slice key this app owns (matches the key passed to `injectReducer`). |
| `flags` | yes | object | See below. |

### Flags

| Flag | Type | Description |
| --- | --- | --- |
| `isFullHeight` | boolean | App fills the available viewport height. |
| `isDeletable` | boolean | Whether the open tab can be closed by the user. |
| `isElectronOnly` | boolean | Hide on web/Chrome extension; show only in the desktop app. |
| `isChromeOnly` | boolean (optional) | Inverse of the above — show only in the Chrome extension. |
| `isOfflineAvailable` | boolean | App functions without an active org connection. |
| `isMenuVisible` | boolean | Show in the left navigation menu. |
| `isTabVisible` | boolean | Show as an openable tab. |

Unknown fields and flags are rejected by the validator.

---

## Minimal `app.ts`

```ts
import ToolkitElement from 'host-api/element';
import { store, injectReducer, connectStore } from 'host-api/store';
import { registerCommand } from 'host-api/commands';
import { reducer as myappReducer } from 'myapp/slices';

// Module-scope bootstrap: runs once when the extension bundle is first
// imported. The guard flag keeps repeat calls idempotent — `injectReducer`
// replaces, `registerCommand` replaces, but we still avoid the re-entry to
// keep logs clean on hot reloads.
let _bootstrapped = false;
function bootstrap() {
    if (_bootstrapped) return;
    _bootstrapped = true;
    injectReducer('myapp', myappReducer);
    registerCommand('myapp.doThing', (payload: { id: string }) => {
        // Handle the command. The host calls this via
        // invokeCommand('myapp.doThing', payload) without importing your code.
    });
}
bootstrap();

export default class App extends ToolkitElement {
    connectedCallback() {
        connectStore(store, this._storeChange.bind(this), this);
    }

    _storeChange(_state: unknown) {
        // React to Redux store changes here.
    }
}
```

### Why module-scope bootstrap?

The host does **not** import your extension's code. It imports the generated
registry which statically references `myapp/app` as an LWC module, and the
first time the router mounts your component the bundle is loaded. Running
`injectReducer` / `registerCommand` at module scope (not inside
`connectedCallback`) guarantees that any dispatch inside `connectedCallback`
— or any `invokeCommand('myapp.*', ...)` fired from elsewhere the moment
the bundle is hot — finds the wiring already installed.

### Why named commands instead of direct imports?

Core needs to talk to extensions (electron launch intents, agent tools, menu
items firing cross-app actions) without taking a build-time dependency on
them. `invokeCommand('myapp.doThing', payload)` returns `undefined` when the
extension is not loaded, so callers can safely fan out.

`ToolkitElement` gives your component:

- `this.connector` — the active jsforce-style connection (when an org is
  selected).
- `this.alias` — the current org alias.
- Standard LWC lifecycle hooks.

---

## Adding a Redux slice (optional)

Model after `packages/lwc/applications/soql/slices/`:

```ts
// packages/lwc/applications/myapp/slices/myapp.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const initialState = { items: [] as string[] };

export const reduxSlice = createSlice({
    name: 'myapp',
    initialState,
    reducers: {
        addItem(state, action: PayloadAction<string>) {
            state.items.push(action.payload);
        },
    },
});

export const reducer = reduxSlice.reducer;
```

```ts
// packages/lwc/applications/myapp/slices/slices.ts
export * as MYAPP from './myapp';
```

Wire the reducer in `app.ts` with one line:

```ts
injectReducer('myapp', myappReducer);
```

The slice key (`'myapp'` above) should match your manifest `id` unless you
have a reason otherwise. Declaring `"reducerKey": "myapp"` in the manifest
documents the claim for anyone grepping the registry.

---

## Build and verify

Before building, wire up the TypeScript aliases. The Rollup config
auto-discovers everything under `packages/lwc/applications/` via a
wildcard, but the main tsconfig's `paths` list is explicit per app —
without entries there, `tsc` fails with `Cannot find module 'myapp/app'`.
Add to `packages/lwc/main/tsconfig.json`:

```json
"myapp/*": ["../applications/myapp/*"],
"myapp/app": ["../applications/myapp/app/app"],
```

If you added a slices folder, also add:

```json
"myapp/slices": ["../applications/myapp/slices/slices"],
"myapp/slices/myapp": ["../applications/myapp/slices/myapp"],
```

and register the slice paths in both module arrays of
`tools/build/rollup.extension.mjs` (search for `soql/slices` for the
pattern — only required for apps that ship their own reducers).

Then:

```bash
# Regenerate the aggregated manifest + registry. Must succeed and report
# one more app than before (N + 1).
node tools/scripts/generate_application_manifest.js

# Build all six bundles.
npm run build:extension
```

Then open the built surface and confirm:

1. Your app appears in the menu under the correct `menuGroup`, in the
   expected `menuOrder` position.
2. Navigating to `?applicationName=<path>` opens the tab.
3. In browser devtools → Redux, your slice key is present in the state tree
   after mount.
4. If you registered a command, running
   `invokeCommand('myapp.doThing', { /* ... */ })` from the devtools console
   (via `window.__workbenchCommands__` in dev) hits your handler.

If the generator refuses to run, the validator caught something — read the
error message; each field error explains what format or enum is expected.

---

## What the core does with your manifest

`tools/scripts/generate_application_manifest.js` aggregates every
`*.manifest.json` it finds into:

- `packages/lwc/main/application/applicationRegistry/application.manifest.json`
  — the pure-data aggregate.
- `packages/lwc/main/application/applicationRegistry/applicationRegistry.ts`
  — hard-coded static `import` statements for each app's `name` specifier,
  plus the `APPLICATION_APP_MAPPING` object the host resolves routes against.

The static imports are required — LWC module specifiers must be statically
analysable for Rollup and the LWC resolver. **Do not edit these files by
hand**; the pre-build step regenerates them.

---

## Related guides

- [Adding a New Tool](./new-tool) — for utilities that live inside an existing
  app rather than a full route.
- [Architecture Overview](../architecture/overview) — monorepo layout and
  build targets.
- [`host-api/` README](https://github.com/tprouvot/sf-toolkit-web/blob/master/packages/lwc/main/host-api/README.md)
  — the `host-api/*` vs `shared/*` boundary. Read this before adding utility
  modules to either side.
