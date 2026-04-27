---
title: Architecture Overview
---

# Architecture Overview

Workbench is a monorepo that builds the same core product across two deployment surfaces: a **browser extension** and an **Electron desktop app**. All surfaces share a common LWC frontend and TypeScript library.

## Monorepo layout

```
workbench/
├── apps/
│   ├── docs/          ← Docusaurus documentation site
│   └── ui/            ← Welcome / marketing site (Vite + React)
├── packages/
│   ├── lwc/
│   │   ├── main/         ← Host shell: chrome, routing, store, host-api, agent runtime
│   │   ├── applications/ ← Pluggable feature apps (SOQL, metadata, utilities, …)
│   │   ├── extension/    ← Chrome-extension-specific LWC surfaces (overlay, panels)
│   │   └── shared/       ← Cross-target pure utilities (shared/* modules)
│   ├── vscode/        ← Embedded VS Code workbench runtime (iframe, React + Monaco)
│   ├── server/        ← Express + LWR Node server
│   ├── extension/     ← Chrome/browser extension entry + manifest template
│   ├── desktop/       ← Electron desktop wrapper
│   └── workers/       ← Web workers (metadata, AI, access analyzer)
└── tools/
    ├── build/         ← Rollup configs (extension, workers)
    ├── scripts/       ← Manifest generators + LWR HMR patch + asset sync
    └── mcp/           ← Local MCP test server + sample config
```

## Core architectural split: host ↔ applications

The frontend is organized as a **core host + pluggable applications** model (inspired by VS Code extensions). See [`packages/lwc/main/host-api/README.md`](https://github.com/tprouvot/sf-toolkit-web/blob/master/packages/lwc/main/host-api/README.md) for the authoritative boundary contract.

- **Host** (`packages/lwc/main/`): shell/chrome, routing, Redux store, connector, design system, agent runtime, `host-api/`.
- **Applications** (`packages/lwc/applications/<name>/`): self-contained launchable features — both full-screen tools (SOQL, Metadata, API Explorer) and utilities (URL Encoder, Text Compare, Smart Input). Each ships a single `<name>.manifest.json` and registers through the aggregated application registry.
- **`host-api/`** is the stable import contract applications consume — e.g. `host-api/store`, `host-api/commands`, `host-api/element`, `host-api/connector`. Applications must **not** reach into `core/*` directly.
- **`shared/*`** (`packages/lwc/shared/modules/`) holds pure, reusable utilities consumed across host, apps, and the VS Code workbench.

For how to add a new application, see [Adding a New Application](../developer/new-application).

## Core packages

### `packages/lwc/main` — Host shell

The LWC OSS host, built with [Lightning Web Components (open source)](https://lwc.dev/), LWR, and Rollup. Key areas:

- **`application/`** — application registry aggregator (generated) and shell wiring.
- **`agent/`** — AI agent UI: streaming chat, tool calls, reasoning, audio recording.
- **`editor/`** — Monaco-based code editor, diff editor, file tree, SOQL editor.
- **`core/`** — Salesforce connector session, IndexedDB file system, Redux store, i18n, worker bridge.
- **`host-api/`** — the stable contract exposed to applications.
- **`vscode/`** — the LWC component that owns the VS Code iframe and all bridge hosts.

### `packages/lwc/applications` — Pluggable applications

Each subfolder is a self-contained app described by a `<name>.manifest.json`. The generator (`tools/scripts/generate_application_manifest.js`) aggregates every manifest into `main/application/applicationRegistry/applicationRegistry.ts` — the core host reads only that generated file.

### `packages/lwc/shared/modules` — Cross-target utilities

Pure TypeScript modules imported as `shared/<name>` across host, apps, and the VS Code workbench. Includes `utils`, `logger`, `analytics`, `llm`, `cacheManager`, `loader`, `markdown`, `middleware`, `metadataApi`, `toolingApi`, `salesforceUrl`, `sf`, `sourceTracking`, `store`, `types`.

The same LWC codebase compiles to all surfaces. The Rollup build reads `BUNDLE_TARGET` to include or exclude surface-specific modules.

### `packages/vscode` — Embedded VS Code workbench

A standalone TypeScript project that runs **inside a sandboxed `<iframe>`**. It loads the VS Code web workbench along with custom Salesforce extensions and connects back to the parent LWC app via typed bridges.

Key areas under `src/workbench/`:

| Folder | Purpose |
|---|---|
| `bridge/` | Bridge runtime adapters that wire incoming RPC calls to VS Code internal APIs |
| `extensions/` | Salesforce VS Code extension activations (Apex, SOQL, LWC, AI, org browser, metadata) |
| `workspace/` | Workspace bootstrap and virtual file seeding |
| `connection/` | Salesforce connection management inside the workbench |

### `packages/server` — Express + LWR server

Serves the LWC SPA via LWR and exposes backend API routes:

- LLM proxy (routes AI inference to OpenAI, Anthropic, Google, xAI based on config)
- General Salesforce API proxy
- Documentation search

## Iframe + bridge architecture

The VS Code workbench runs in a sandboxed `<iframe>` served at its own origin. The parent LWC app communicates with it through three independent **`MessageChannel`-based bridges**, each with a typed contract file.

```
LWC fullApp (parent window)
  ├── IframeFsBridgeHost   ──── MessagePort ────▶  VS Code workbench (iframe)
  │     ↕ IndexedDB FS                                FileSystemProvider
  ├── IframeJsforceBridgeHost ─ MessagePort ────▶  JsforceBridgeRuntime
  │     ↕ jsforce session                              (SOQL, Apex, Metadata)
  └── IframeAiBridgeHost   ──── MessagePort ────▶  AiBridgeRuntime
        ↕ LLM provider SDK                             (streaming AI chat)
```

### Handshake protocol

All bridges use the same port-handshake flow:

1. The iframe detects bridge enablement via URL query params (`?fsBridge=1&jsforceBridge=1&aiBridge=1`).
2. The iframe sends `HELLO` messages to `window.parent` on a 450 ms retry until a timeout.
3. The parent creates a `MessageChannel` and transfers one `MessagePort` to the iframe.
4. The iframe starts the port, sends `READY`, and all subsequent communication uses the dedicated `MessagePort`.

### The three bridges

| Bridge | What it exposes to VS Code |
|---|---|
| **FS Bridge** | The IndexedDB virtual file system — VS Code registers a `FileSystemProvider` backed by IndexedDB via the bridge. All `stat`, `readdir`, `readFile`, `writeFile`, `mkdir`, `rm`, `mv` calls traverse the bridge. |
| **Jsforce Bridge** | The active Salesforce session — VS Code calls `soql.execute`, `apex.executeAnonymous`, `metadata.list`, `metadata.retrieve`, and similar methods without managing its own auth. |
| **AI Bridge** | The configured LLM provider — VS Code streams AI responses (text, reasoning, tool calls) back through the bridge without direct access to API keys. |

Each bridge has a matching `*Contract.ts` file that defines all message types, method names, and data shapes as TypeScript `const` assertions, giving compile-time safety across the iframe boundary.

## State management

The LWC frontend uses **Redux Toolkit** (`@reduxjs/toolkit`) for global state. The host store lives in `packages/lwc/main/core/store/` and is exposed to applications via `host-api/store`, which re-exports `store`, `injectReducer`, `removeReducer`, `connectStore`, and `reportError`.

Applications attach their own slices at runtime with `injectReducer(key, reducer)` rather than registering statically on the root store — this keeps the host agnostic of which applications exist. LWC components access the store through the `ToolkitElement` base class (`host-api/element`) and the `connectStore` helper.

## Build and deployment targets

| Target | Entry | Key build config |
|---|---|---|
| Browser extension | `packages/extension` | `tools/build/rollup.extension.mjs` |
| Electron desktop | `packages/desktop` | `packages/desktop/forge.config.cjs` (Electron Forge) |
| Web app / server | `packages/server` + LWR | `lwr.config.json` |
| Web workers | `packages/workers/src` | `tools/build/rollup.workers.mjs` |

All targets consume the same LWC sources under `packages/lwc/`. The extension build reads `BUNDLE_TARGET=main|sandbox|all` to control which entry sets are emitted.

## Related docs

- [Adding a New Application](../developer/new-application)
- [VS Code workflows](../vscode/overview)
- [IndexedDB virtual file system](../storage/indexeddb-workspace)
- [AI Agent tools](../ai-agent/tools-overview)
