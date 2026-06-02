---
name: heroku-pipeline-hardening
overview: "Harden the Heroku container deploy pipeline for sf-workbench.com. Phase 1 (drafted, uncommitted in working tree) adds /healthz, removes the unused heroku.yml/Procfile footgun, and introduces a manual GitHub Actions deploy workflow. Phase 2 covers the higher-effort follow-ups (staging, log drain, image scan, multi-stage Dockerfile, .env.prod sync rework)."
todos:
    - id: phase1-resume-or-discard
      content: Decide whether to resume the uncommitted Phase 1 working tree (healthz + remove heroku.yml/Procfile + deploy.yml) or discard and start fresh
      status: pending
    - id: phase1-add-heroku-api-key-secret
      content: Add HEROKU_API_KEY repo secret in GitHub (Settings → Secrets and variables → Actions). Prefer a scoped token from `heroku authorizations:create -d "github-actions-deploy"` over the personal account token from `heroku auth:token`
      status: pending
    - id: phase1-commit-and-pr
      content: Commit Phase 1 changes on a dedicated branch and open a PR — keep the diff tight (server routes + nginx + workflow + docs + file deletions)
      status: pending
    - id: phase1-first-deploy-dry-run
      content: Run the new deploy.yml workflow once (Actions → deploy → Run workflow). Expect the smoke-test step to potentially fail on the very first invocation if the in-prod image predates /healthz; the release itself will still flip the dyno
      status: pending
    - id: phase2-staging-app
      content: Provision workbench2-staging Heroku app and DNS (e.g. staging.sf-workbench.com). The deploy workflow already takes an `app` input — same workflow, different default
      status: pending
    - id: phase2-log-drain
      content: Add a Heroku log drain to Papertrail / Logtail / Datadog so structured logs leave the dyno before the next outage. One-shot `heroku drains:add` per app
      status: pending
    - id: phase2-env-sync-rework
      content: Rework `docker/deploy-heroku.sh`'s .env.prod → config-var sync. Current behaviour clobbers Heroku config on every run AND strips literal single-quotes from secret values. Either move it to a one-shot script or use a real .env parser
      status: pending
    - id: phase2-image-scan
      content: Add `npm audit --omit=dev --audit-level=high` and Trivy/Snyk image scan to the deploy workflow before container:push
      status: pending
    - id: phase2-multi-stage-dockerfile
      content: Rewrite Dockerfile as multi-stage so the build can happen inside the image (compile in a builder stage, runtime stage copies only dist/* and prod node_modules). Unblocks reintroducing a real heroku.yml and removes the docker:prebuild step from the deploy workflow
      status: pending
    - id: phase2-cdn-static-assets
      content: Put Cloudflare (or Heroku Edge) in front of doc.sf-workbench.com and vscode.sf-workbench.com to offload static bytes from the dyno. Defer until docs/vscode traffic is actually hot
      status: pending
    - id: phase2-clean-internal-listeners
      content: docker/nginx.conf.template ships internal-only listeners on 4000/5000/5173 that are unreachable on Heroku. Either split the template into prod/dev variants or guard with `if ($host = "_") { return 444; }` so a misconfigured router cannot expose them
      status: pending
isProject: false
---

# Plan: Heroku pipeline hardening

## Goal

The current pipeline serves prod fine, but the **deploy path itself** is laptop-dependent, opaque, and full of small footguns. Goal: a reproducible, auditable, CI-driven deploy with platform-visible health, and clear next steps for staging / observability / image hygiene.

## Background

This work was kicked off after auditing `heroku.yml`, `Procfile`, `app.json`, `Dockerfile`, `docker/{nginx.conf.template,supervisord.conf,build.sh,deploy-heroku.sh,HEROKU_DEPLOYMENT.md}`, and `.github/workflows/test.yml` on `feature/agentforce-explorer` (commit context: 2026-05-19). Findings, ranked by ROI:

1. Deploy is laptop-only — no CI deploy, no audit trail of which SHA shipped.
2. `heroku.yml` is committed but unused. The Dockerfile only `COPY`s pre-built `dist/*` (which are git-ignored), so a `git push heroku master` would silently produce a broken image. `HEROKU_DEPLOYMENT.md` itself says the file is "not currently used."
3. No `/healthz` endpoint — Heroku router sees a black-box 503 on failure.
4. `.env.prod → Heroku config sync is fragile (clobbers + strips single-quotes from secret values).
5. No staging app — risky changes go straight to `workbench2`.
6. Single-stage Dockerfile ships full Node 22-alpine + node_modules in the runtime image.
7. No image scan / SBOM, no `npm audit` gate.
8. Static UI/docs/vscode share the dyno with the API server.
9. No auto-scaling, no log drain — no structured logs leaving Heroku.
10. Internal-only nginx listeners (4000/5000/5173) ship to prod despite being unreachable.

The starter pack chosen was **#1 + #2 + #3** ("CI deploy on manual trigger, healthcheck, kill the heroku.yml footgun") to ship a reproducible, traceable deploy with platform-visible health in one PR.

## Phase 1 — drafted in working tree (NOT committed)

The following changes exist in the working tree on branch `feature/agentforce-explorer` as of 2026-05-19 but are **uncommitted**. If resuming: either commit on a dedicated branch and open a PR, or `git stash` and revisit.

### Files modified

- `packages/server/server-prod.ts` — added `/healthz` route returning `{status, uptime, version, commit}`. `commit` reads from `process.env.GIT_COMMIT_SHA`, set by the workflow.
- `packages/server/server-dev.ts` — same route, for local-dev parity.
- `docker/nginx.conf.template` — added `location = /healthz` returning a literal `200 ok\n` on the three nginx-served subdomains (`sf-workbench.com`, `vscode.sf-workbench.com`, `doc.sf-workbench.com`). `api.sf-workbench.com` already proxies to Express, so it inherits the route automatically.
- `docker/HEROKU_DEPLOYMENT.md` — rewrote §2.2 to explain why `heroku.yml` and `Procfile` are intentionally absent; added §5.1 documenting the GitHub Actions workflow as the preferred deploy path; updated §8 follow-ups to remove items now done.

### Files deleted

- `heroku.yml` — was committed but unused. Container:push deploys never read it. The Dockerfile only `COPY`s pre-built artefacts, so a `git push heroku master` would have produced a broken image.
- `Procfile` — also unused in container stack mode.

### Files added

- `.github/workflows/deploy.yml` — manual `workflow_dispatch` workflow with an `app` input (default `workbench2`).
    - Installs workspace deps (`npm ci` at root + `apps/ui` + `apps/docs` + `packages/vscode`).
    - Runs `npm run docker:prebuild` to populate `dist/*` and `packages/*/dist`.
    - Stamps `GIT_COMMIT_SHA` into the Heroku app via `heroku config:set` so `/healthz` reports it.
    - Runs `heroku container:push web` then `heroku container:release web`.
    - Smoke-tests `/healthz` on all four public subdomains.
    - Writes a step summary with app, commit SHA, and the actor that triggered the deploy.
    - Uses `concurrency: deploy-${app}` so two deploys for the same target cannot race.
    - Reads workflow input via `env:` (never inlined as `${{ ... }}` in shell) to neutralise injection risk.

### Validation already done

- `npm run build:server` — passes.
- `npx eslint packages/server/server-prod.ts packages/server/server-dev.ts` — passes.
- `npx prettier --check` on all changed `.ts` and `.yml` files — passes (markdown was reformatted by prettier).
- YAML syntax valid (parses with `python3 -c "import yaml; yaml.safe_load(...)"`).

### Required setup before first run

1. **Add the `HEROKU_API_KEY` repo secret.** GitHub → Settings → Secrets and variables → Actions. Use `heroku authorizations:create -d "github-actions-deploy"` for a scoped token rather than the personal `heroku auth:token`.
2. Confirm `PORT=3000` is still set as a Heroku config var (per `HEROKU_DEPLOYMENT.md` §4) — that's the internal Express port, not the dyno port.
3. The first deploy will likely show `/healthz commit: null` until `GIT_COMMIT_SHA` propagates after the new image releases. The smoke test may fail on the *very first* run if the in-prod image predates `/healthz`. Subsequent runs work normally.

### Resume or discard

| Want to… | Run |
| --- | --- |
| Discard everything | `git restore packages/server docker/ && git checkout -- heroku.yml Procfile && rm .github/workflows/deploy.yml` |
| Keep for later | `git stash push -m "phase1 heroku pipeline" packages/server docker/ heroku.yml Procfile .github/workflows/deploy.yml` |
| Resume | Branch off, commit, push, open PR |

## Phase 2 — open follow-ups (not started)

Listed roughly in order of leverage. Each is independent.

### Staging app

Duplicate the §3 provisioning block in `HEROKU_DEPLOYMENT.md` under `workbench2-staging` with its own subdomain (e.g. `staging.sf-workbench.com`). The deploy workflow already accepts an `app` input — same YAML, different value. Smoke-test step will need a second host list or be parameterised by `app`.

### Log drain

`heroku drains:add 'syslog+tls://...' -a workbench2` against Papertrail / Logtail / Datadog. Runtime logs currently never leave the dyno; first outage will be black-box.

### Rework `.env.prod` config sync

`docker/deploy-heroku.sh` currently:

- Clobbers all Heroku config vars on every run, silently undoing any out-of-band fix.
- Strips single-quote characters via `${value//\'/}`, so any secret containing literal `'` corrupts.

Either:

- Move the sync into a one-shot script you run only when `.env.prod` actually changed, or
- Replace the parser with a real one (`dotenv-cli`, or a small Node script) that handles quoted values correctly.

The new `deploy.yml` deliberately does **not** sync env vars — that responsibility now belongs to a separate, infrequent workflow.

### Image scan / SBOM

In `deploy.yml`, before `container:push`:

```yaml
- run: npm audit --omit=dev --audit-level=high
- uses: aquasecurity/trivy-action@<pinned-sha>
  with:
      image-ref: ${{ env.IMAGE_REF }}
      severity: HIGH,CRITICAL
      exit-code: '1'
```

### Multi-stage Dockerfile

Compile inside the image (builder stage runs `docker:prebuild` equivalents), runtime stage copies only `dist/*`, `packages/*/dist`, and prod `node_modules`. Once that exists, reintroduce `heroku.yml` so a `git push heroku master` would actually work. Removes `docker:prebuild` from the deploy workflow.

### CDN in front of static subdomains

Cloudflare or Heroku Edge for `doc.sf-workbench.com` and `vscode.sf-workbench.com`. Defer until traffic actually hurts the dyno.

### Trim internal-only listeners

`docker/nginx.conf.template` has listeners on 4000/5000/5173 that exist only for `docker compose`. They're unreachable on Heroku, but a misconfigured router could surface them. Either:

- Split the template into `nginx.conf.prod.template` + `nginx.conf.dev.template`, or
- Guard with `if ($host = "_") { return 444; }` to drop wildcard traffic.

## Files referenced

- `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`
- `docker/nginx.conf.template`, `docker/supervisord.conf`
- `docker/build.sh`, `docker/deploy-heroku.sh`, `docker/HEROKU_DEPLOYMENT.md`
- `app.json` (Heroku config-var documentation)
- `package.json` (scripts: `docker:prebuild`, `start:heroku`, `heroku-postbuild`)
- `.github/workflows/test.yml` (existing CI — pattern reference)
- `packages/server/server-prod.ts`, `packages/server/server-dev.ts`
