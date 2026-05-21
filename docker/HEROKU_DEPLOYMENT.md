# Heroku Deployment — Multi-Site Docker Image

This runbook deploys the single Docker image built by `./docker/build.sh` to **one Heroku app** serving four public subdomains:

| Subdomain                  | Served by                        | Backend                         |
| -------------------------- | -------------------------------- | ------------------------------- |
| `sf-workbench.com` / `www` | `nginx` → `dist/ui`              | Vite welcome SPA (static)       |
| `api.sf-workbench.com`     | `nginx` → `127.0.0.1:3000`       | Express API (proxy, OAuth, LLM) |
| `doc.sf-workbench.com`     | `nginx` → `dist/docs`            | Docusaurus (static)             |
| `vscode.sf-workbench.com`  | `nginx` → `packages/vscode/dist` | Monaco / VS Code web IDE        |

All four domains share a single dyno. `nginx` inside the container dispatches by `Host` header — this is what `docker/nginx.conf.template` does on the platform-assigned `$PORT`.

As a convenience, `sf-workbench.com/app` (and any sub-path, e.g. `sf-workbench.com/app/foo?x=1`) is `301`-redirected to `api.sf-workbench.com` — `/app` is stripped, query string is preserved. See the `location ~ ^/app(/.*)?$` block on the `sf-workbench.com` server in `docker/nginx.conf.template`.

---

## 1. Heroku constraints to keep in mind

Heroku routes **one public port per dyno** — the value of the `$PORT` env var it injects at boot. Everything else must be internal.

That means:

- `nginx` is the public front door and **must listen on `$PORT`** (not `80`, not `4000/5000/5173`).
- `packages/server` keeps listening on the internal fixed port `3000` (Express binding, not exposed).
- The internal-only nginx listeners on `4000 / 5000 / 5173` are dev/fallback paths and are **not reachable** from the internet on Heroku. They can stay in the config (harmless) or be removed.
- Heroku's router preserves the `Host` header, so subdomain-based routing in `nginx` works unchanged.

We deploy with the **Heroku Container Registry** via `heroku container:push` — the image is built (in CI or locally) from the existing `Dockerfile` and pushed as a pre-built binary to Heroku. `heroku.yml` and `Procfile` are not used in this flow and are intentionally absent from the repo to avoid confusion (`heroku.yml` only applies when Heroku builds the image server-side; `Procfile` is ignored in container mode).

---

## 2. One-time code / config changes

### 2.1 nginx listens on `$PORT` (already wired)

Heroku assigns `$PORT` at dyno start. The repo is already set up for it — here's how the pieces fit together so you can debug it later:

- **`docker/nginx.conf.template`** — every public listener uses `listen ${PORT};` instead of `listen 80;`. The internal fallback listeners on `4000 / 5000 / 5173` stay at fixed ports (they're unreachable on Heroku, but still useful for direct container-port access in `docker compose`).
- **`Dockerfile`** — installs `gettext` alongside `nginx` and `supervisor` (for the `envsubst` binary), and `COPY`s the template to `/etc/nginx/nginx.conf.template` instead of the final `.conf`.
- **`docker/supervisord.conf`** — the `[program:nginx]` command renders the template first, then execs nginx:
    ```ini
    command=/bin/sh -c "envsubst '$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && exec nginx -g 'daemon off;' -c /etc/nginx/nginx.conf"
    ```
    The allow-list argument `'$PORT'` is important: `envsubst` with no arguments would also try to substitute nginx's own runtime variables (`$uri`, `$host`, `$request_uri`, …) and break the config.
- **`docker-compose.yml`** — sets `PORT=80` via `environment:` on the `app` service, so local `docker compose up` keeps exposing the nginx front door on port 80 regardless of what `.env` says (`.env` has `PORT=3000` for direct-run Express dev, which is the right value there).

### 2.2 No `heroku.yml` — `container:push` flow

We are **not** using `heroku.yml` and **not** using a `Procfile`. Both files were removed from the repo in favour of the explicit `heroku container:push` flow.

`heroku.yml` is only relevant when Heroku builds the Docker image from the git tree on every `git push heroku main`. That path requires a multi-stage Dockerfile that can compile all artefacts from a clean checkout, which is a bigger rewrite than this project needs today (LWR alone is ~2 min and the `dist/` outputs are `.gitignore`d by design — see `.gitignore` lines 17–30). Keeping a stub `heroku.yml` in the repo while the Dockerfile only `COPY`s pre-built artefacts is a footgun: a `git push heroku master` would silently build a broken image.

Instead we build the image (locally or in CI — see §5 and `.github/workflows/deploy.yml`) and push it to Heroku's Container Registry.

If we later move to a multi-stage Dockerfile, the file we'd reintroduce at the repo root would look like:

```yaml
# For future reference — NOT currently in the repo.
build:
    docker:
        web: Dockerfile
run:
    web: supervisord -c /etc/supervisord.conf
```

---

## 3. Heroku app provisioning

Run these once per environment (prod).

```bash
# Login
heroku login
heroku container:login

# Create the app in container stack
heroku create workbench2 --stack container --region us

# Enable ACM (free auto-managed SSL for custom domains)
heroku certs:auto:enable -a workbench2

# Add all four public domains
heroku domains:add sf-workbench.com          -a workbench2
heroku domains:add www.sf-workbench.com      -a workbench2
heroku domains:add api.sf-workbench.com      -a workbench2
heroku domains:add doc.sf-workbench.com      -a workbench2
heroku domains:add vscode.sf-workbench.com   -a workbench2

# Inspect and copy the DNS targets Heroku assigns
heroku domains -a workbench2
```

### 3.1 DNS records (at the registrar)

For each domain above, create a **CNAME** pointing to the Heroku DNS target shown by `heroku domains`. For the apex `sf-workbench.com`, use an **ALIAS / ANAME** (or registrar flattening) if your DNS provider supports it; otherwise put the app behind a provider that does (Cloudflare, DNSimple, Route 53 alias, etc.).

Typical result:

| Record | Host               | Target                            |
| ------ | ------------------ | --------------------------------- |
| ALIAS  | `sf-workbench.com` | `<whatever>.herokudns.com` (apex) |
| CNAME  | `www`              | `<whatever>.herokudns.com`        |
| CNAME  | `api`              | `<whatever>.herokudns.com`        |
| CNAME  | `doc`              | `<whatever>.herokudns.com`        |
| CNAME  | `vscode`           | `<whatever>.herokudns.com`        |

ACM issues certs automatically once DNS resolves.

---

## 4. Config vars (env)

The image reads `.env` at runtime via `dotenv/config`. On Heroku we set config vars instead — do **not** commit `.env.prod`.

Mirror the contents of `.env.prod` into Heroku config vars:

```bash
heroku config:set \
  NODE_ENV=production \
  PORT=3000 \
  WORKBENCH_BASE_URL=https://api.sf-workbench.com \
  REDIRECT_URI=https://www.sf-workbench.com/oauth2/callback \
  CLIENT_ID='...' \
  CLIENT_SECRET='...' \
  CHROME_ID='...' \
  OPENAI_KEY='...' \
  SALESFORCE_KEY='...' \
  SALESFORCE_KEY1='...' \
  OPENAI_GATE_ACCEPT_PLACEHOLDER=false \
  GOOGLE_CLIENT_ID_EXTENSION='...' \
  GOOGLE_CLIENT_ID_WEB='...' \
  GOOGLE_CLIENT_SECRET_WEB='...' \
  AI_RATE_LIMIT_DAILY=100 \
  -a workbench2
```

> Important: `PORT=3000` here is the **internal** Express port used by Supervisor (see `docker/supervisord.conf`). Heroku **overrides** `$PORT` at dyno boot for the dyno process (which is `nginx`), so nginx will correctly listen on Heroku's assigned port. The Express child process is launched by supervisor with `environment=...,PORT="3000"` which takes precedence over the dyno `$PORT` — keep that line in `supervisord.conf`.

Verify:

```bash
heroku config -a workbench2
```

---

## 5. Deployment

### 5.1 GitHub Actions (preferred)

Production deploys run from `.github/workflows/deploy.yml`. The workflow is `workflow_dispatch`-only — start one from **Actions → deploy → Run workflow**.

Required repo secret:

- `HEROKU_API_KEY` — long-lived account token (`heroku auth:token`) or a scoped token from `heroku authorizations:create -d "github actions deploy"`.

The workflow installs deps, runs `npm run docker:prebuild`, stamps the deploying SHA into the `GIT_COMMIT_SHA` config var (so `/healthz` reports it), runs `heroku container:push` + `heroku container:release`, then smoke-tests every public subdomain's `/healthz`. Use this path whenever possible — it gives you an audit trail in Actions and a known-good build environment.

### 5.2 Local fallback

If you have to deploy from a laptop (Heroku outage of GitHub, urgent fix, etc.), the same three commands still work:

```bash
# 1. Build all static/server artefacts into dist/* and packages/*/dist.
#    Required because the Dockerfile only COPYs them — it does not compile.
npm run docker:prebuild

# 2. Build the image from the repo Dockerfile and push it to Heroku's
#    Container Registry. The CLI tags it as registry.heroku.com/workbench2/web.
heroku container:push web -a workbench2

# 3. Promote the pushed image to the active release.
heroku container:release web -a workbench2
```

> `heroku container:push` runs `docker build` against the local `Dockerfile` — it does **not** reuse an image already tagged as `workbench2:latest`. So don't run `docker compose build` before it; the push command builds once on its own.

Tail logs to confirm `nginx` and `server` both come up under supervisor:

```bash
heroku logs --tail -a workbench2
```

You should see:

- `supervisord started with pid 1`
- `INFO spawned: 'server'` listening on `:3000`
- `INFO spawned: 'nginx'` listening on `$PORT`

---

## 6. Smoke tests

```bash
curl -I https://www.sf-workbench.com
curl -I https://www.sf-workbench.com
curl -I https://api.sf-workbench.com
curl -I https://doc.sf-workbench.com
curl -I https://vscode.sf-workbench.com
```

All should return `200` (or `301/302` for SPA redirects). For `vscode.sf-workbench.com`, also verify the COEP/COOP headers:

```bash
curl -I https://vscode.sf-workbench.com | grep -i "cross-origin"
```

Expected:

```
cross-origin-embedder-policy: credentialless
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: cross-origin
```

---

## 7. Rollback

```bash
heroku releases -a workbench2
heroku rollback v<previous> -a workbench2
```

---

## 8. Known follow-ups

- **Multi-stage Dockerfile + `heroku.yml`** to let Heroku build the image from git on each push (instead of us building locally and using `heroku container:push`). Would also remove the need for `docker:prebuild` in CI.
- **Dyno sizing**: the image ships LWR + Docusaurus + Monaco assets and the Express server; start on `standard-1x`, scale up if memory pressure appears under LWR SSR load.
- **Preview / staging app**: duplicate the provisioning section under `workbench2-staging` with different domains (e.g. `staging.sf-workbench.com`) before shipping risky changes. The deploy workflow already accepts an `app` input, so the same workflow can target it.
- **`.env.prod` config sync**: `docker/deploy-heroku.sh` mirrors `.env.prod` into Heroku config vars on every run. Move that to a one-shot, or use `heroku config:set --app-json app.json` (now that `app.json` documents the required vars), so out-of-band Heroku tweaks aren't reverted by every deploy.
- **Image scan / SBOM**: add `npm audit --omit=dev --audit-level=high` and a Trivy step to the deploy workflow before `container:push`.
