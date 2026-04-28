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

- Each extension is a folder under `packages/lwc/applications/<name>/`
  described by a single `<name>.manifest.json`.
- Full-screen apps and smaller utilities share the same shape — there is no
  separate "tools" folder. Utilities are just applications with
  `type: "utility"` (Text Compare, Smart Input, URL Encoder are all
  examples).
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
   `shortName`, `description`, `path`, `type`, `menuGroup`, `menuOrder`,
   and icons.
2. `myapp/app/app.ts` — your component logic.
3. `packages/lwc/main/tsconfig.json` — add two `paths` entries so
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

There is no `package.json` per extension. The manifest is the single source
of truth; module resolution happens through the root workspace and the LWC
module aliases declared in `packages/lwc/main/tsconfig.json`.

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
| `type` | yes | enum | One of `developer`, `explorer`, `data`, `utility`. Drives the menu section the app appears in (utilities are grouped together under *Utilities*) and the quick-action filter chip. |
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

### Declaring user settings

An app that needs user-facing preferences should declare them in its own
manifest — no change to the host Settings page required. Two modes, mutually
exclusive:

**Mode A — declarative `settings[]`** (default, covers most cases):

```json
"settings": [
    {
        "key": "myapp_compact_mode",
        "label": "Compact mode",
        "description": "Reduce spacing for dense layouts.",
        "type": "toggle",
        "defaultValue": false
    }
]
```

Supported `type` values: `toggle`, `text`, `password`, `number`, `select`,
`multiselect`. Each `key` must already exist in `CACHE_CONFIG`
(`packages/lwc/shared/modules/cacheManager/cacheManager.ts`) — the generator
cross-checks at build time.

For `select` / `multiselect`, provide `options` as either an inline array
(`[{ "label": "...", "value": "..." }]`) or a provider id string (e.g.
`"myapp.regions"`). Dynamic providers are registered from the app's entry
module:

```ts
import { registerSettingOptionsProvider } from 'host-api/settings';
registerSettingOptionsProvider('myapp.regions', () => [
    { label: 'US', value: 'us' },
    { label: 'EU', value: 'eu' },
]);
```

**Mode B — custom `settingsComponent`** (escape hatch for complex UIs such as
connection cards or server lists that don't fit the field primitives):

```json
"settingsComponent": "myapp/appSettings"
```

Then create `packages/lwc/applications/myapp/appSettings/appSettings.{ts,html}`
exposing `@api config` and `@api inputfield_change`. The host mounts it via
`<lwc:component lwc:is>` inside the Settings > Applications tab, and changes
flow through the same save pipeline as declarative settings.

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
- `this.pageClass` — SLDS-compatible class (`full-page` /
  `full-page-connected`) to wrap your root element. Use it on the outermost
  `<div>` of your template so the app plugs into the standard layout.
- Standard LWC lifecycle hooks.

---

## UI shell: the builder components

Every first-party app wraps its body in the **builder** component pair so it
gets a consistent page header, toolbar, and optional left/right rails. The
urlencoder template and Text Compare both use it — copy that shape for any
new app unless you have a specific reason not to.

```html
<template>
    <div class={pageClass}>
        <builder-editor>
            <builder-header
                slot="header"
                title="Tools"
                sub-title="URL Encoder"
                icon-name="utility:link">
                <div slot="actions" class="slds-builder-toolbar__actions">
                    <!-- primary action buttons: Run, Save, Export, … -->
                </div>
                <template lwc:if={showEmptyState}>
                    <p slot="meta" class="slds-page-header__meta-text slds-text-color_weak">
                        Paste a URL component into the input to encode or decode.
                    </p>
                </template>
                <div slot="subactions" class="slds-builder-toolbar__actions">
                    <!-- secondary controls: toggles, mode switch, filters -->
                </div>
            </builder-header>
            <article class="full-page-body slds-card slds-p-around_medium">
                <!-- your app body -->
            </article>
        </builder-editor>
    </div>
</template>
```

### `<builder-editor>` — the page shell

Provides the outer layout grid. Named slots:

| Slot | Purpose |
| --- | --- |
| `header` | The page header; place a `<builder-header>` here. |
| `left` | Optional left rail — renders inside `<builder-left-panel>`. Only use if your app has navigable sections or a sidebar. |
| `right` | Optional right rail (rendered when the right-panel state slice opts in). Typically for contextual inspectors. |
| (default) | The main body — usually an `<article class="full-page-body">`. |

### `<builder-header>` — the page header

`@api` properties:

| Prop | Type | Purpose |
| --- | --- | --- |
| `title` | string | Top-line group label (e.g. `"Tools"`). |
| `sub-title` | string | The app name (e.g. `"URL Encoder"`). |
| `icon-name` | string | SLDS icon (`namespace:name`). |
| `meta-text` | string | Shortcut for a plain meta line (equivalent to the `meta` slot). |

Named slots:

| Slot | Purpose |
| --- | --- |
| `subtitle` | Inline badge or status next to the sub-title (e.g. unsaved marker). |
| `actions` | Primary action toolbar — typically `<lightning-button>` items. |
| `details` | Mid-row details (breadcrumbs, summary, etc.). |
| `meta` | Meta-text row under the title; good for empty-state hints. |
| `subactions` | Secondary controls row — toggles, mode switchers, inline filters. |

**Reference implementations** (read these when building something new):

- [`packages/lwc/applications/urlencoder/app/app.html`](https://github.com/tprouvot/sf-toolkit-web/blob/master/packages/lwc/applications/urlencoder/app/app.html)
  — minimal template app using only the `actions`, `meta`, `subactions`
  slots.
- [`packages/lwc/applications/textCompare/app/app.html`](https://github.com/tprouvot/sf-toolkit-web/blob/master/packages/lwc/applications/textCompare/app/app.html)
  — similar shape but demonstrates a richer toolbar and inline Monaco
  editor.

---

## Reporting errors to the footer

The app shell ships a footer error panel that subscribes to the global
`error` Redux slice. **Dispatch errors through `reportError` and they
surface there automatically** — never render your own inline error banner
just for runtime failures.

```ts
import { reportError } from 'host-api/store';

try {
    await doTheThing();
} catch (err) {
    reportError(err, { source: 'myapp' });
}
```

### Signature

```ts
reportError(
    error: Error | string | { message: string; details?: string },
    options?: { details?: string; source?: string },
): void;
```

- Accepts an `Error`, a plain string, or an object with `message` /
  optional `details`. When given an `Error`, the stack trace becomes the
  default `details`.
- `options.source` is a short identifier (usually your app's `id`) so the
  footer can attribute the entry.
- `options.details` overrides the auto-detected details — use this when
  you want to surface a user-friendly explanation instead of the raw
  stack.

### When to use it

- Any thrown exception in a user-initiated handler (run / save / load).
- Failed network calls that the user should know about.
- Validation failures you can't catch earlier in the form layer.

Extensions must never dispatch to the `ERROR` slice directly — `reportError`
is the only supported entry point so the payload shape stays consistent.

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

- [Architecture Overview](../architecture/overview) — monorepo layout and
  build targets.
- [`host-api/` README](https://github.com/tprouvot/sf-toolkit-web/blob/master/packages/lwc/main/host-api/README.md)
  — the `host-api/*` vs `shared/*` boundary. Read this before adding utility
  modules to either side.
