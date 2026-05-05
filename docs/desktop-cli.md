# Workbench Desktop CLI

`workbench-desktop` is the command-line entrypoint for launching and controlling Workbench Desktop.

The CLI starts Electron when needed, waits for the local automation API, then sends a typed desktop command to the running app. If the app is already running, the command is delivered to the existing instance.

Automation requests are sent to the loopback-only desktop API and include a per-install bearer token read from the desktop user-data directory. Set `WORKBENCH_DESKTOP_API_TOKEN` only for advanced custom automation against a separately managed desktop instance.

## Commands

Open the app:

```sh
workbench-desktop
```

Open an org by Salesforce CLI alias:

```sh
workbench-desktop open org --target-org default-toolkit
workbench-desktop --org default-toolkit
```

Open an org from an SFDX auth URL:

```sh
workbench-desktop open org --alias imported-org --sfdx-url-file ./org.sfdx-url
printf '%s' "$SFDX_AUTH_URL" | workbench-desktop open org --alias imported-org --sfdx-url-stdin
```

Prefer `--sfdx-url-file` or `--sfdx-url-stdin`. `sfdxAuthUrl` values contain refresh-token material and should not be passed in shell history or URLs.

Open SOQL Explorer:

```sh
workbench-desktop open soql --target-org default-toolkit
workbench-desktop open soql --target-org default-toolkit --query "SELECT Id FROM User LIMIT 1"
```

Run Salesforce-style commands through the desktop app:

```sh
workbench-desktop sf data query --target-org default-toolkit --query "SELECT Id FROM User LIMIT 1" --json
workbench-desktop sf api request --target-org default-toolkit --method GET --url "/services/data/"
workbench-desktop sf apex run --target-org default-toolkit --apex-code "System.debug('hi');"
workbench-desktop sf navigate --target-org default-toolkit --app soql
```

## Options

- `--json`: print machine-readable JSON.
- `--api-url <url>`: override the automation API URL. Default: `http://127.0.0.1:12346`.
- `--timeout <ms>`: maximum wait for Electron/automation readiness. Default: `30000`.
- `--no-wait`: launch Electron and return without waiting for command completion.

## Troubleshooting

- If the CLI cannot reach the desktop app, open Workbench Desktop once so it can create its automation token and local API.
- If an org alias fails to open, re-authenticate with `sf org login web --alias <alias>` so verbose CLI org details include reusable OAuth credentials.
- If command output is needed for support, open **Help → Open Logs Folder** in the desktop app and inspect `main.log` before sharing it.

## Architecture

The CLI parses human-friendly commands into a versioned `DesktopCommand` contract. Electron main handles launch/focus and sends typed commands to the renderer. The renderer owns page navigation and store dispatches, so Redux remains an internal implementation detail rather than a public CLI API.
