# Workbench DevBar Submission Draft

This folder is a draft package for adding Workbench to DevBar/AIBar.

The upstream `codeai-emu/AIBar` repository and the referenced
`internal/aqua/tools/falcon-cli/registry.yaml` path were not accessible from this environment. The
`registry.yaml` here follows the public aqua registry shape so it can be adapted quickly once the
real internal schema is available.

## Recommended Submission

- Register the **Workbench Chrome extension** as the initial DevBar tool.
- Keep Workbench Desktop installation as a follow-up once the macOS release/install path is ready.
- Keep Chrome extension auto-install as a follow-up unless DevBar maintainers confirm addon scripts
  can write enterprise Chrome policies.

## Files

- `tool.yaml` - higher-level DevBar metadata draft for the Chrome extension surface.
- `scripts/install-chrome-extension.sh` - opens the Chrome Web Store listing.
- `PR_DESCRIPTION.md` - proposed PR title/body and validation notes.

## Deferred macOS Desktop Submission

Do not include desktop installation in the first DevBar PR. When we revisit it, use these notes:

- Release workflow should publish a stable macOS asset named
  `workbench-desktop-darwin-arm64-latest.zip` or `workbench-desktop-darwin-amd64-latest.zip`.
- The DevBar installer can copy `Workbench Desktop.app` into `/Applications`.
- The packaged app should expose `http://127.0.0.1:47321/version` for health checks.
- Workbench Desktop supports app auto-update on packaged macOS builds.
- The previously tested local DevBar ZIP was created at
  `packages/desktop/out/make/devbar/workbench-desktop-darwin-arm64-latest.zip`.
- The macOS install script should prefer `*-latest.zip` and fall back to versioned Forge ZIPs.

## Validation

Run syntax checks before submitting:

```sh
ruby -e 'require "yaml"; YAML.load_file("devbar/workbench/tool.yaml")'
bash -n devbar/workbench/scripts/install-chrome-extension.sh
```

## Maintainer Questions

- Does the internal DevBar schema accept higher-level `tool.yaml` metadata, or only aqua
  `registry.yaml`?
- Should the Chrome extension addon stay Web Store-only, or can it use Chrome enterprise policy?
- Should Workbench Desktop macOS support be submitted later as a separate follow-up PR?
