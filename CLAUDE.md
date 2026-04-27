# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Workbench (sf-toolkit-web) — a Salesforce administration toolkit shipped as a Chrome extension, desktop Electron app, and hosted web app. Provides an overlay panel, a Monaco-based VS Code editor, metadata explorer, SOQL editor, and an AI agent that can control the browser. Node **22.14** is required (see `package.json` engines).

## Common Commands

```sh
# Install (runs LWR HMR patch + installs desktop subpackage)
npm install

# Web app dev / prod
npm run start:dev:web              # via start:dev:server
npm run start:dev:server           # NODE_ENV=development, loads .env.dev
npm run start:prod:server          # NODE_ENV=production, loads .env.prod

# Chrome extension
npm run start:dev:extension        # watch + serve dist/extension
npm run build:prod:extension       # full prod build (main + sandbox + workers)
npm run build:extension:main       # main-only (faster)

# Desktop (Electron) — lives under packages/desktop
npm run start:dev:desktop          # against an already-running web server
npm run start:dev:desktop:all      # watch extension + start desktop together
npm run build:desktop
npm run desktop:open               # launcher CLI

# Shared TS + generated manifests (runs before most builds)
npm run build:shared               # generate_manifest_skill + generate_application_manifest + tsc on packages/lwc/shared

# Workers
npm run watch:workers
npm run build:workers

# Vendor bundles (required once after clone, and after vendor updates)
npm run build:vendor:just-bash     # built into vendor-bundles/just-bash, copied to assets/extension/libs

# Landing site + docs (apps/ui, apps/docs — React + Vite / Docusaurus)
npm run site:dev                   # runs apps/ui + apps/docs in parallel
npm run site:build

# Local MCP test server (for AI → MCP → Config validation)
npm run start:test:mcp             # http://localhost:3999/mcp
npm run test:mcp                   # automated smoke test

# Quality
npm run lint                       # eslint + prettier --check
npm run format                     # prettier --write
npm run test                       # node --test on packages/lwc/main/**/__tests__/*.test.js
npm run validate                   # lint + test + build:all

# Single test file
node --experimental-strip-types --test packages/lwc/main/path/to/__tests__/foo.test.js
```

If HMR misbehaves during `start:dev:web`: `rm -rf __lwr_cache__` and restart. The LWR namespace patch (`tools/scripts/patch_lwr_hmr_namespace.mjs`) is auto-applied by `postinstall`.

## Architecture

### Monorepo layout

```
apps/ui                       Landing/welcome site (React + Vite)
apps/docs                     Docusaurus docs
packages/lwc/main             Host LWC shell + core services + host-api
packages/lwc/applications     Pluggable feature apps (SOQL, metadata, api, object, …)
packages/lwc/extension        Chrome-extension-specific LWC surfaces (overlay, panels, feature)
packages/lwc/shared/modules   Cross-target pure utilities (shared/utils, shared/logger, shared/llm, …)
packages/server               LWR dev/prod server, OAuth, content, layouts, hooks
packages/extension/src        Chrome extension entry points + manifest.template.json
packages/desktop              Electron app
packages/vscode               VS Code webview (Monaco, React — NOT LWC; out of host-api scope)
packages/workers/src          Rollup-built web workers
vendor-bundles/just-bash      Pre-built vendor browser bundles
tools/build                   Rollup configs (extension, workers)
tools/scripts                 Generators + LWR HMR patch + asset sync scripts
tools/mcp                     Local MCP test server + sample config
assets                        Design-system assets, skills manifest, screenshots
```

### Core architectural split: host ↔ apps

The repo is mid-refactor from monolith into a **core host + pluggable apps** model (inspired by VS Code extensions). See `packages/lwc/main/host-api/README.md` for the contract — it is the single most important doc for understanding boundaries.

- **Host** (`packages/lwc/main/*`): shell/chrome, routing, Redux store, connector, design system, agent runtime, `host-api/`.
- **Apps** (`packages/lwc/applications/<name>/`): self-contained launchable features. Each has its own `package.json`, may ship a `<name>.manifest.json`, and registers through the application registry.
- **`host-api/`** = the stable contract apps are allowed to import. Apps must **not** reach into `core/*` directly.
  - Stateful / host-coupled → `host-api/<name>` (e.g. `host-api/store`, `host-api/commands`, `host-api/element`, `host-api/connector`, `host-api/desktopBridge`, `host-api/fs`, `host-api/worker`).
  - Pure, reusable → `packages/lwc/shared/modules/<name>` (imported as `shared/<name>`). If a stable import prefix is wanted for apps, re-export from `host-api/` (as with `host-api/logger`, `host-api/analytics`).
  - **Do not add a third namespace** (`host-helper/`, `host-shared/`).
- Redux state uses **slice injection**: `host-api/store` exposes `store`, `injectReducer`, `removeReducer`, `connectStore`, `reportError`. Apps attach their own slices at runtime rather than registering in the root store.
- Commands: `host-api/commands` (`registerCommand` / `invokeCommand` / `hasCommand`) is the named-command registry used by electron launch intents and agent tools to talk to apps without importing them.

### Adding a new application

See `packages/lwc/main/application/readme.md`. Summary:

1. Create `packages/lwc/main/application/<appFolder>/app/{app.js,app.html}` (or add a package under `packages/lwc/applications/<name>/` for the newer app-package layout).
2. Register in `packages/lwc/main/component/skeleton/registry/registry.ts` by importing the module and adding an `APPLICATION_ENTRIES` entry with `name`, `module`, `path`, `label`, behavior flags (`isFullHeight`, `isDeletable`, `isOfflineAvailable`, `isTabVisible`, `isChromeOnly`/`isElectronOnly`), and menu metadata (`menuGroup`, `menuOrder`).
3. `menuGroup` must be one of those in `APPLICATION_MENU_GROUPS` (`data`, `code`, `explorers`, `deploy`) — add a new group there if needed.
4. `name` must match the shell's module loader key (e.g. `metadata/app`); `path` is the route key (unique).
5. Rebuild with `npm run build:extension:main`.

### Runtime targets

Chrome extension (primary), Electron desktop, and Node server for the web app. The VS Code webview target uses Monaco/React (not LWC) and is **out of scope** for host-api changes — leave `packages/vscode/` untouched for host-api work.

### Build pipeline notes

- `tools/build/rollup.extension.mjs` drives the extension build; `BUNDLE_TARGET=main|sandbox|all` controls which entry sets are emitted (features are not code-split today).
- `tools/build/rollup.workers.mjs` builds `packages/workers/src`.
- `lwr.config.json` controls routes, module resolution, and static assets for the web app.
- `build:shared` runs two generators before `tsc`:
  - `tools/scripts/generate_manifest_skill.js` → builds agent skill manifest from `assets/shared/skills/*.SKILL.md` into `packages/lwc/shared/modules/defaultAgentSkills`.
  - `tools/scripts/generate_application_manifest.js` → aggregates `packages/lwc/applications/*/*.manifest.json`.
- Vendor bundles (`vendor-bundles/just-bash`) must be built before the extension build (this is wired into `build:extension*` and watch scripts) — output is copied into `assets/extension/libs/just-bash/`.

### OAuth / environment

Web targets authenticate against Salesforce via OAuth 2.0 using a Connected App. `.env` requires `CLIENT_ID` + `CLIENT_SECRET`; optional `PORT`, `REDIRECT_URI`, `DOC_VERSION`, `CHROME_ID`, `PROXY_URL`. `.env.dev` and `.env.prod` are selected by `start:dev:server` and `start:prod:server` respectively.

## Conventions (from `.cursor/rules/*`)

- **Module entrypoints**: prefer named entry files (`llm.ts`, `cacheManager.ts`) over `index.ts`/`index.js` barrels. Follow the existing named-entry convention in the area.
- **Constants**: colocate non-trivial module constants in `constants.js` / `constants.ts`. Extend existing neighbor `constants.*` rather than creating a second one.
- **Test placement**: colocate tests in `__test__/` (note singular) or `__tests__/` when the area already uses that. Prefer `feature/__test__/feature.test.ts` over `feature/feature.test.ts`. Don't introduce a second convention inside one area.
- **Types**: don't widen with `any` / large casts; run the closest real typecheck (`tsc -p <pkg>/tsconfig.json` or `npm --prefix apps/ui run typecheck`) — a green lint or bundle does not equal type verification.
- **Validation discipline**: run the smallest relevant command for the files you touched (`npm run lint`, `npm run build:shared`, `npm run build:server`, `npm --prefix apps/ui run typecheck`, `npm --prefix apps/docs run typecheck`) instead of defaulting to `npm run validate`. Lint, typecheck, and bundling are different signals — don't conflate them.
- **Scope**: reuse existing utilities/components/constants; match local patterns; keep diffs tightly scoped and avoid opportunistic refactors.
