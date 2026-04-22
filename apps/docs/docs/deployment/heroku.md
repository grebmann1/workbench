---
title: Heroku Deployment
---

# Heroku Deployment

Workbench is deployed to Heroku using the **Container Registry** (Docker-based) strategy. The same Docker image that runs locally is pushed directly to Heroku — no separate buildpack is involved.

## How it works

```
Internet → Heroku TLS termination → $PORT → nginx (vhost router)
                                                ├── sf-workbench.com      → dist/ui   (Vite SPA)
                                                ├── api.sf-workbench.com  → Express API (port 3000 internal)
                                                ├── vscode.sf-workbench.com → packages/vscode/dist
                                                └── doc.sf-workbench.com  → dist/docs (Docusaurus)
```

- **nginx** listens on Heroku's dynamic `$PORT` and routes by subdomain (`server_name`).
- **Express** runs internally on port 3000 and is proxied by nginx — never exposed directly.
- **supervisord** manages both processes as PID 1 inside the container.
- The nginx config template is rendered at container start using `envsubst` so `$PORT` is injected at runtime.

## Prerequisites

- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed and logged in
- [Docker](https://docs.docker.com/get-docker/) installed and running
- All pre-built artifacts produced by `npm run docker:prebuild`

## First-time setup

### 1. Login and create the app

```bash
heroku login
heroku create workbench2
heroku stack:set container -a workbench2
```

### 2. Set required config vars

```bash
heroku config:set -a workbench2 \
  NODE_ENV=production \
  CLIENT_ID=<salesforce_connected_app_client_id> \
  CLIENT_SECRET=<salesforce_connected_app_client_secret>
```

Optional vars (set the ones your deployment uses):

```bash
heroku config:set -a workbench2 \
  CHROME_ID=konbmllgicfccombdckckakhnmejjoei \
  GOOGLE_CLIENT_ID_WEB=<google_oauth_client_id> \
  GOOGLE_CLIENT_SECRET_WEB=<google_oauth_client_secret> \
  GOOGLE_SESSION_SECRET=<random_secret_string> \
  SALESFORCE_KEY=<primary_llm_api_key> \
  SALESFORCE_KEY1=<llm_pool_key_1> \
  SALESFORCE_KEY2=<llm_pool_key_2> \
  SALESFORCE_KEY3=<llm_pool_key_3> \
  SALESFORCE_KEY4=<llm_pool_key_4> \
  SALESFORCE_KEY5=<llm_pool_key_5> \
  VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX \
  AI_RATE_LIMIT_DAILY=100 \
  DOC_VERSION=260.0
```

### 3. Add custom domains

```bash
heroku domains:add sf-workbench.com -a workbench2
heroku domains:add api.sf-workbench.com -a workbench2
heroku domains:add vscode.sf-workbench.com -a workbench2
heroku domains:add doc.sf-workbench.com -a workbench2
```

Then retrieve the DNS targets and configure your DNS provider:

```bash
heroku domains -a workbench2
```

Point a CNAME record for each subdomain to the corresponding Heroku DNS target printed by that command.

## Deploying

Every deployment follows the same three steps:

```bash
# 1. Build all pre-built artifacts (UI, docs, vscode, server TypeScript)
npm run docker:prebuild

# 2. Build and push the Docker image to Heroku Container Registry
heroku container:push web -a workbench2

# 3. Release the new image
heroku container:release web -a workbench2
```

## Config vars reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Runtime environment |
| `CLIENT_ID` | Yes | — | Salesforce Connected App OAuth2 client ID |
| `CLIENT_SECRET` | Yes | — | Salesforce Connected App OAuth2 client secret |
| `CHROME_ID` | No | `konbmllgicfccombdckckakhnmejjoei` | Chrome extension ID for OAuth callback redirect |
| `GOOGLE_CLIENT_ID_WEB` | No | — | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET_WEB` | No | — | Google OAuth 2.0 client secret |
| `GOOGLE_SESSION_SECRET` | No | — | Secret for signing Google OAuth session cookie |
| `SALESFORCE_KEY` | No | — | Primary LLM / OpenAI API key |
| `SALESFORCE_KEY1–5` | No | — | LLM API key pool (slots 1–5) |
| `VITE_GA_MEASUREMENT_ID` | No | — | Google Analytics 4 measurement ID (`G-XXXXXXXXXX`). Enables GA on docs and UI. Omit to disable. |
| `AI_RATE_LIMIT_DAILY` | No | `100` | Max AI requests per user per day |
| `DOC_VERSION` | No | `260.0` | Salesforce API doc version loaded at startup |

## Environment variables: two tiers

Workbench has **two completely separate categories** of environment variables. Understanding the difference is critical — changing the wrong one in the wrong place has no effect.

### Tier 1 — Runtime server variables (Heroku config vars)

These are read by the **Express server** (`packages/server`) at process start via `process.env`. Changing them in Heroku and restarting the dyno is enough — no rebuild required.

```bash
heroku config:set MY_VAR=value -a workbench2
heroku ps:restart -a workbench2   # apply immediately
```

All the variables listed in the [Config vars reference](#config-vars-reference) table above fall into this tier.

### Tier 2 — Build-time frontend variables (`VITE_*`)

These are read by **Vite** at build time and compiled as string literals into `dist/ui/`. By the time the Docker image runs on Heroku, they are already baked in — **Heroku config vars cannot reach them**.

The current `VITE_*` variables live in `apps/ui/.env.prod`:

| Variable | Description |
|---|---|
| `VITE_EXTENSION_ID` | Chrome extension ID used to build the redirect URL |
| `VITE_CHROME_STORE_URL` | Link to the extension on the Chrome Web Store |
| `VITE_DOCS_URL` | Base URL for the documentation site |
| `VITE_GITHUB_URL` | GitHub repository URL |

To change any `VITE_*` value in production:

1. Edit `apps/ui/.env.prod`
2. Rebuild and redeploy:

```bash
npm run docker:prebuild
heroku container:push web -a workbench2
heroku container:release web -a workbench2
```

> **Never put secrets in `VITE_*` variables.** They are compiled into the public JavaScript bundle and visible to anyone who inspects the page source.

---

### Quick reference

| I want to change… | Where to set it | Requires redeploy? |
|---|---|---|
| API keys, OAuth secrets, rate limits | `heroku config:set` | No — restart dyno only |
| Chrome extension ID, store URL | `apps/ui/.env.prod` | **Yes** |
| Docs URL, GitHub URL | `apps/ui/.env.prod` | **Yes** |

---

## Monitoring

```bash
# Live logs
heroku logs --tail -a workbench2

# Process status
heroku ps -a workbench2

# Open the app
heroku open -a workbench2
```

## Notes

- **`.env` files are not used on Heroku.** Environment variables must be set via `heroku config:set`. The server's `dotenv.config()` call fails silently when the file is absent, and Heroku's injected env vars take effect automatically.
- **`PORT` is injected by Heroku** at runtime and consumed only by nginx. Express always runs on internal port 3000.
- **COEP / COOP headers** are explicitly set on all nginx location blocks for the vscode subdomain so that `SharedArrayBuffer` works correctly in the Monaco language server.
- **Proxy timeouts** for the Express backend are set to 300 s to accommodate LLM streaming calls.
