# Desktop Package

`packages/desktop` contains the Electron desktop host for this repo.

## Current Scope

The desktop package now provides:

- a package-local Electron runtime
- a secure `main` + `preload` foundation
- a typed launch-intent model for opening/focusing the app
- a small CLI wrapper to launch the desktop shell
- development and packaged mode through a local HTTP renderer server on `127.0.0.1:47321`
- renderer delivery from the built `dist/extension` bundle
- a home window on `/views/app.html` plus per-org instance windows on `/views/direct.html`
- desktop-backed org storage, code workspace flows, and PMD installation
- a localhost automation API on port `12346` by default for external tooling
- branded desktop icons, a native application menu, and file-backed main-process logs
- cross-platform Forge makers for macOS, Windows, and Linux release artifacts
- OS-backed encrypted storage for imported desktop org refresh tokens

## Parity Decisions

### Keep

- Desktop CLI launch from `packages/desktop/src/cli/desktopCli.ts`
- Org connection storage and alias management
- Per-org desktop windows via `/views/direct.html?alias=...`
- External automation endpoints for opening org windows and forwarding SOQL/API/Apex/navigation requests
- Code workspace selection, retrieve, export, and analyzer flows

### Modernize

- Renderer delivery now packages and serves `dist/extension` instead of relying on a webpack renderer bundle or a custom `app://` protocol
- Legacy callback IPC is reduced to a small typed main-process request/response bus
- PMD setup is project-local and template-backed instead of assuming a preinstalled legacy app layout
- Electron menu/automation wiring is now owned by the desktop host instead of the old global singleton modules
- Salesforce CLI org reuse prefers `sf`, falls back to `sfdx`, and requests verbose org details so CLI-authenticated OAuth orgs provide `sfdxAuthUrl`

### Drop

- The old dedicated localhost callback manager internals
- Webpack-specific Electron renderer packaging from the legacy desktop app
- Legacy no-op bridge pieces that only existed to support the previous app shell boot model

## Commands

From the repo root:

```sh
npm run build:desktop
npm run start:dev:desktop
npm run start:dev:desktop:all
npm run desktop:open
npm run package:desktop
npm run make:desktop
```

From this package:

```sh
npm run build
npm run build:renderer
npm run build:icons
npm run test
npm run start:dev
npm run package
npm run make
npm run publish
node dist/cli/desktopCli.js --org my-alias
```

See [../../docs/desktop-cli.md](../../docs/desktop-cli.md) for the full command surface.

## Notes

- `start:dev` builds the desktop host and waits for `../../dist/extension/views/app.html`.
- `DesktopRendererServer` serves `dist/extension` from `http://127.0.0.1:47321` by default. Override with `DESKTOP_RENDERER_PORT` when needed.
- A root-level `npm install` now bootstraps `packages/desktop` as part of the repo postinstall flow.
- `package` and `make` regenerate icons, build the production extension bundle, then package the desktop app.
- `build:renderer` builds worker bundles before building the renderer so packaged desktop apps do not ship stale worker assets.
- Packaged desktop builds include `dist/extension` and `packages/desktop/resources` as Forge extra resources.
- GitHub publishing and macOS signing/notarization are env-driven through Forge config.
- Linux makers require `fakeroot` and `rpm` on CI/build hosts.
- Windows signing is expected to be added through the release workflow secrets before broad distribution.
- Packaged macOS and Windows builds use `update-electron-app` against `grebmann1/workbench` GitHub Releases by default. Override with `WORKBENCH_DESKTOP_UPDATE_REPO`, `WORKBENCH_DESKTOP_UPDATE_BASE_URL`, or `WORKBENCH_DESKTOP_UPDATE_INTERVAL`.
- Linux builds are installer-managed. Set `WORKBENCH_DESKTOP_LINUX_INSTALLER_URL` or `WORKBENCH_DESKTOP_INSTALLER_URL` to make **Help → Open Installer Update** launch the internal update script or landing page.
- Auto-update releases must use semver Git tags such as `v2.0.2`; the public update service ignores draft, prerelease, and non-semver release tags.
- `start:dev:desktop:all` is the easiest local workflow when the extension bundle is not already being watched.
- Use `npm run desktop:open -- --org my-alias` to open an authenticated CLI org directly. The desktop host loads `/views/direct.html?alias=my-alias`, the renderer asks the main process for `sf org display --verbose`, and the Electron OAuth strategy reuses the CLI refresh token.
- Use `npm run desktop:open -- open soql --target-org my-alias --query "SELECT Id FROM User LIMIT 1"` to open SOQL Explorer directly from the CLI.
- Main-process diagnostics are written to Electron's logs directory as `main.log`. Use **Help → Open Logs Folder** in the desktop menu.

## Release Notes

- Desktop automation binds to loopback only and POST requests require the per-install bearer token created in Electron user data.
- Imported SFDX auth URLs are split before persistence: public org metadata stays in `desktop-store.json`, while token material is encrypted with Electron safe storage.
- PMD installation uses a pinned GitHub release tag by default. Override with `WORKBENCH_PMD_RELEASE_TAG`; set `WORKBENCH_PMD_SHA256` to enforce an archive checksum.
- Auto-update is enabled only for packaged macOS and Windows builds unless `WORKBENCH_DESKTOP_ENABLE_AUTO_UPDATE=true` is set during development.

## Auto-Update Verification

Before sharing an auto-updating build broadly:

1. Publish a tagged release for version `N` with the desktop release workflow.
2. Install the packaged macOS DMG or Windows setup artifact for version `N`.
3. Publish version `N+1` with a semver tag such as `v2.0.3`.
4. Confirm the release includes macOS ZIP artifacts and Windows Squirrel artifacts (`.exe`, `.nupkg`, `RELEASES`).
5. Launch version `N`, wait for the update check, and confirm the update downloads silently.
6. Confirm the restart prompt appears after download and relaunches into version `N+1`.
7. Use **Help → Check for Updates** to verify manual checks log either update availability or no update.
