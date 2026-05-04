---
name: new-workbench-app
description: Scaffold a new manifest-driven Workbench application under `packages/lwc/applications/<id>/`. Use when the user asks to create, add, or scaffold a new app, tool, utility, or extension in the Workbench monorepo — e.g. "add a new application", "create a workbench app called X", "scaffold a utility under applications", "new SOQL-style tool". Walks the user through the manifest schema, `host-api/*` bootstrap pattern, tsconfig/rollup wiring, and `generate_application_manifest.js` validation so the first build passes.
---

# New Workbench Application

Workbench apps are discovered at build time from a declarative `<id>.manifest.json`. The host never imports an app directly — it reads the generated registry produced by `tools/scripts/generate_application_manifest.js`. Apps talk to the host only through `host-api/*` (stable contract) and `shared/*` (pure utilities).

Canonical reference: `apps/docs/docs/developer/new-application.md` — read it for depth. Validator source of truth: `tools/scripts/generate_application_manifest.js`.

## Step 1 — Ask the user (before writing anything)

Collect the answers below in a **single `AskUserQuestion` call** (or a tight sequence if the capability answers depend on the core ones). Don't guess — every field is validated and a typo in `type`/`menuGroup`/icon silently drops the app from the UI.

**Core manifest fields:**

| Field | Format / enum | Notes |
| --- | --- | --- |
| `id` | lowercase camelCase, `^[a-z][a-zA-Z0-9]*$` | Must equal the folder name. Also used as Redux slice key. |
| `label` | string | Display name in menu + tab bar |
| `shortName` | string | Abbreviated label for narrow tabs |
| `description` | string | One sentence, surfaces in Quick Actions |
| `path` | lowercase + hyphens, `^[a-z][a-z0-9-]*$` | URL key for `?applicationName=<path>`. Must be globally unique. |
| `type` | `developer` \| `admin` \| `data` \| `utility` | Drives Quick Action filter + the menu section (utilities cluster under *Utilities*) |
| `menuGroup` | `data` \| `code` \| `admin` \| `deploy` \| `utilities` | **The validator accepts exactly these five.** The docs mention `explorers` — that's stale; don't use it. |
| `menuOrder` | integer ≥ 0 | Scan sibling manifests in the same `menuGroup` before picking so you don't collide |
| `quickActionIcon` | `<ns>:<name>` where ns ∈ `standard,utility,custom,action,doctype` | SLDS icon |

**Capability flags to confirm** (each is a yes/no that changes what files you scaffold):

- Redux slice? → adds `slices/slices.ts` + `slices/<id>.ts` and an `injectReducer` call.
- User settings panel? → adds `appSettings/appSettings.{ts,html}` and `settingsComponent: "<id>/appSettings"` in the manifest.
- Slash command? → adds `slashCommands` array in manifest + a `registerCommand('<id>.<verb>', …)` in `app.ts`.
- `isOfflineAvailable`? (default false — SOQL and most data apps need a connection)
- `isElectronOnly` or `isChromeOnly`? (default both false — most apps run everywhere)

## Step 2 — Scaffold from the minimal template

Always start from `urlencoder`, not `soql`. Urlencoder is the deliberate minimal reference and is exercised by every CI build.

```bash
cp -r packages/lwc/applications/urlencoder packages/lwc/applications/<id>
mv packages/lwc/applications/<id>/urlencoder.manifest.json \
   packages/lwc/applications/<id>/<id>.manifest.json
```

Then:

1. Fill in the manifest using the collected answers. A skeleton with placeholders lives at `.claude/skills/new-workbench-app/manifest-template.json` — use it when copying urlencoder isn't convenient.
2. Rewrite `app/app.ts`, `app/app.html`, `app/app.css` for the new feature. Keep the `ToolkitElement` base class and the module-scope bootstrap pattern (see below).
3. **Only if Redux requested:** create `slices/slices.ts` (barrel: `export * as <ID> from './<id>';`) and `slices/<id>.ts` with a `createSlice` that exports `reducer`. Call `injectReducer('<id>', reducer)` in the bootstrap.
4. **Only if settings requested:** create `appSettings/appSettings.{ts,html}` extending `AppSettingsElement` from `host-api/settingsElement`, and add `"settingsComponent": "<id>/appSettings"` to the manifest.
5. **Only if slash command requested:** add a `slashCommands` array to the manifest; each `commandId` **must** start with `<id>.` and the matching `registerCommand('<id>.<verb>', handler)` must exist in `app.ts`.

### Bootstrap pattern (copy this shape exactly)

```ts
import ToolkitElement from 'host-api/element';
import { store, injectReducer, connectStore } from 'host-api/store';
import { registerCommand } from 'host-api/commands';

let _bootstrapped = false;
function bootstrap() {
    if (_bootstrapped) return;
    _bootstrapped = true;
    // injectReducer('<id>', <reducer>);      // only if Redux
    // registerCommand('<id>.<verb>', fn);    // only if slash command / agent tool
}
bootstrap();

export default class App extends ToolkitElement {
    connectedCallback() {
        connectStore(store, this._storeChange.bind(this), this);
    }
    _storeChange(_state: unknown) {}
}
```

Module-scope bootstrap (not inside `connectedCallback`) ensures reducers and commands are wired before any dispatch or cross-app `invokeCommand` can fire on first mount.

## Step 3 — Wire tsconfig + (optionally) rollup

Add to `packages/lwc/main/tsconfig.json` under `paths`:

```json
"<id>/*": ["../applications/<id>/*"],
"<id>/app": ["../applications/<id>/app/app"]
```

If the app has slices, also add:

```json
"<id>/slices": ["../applications/<id>/slices/slices"],
"<id>/slices/<id>": ["../applications/<id>/slices/<id>"]
```

Then open `tools/build/rollup.extension.mjs` and search for `soql/slices` — register your slice paths in **both** module arrays that reference it. Rollup auto-discovers app folders, but slice specifiers are explicit.

Apps without slices don't touch rollup.

## Step 4 — Generate the registry and build

```bash
node tools/scripts/generate_application_manifest.js
```

Must succeed and log `N+1` apps. Any error message tells you exactly which field/pattern failed — read it and fix the manifest, don't guess.

Then build (dev, not prod — prod points at the hosted site):

```bash
npm run build:extension:main
```

## Step 5 — Verify

1. App appears in the menu under the expected `menuGroup` at position `menuOrder`.
2. `?applicationName=<path>` opens the tab.
3. If Redux: browser devtools → Redux shows your slice key in the state tree after mount.
4. If slash command: `/<command>` appears in the agent publisher autocomplete.
5. If settings: Settings → Applications shows your tab.

## Validator gotchas (the ten most common rejections)

1. `id` must equal the parent folder name exactly (`generate_application_manifest.js:283`).
2. `name` must be `<id>/app` — not `<id>`, not `<id>/main`.
3. `path` is lowercase + hyphens only. No underscores, no uppercase.
4. `type` and `menuGroup` enums — typos silently drop the app from the menu/filter with no runtime warning.
5. Icons must match `^(standard|utility|custom|action|doctype):[a-z0-9_]+$`. `util:foo` is a common typo.
6. `commandId` inside `slashCommands` **must** start with `<id>.` (own-your-namespace).
7. `settingsComponent` must be exactly `<id>/appSettings` and the folder must exist with `appSettings.ts` or `.js`.
8. `flags` object: all six of `isFullHeight`, `isDeletable`, `isElectronOnly`, `isOfflineAvailable`, `isMenuVisible`, `isTabVisible` must be booleans. The only optional extra flag is `isChromeOnly`.
9. No unknown top-level fields — only `id, name, label, shortName, description, path, quickActionIcon, menuIcon, type, menuGroup, menuOrder, flags, reducerKey, settingsComponent, slashCommands` are allowed.
10. `id`, `name`, `path`, and every slash `command` must be globally unique across all apps.

## Pointers

- **Canonical doc:** `apps/docs/docs/developer/new-application.md` — full walkthrough with manifest reference, builder UI shell, `reportError`, and settings component details.
- **Validator source of truth:** `tools/scripts/generate_application_manifest.js` — when in doubt, read this.
- **Simple reference app:** `packages/lwc/applications/urlencoder/` — the minimal template.
- **Full-featured reference app:** `packages/lwc/applications/soql/` — Redux slices, slash commands, sub-components.
- **Settings example:** `packages/lwc/applications/api/appSettings/`.
- **Host-API contract:** `packages/lwc/main/host-api/README.md` — what apps can import vs. `shared/*`.

## Response style while applying this skill

- Collect all required inputs up front — one `AskUserQuestion` round-trip, not five.
- Prefer editing to writing new files where possible (copy urlencoder, then edit).
- Never skip the generator step — a green build without running the generator means the registry is stale.
- Use `npm run build:extension:main` (dev) for verification, **not** `build:prod:extension`.
