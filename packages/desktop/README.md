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
node dist/cli/desktopCli.js --org my-alias
```

See [../../docs/desktop-cli.md](../../docs/desktop-cli.md) for the full command surface.

## Notes

- `start:dev` builds the desktop host and waits for `../../dist/extension/views/app.html`.
- `DesktopRendererServer` serves `dist/extension` from `http://127.0.0.1:47321` by default. Override with `DESKTOP_RENDERER_PORT` when needed.
- A root-level `npm install` now bootstraps `packages/desktop` as part of the repo postinstall flow.
- `package` and `make` regenerate icons, build the production extension bundle, then package the desktop app.
- Packaged desktop builds include `dist/extension` and `packages/desktop/resources` as Forge extra resources.
- GitHub publishing and macOS signing/notarization are env-driven through Forge config.
- `start:dev:desktop:all` is the easiest local workflow when the extension bundle is not already being watched.
- Use `npm run desktop:open -- --org my-alias` to open an authenticated CLI org directly. The desktop host loads `/views/direct.html?alias=my-alias`, the renderer asks the main process for `sf org display --verbose`, and the Electron OAuth strategy reuses the CLI refresh token.
- Use `npm run desktop:open -- open soql --target-org my-alias --query "SELECT Id FROM User LIMIT 1"` to open SOQL Explorer directly from the CLI.
- Main-process diagnostics are written to Electron's logs directory as `main.log`. Use **Help → Open Logs Folder** in the desktop menu.
