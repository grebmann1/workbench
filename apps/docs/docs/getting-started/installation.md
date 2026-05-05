---
title: Installation
---

# Installation

Workbench is available as a **Chrome extension** (recommended for browser-first use) and a **desktop app** for users who want local CLI/org reuse, code workspace flows, and desktop automation.

---

## Option 1 — Chrome Extension (recommended)

1. Open the [Chrome Web Store listing](https://chromewebstore.google.com/detail/salesforce-toolkit/konbmllgicfccombdckckakhnmejjoei?hl=en).
2. Click **Add to Chrome**.
3. Navigate to any Salesforce org — the Workbench overlay appears automatically.

No configuration required. OAuth happens through your active browser session.

---

## Option 2 — Self-hosted / Developer setup

Use this path if you want to run Workbench locally, contribute to the codebase, or host your own instance.

### Prerequisites

- Node.js `22.14` (required by the repo engine)
- npm (installed with Node.js)
- Salesforce connected app credentials (`CLIENT_ID`, `CLIENT_SECRET`)

```bash
node -v   # should be v22.14.x
npm -v
```

### Clone and install

```bash
git clone https://github.com/grebmann1/workbench.git
cd sfdx-ui-light
npm install
```

### Configure environment variables

Copy `.env.dev` or create a `.env` file at the project root:

```bash
CLIENT_SECRET='YOUR_CLIENT_SECRET'
CLIENT_ID='YOUR_CLIENT_ID'
PORT=3000
```

| Variable        | Required | Purpose                                   |
| --------------- | -------- | ----------------------------------------- |
| `CLIENT_ID`     | Yes      | Salesforce connected app consumer key.    |
| `CLIENT_SECRET` | Yes      | Salesforce connected app consumer secret. |
| `PORT`          | No       | Server port. Defaults to `3000`.          |
| `REDIRECT_URI`  | No       | Overrides the OAuth callback URL.         |
| `PROXY_URL`     | No       | Routes requests through a proxy endpoint. |

### Start local services

**Server + shared watcher only** (LWR app on port `3000`):

```bash
npm run start:dev:web
```

**Server + UI welcome page** (server on `3000`, Vite UI on `27100`):

```bash
npm run start:dev:ui
```

**Full site dev** (server on `3000`, Vite UI on `27100`, Docusaurus docs on `3001`):

```bash
npm run site:dev
```

### Local dev endpoints

| Surface                | Dev URL                      | Notes                      |
| ---------------------- | ---------------------------- | -------------------------- |
| Welcome / landing page | `http://localhost:27100`     | Vite dev server            |
| Main app               | `http://localhost:27100/app` | Proxied from Vite → server |
| Server directly        | `http://localhost:3000`      | Express server             |
| Docs                   | `http://localhost:3001`      | Docusaurus dev server      |

### Production-like run

To verify the full production build locally:

```bash
npm run start:prod:web
```

In production mode, everything is served from a single origin:

| Surface | URL                             |
| ------- | ------------------------------- |
| Welcome | `http://localhost:3000/welcome` |
| App     | `http://localhost:3000/app`     |
| Docs    | `http://localhost:3000/docs`    |

---

## Option 3 — Desktop App

Use the desktop app when you want Workbench outside Chrome, want to reuse Salesforce CLI-authenticated orgs, or need desktop-only code workspace features.

### Desktop prerequisites

- Salesforce CLI (`sf` preferred, `sfdx` supported) for CLI-backed org login.
- Java for PMD-based Apex analysis.
- Visual Studio Code or the `code` command for opening retrieved workspaces.
- Network access to Salesforce APIs and GitHub release assets when installing PMD from the desktop flow.

### Install from a release artifact

1. Download the desktop artifact for your OS from the project release page.
2. macOS: open the DMG or ZIP, move **Workbench Desktop** to Applications, then open it.
3. Windows: run the setup executable.
4. Linux: install the DEB/RPM package, or use the ZIP artifact if you prefer a portable build.
5. Open **Help → Open Logs Folder** if startup fails and include `main.log` when reporting issues.

### Updates

Until automatic update checks are enabled, install new desktop versions from the latest release artifact. The app version is exposed from the local renderer `/version` endpoint and in the desktop app metadata.

### Desktop org access

The desktop app can open Salesforce CLI aliases directly:

```bash
workbench-desktop open org --target-org my-alias
```

It can also import an SFDX auth URL from a file or stdin. Do not paste `sfdxAuthUrl` values directly into shell history.

```bash
workbench-desktop open org --alias imported-org --sfdx-url-file ./org.sfdx-url
printf '%s' "$SFDX_AUTH_URL" | workbench-desktop open org --alias imported-org --sfdx-url-stdin
```

### Desktop local security

Workbench Desktop serves its renderer and automation API on loopback only. CLI automation calls require a per-install bearer token stored in the desktop user-data directory. Imported refresh-token material is encrypted with Electron safe storage before being written to local app storage.

## After installation

- Follow [Quickstart](./quickstart) to verify your setup and run first flows.
- If something breaks, check [Troubleshooting](../troubleshooting/common-issues).
- To contribute, see [How to contribute](../contributing/how-to-contribute).
