---
title: Managing Org Access
---

# Managing Org Access

Workbench supports several ways to connect to a Salesforce org. You can maintain multiple connections and switch between them instantly — no repeated logins required.

---

## Connection methods

### OAuth (Connected App)

The standard and recommended method for most users.

1. Open **Salesforce Connections** in the left menu (or go to **Settings → Connections**).
2. Click **New Connection**.
3. Choose your login URL (`login.salesforce.com` for production, `test.salesforce.com` for sandboxes).
4. You are redirected to Salesforce to authorize — sign in and approve access.
5. Workbench stores the connection and redirects you back.

OAuth credentials are kept in local app storage. In the Chrome extension, this is Chrome extension storage. In Workbench Desktop, imported refresh-token material is encrypted with OS-backed Electron safe storage before being written to the desktop user-data directory.

---

### Quick Authorize (Chrome extension)

If you already have an active Salesforce tab open, Workbench can borrow that session without a separate OAuth flow.

1. Open the overlay (`Ctrl/Cmd + Shift + E`) while on any Salesforce page.
2. Workbench auto-detects the active session and lists the org under **Organization**.
3. Click **Open in Toolkit** — the current session is passed directly to the app.

This method requires no configuration and is the fastest way to open the toolkit from an org you are already logged into.

---

### Session ID + Server URL

For environments where you have a session ID (e.g. from Salesforce Developer Console or the URL):

1. Open **Salesforce Connections → New Connection → Manual**.
2. Enter the **Session ID** and **Server URL** (e.g. `https://myorg.my.salesforce.com`).
3. Click **Connect**.

This is useful for temporary debugging sessions or CI/automation contexts.

---

### Username & Password

For sandboxes or developer orgs where OAuth is not configured:

1. Open **Salesforce Connections → New Connection → Username & Password**.
2. Enter your username, password (+ security token if required), and the login URL.
3. Click **Connect**.

---

### Redirect (VS Code integration)

When opening Workbench from the embedded VS Code editor, the connection is bootstrapped automatically via URL parameters. No manual steps are needed — the editor passes `sessionId`, `serverUrl`, or an org alias directly.

See [VS Code Integration](../vscode/overview) for details.

---

### Salesforce CLI alias (Desktop)

Workbench Desktop can reuse orgs that are already authenticated through the Salesforce CLI.

1. Authenticate with `sf org login web --alias my-org` or an equivalent `sfdx` command.
2. Open Workbench Desktop.
3. Run `workbench-desktop open org --target-org my-org`, or choose the org from the desktop connection list.

The desktop app asks the Salesforce CLI for verbose org details and reuses OAuth-backed org metadata. If the CLI does not expose OAuth credentials for the alias, re-authenticate with the Salesforce CLI.

---

## Switching between orgs

All your saved connections appear in the **Salesforce Connections** panel. Click any connection to make it active. The current active org is shown in the top bar of the app.

You can also use the overlay to switch: open the overlay on any Salesforce page and click **Open in Toolkit** — the toolkit switches to that org's session.

---

## Importing and exporting connections

Connections can be exported as a JSON file for backup or sharing across machines:

1. Go to **Salesforce Connections**.
2. Click **Export** — a JSON file is downloaded.
3. On another machine, click **Import** and select the file.

The file contains connection metadata but never plaintext credentials.

---

## Removing a connection

1. Go to **Salesforce Connections**.
2. Click the **...** menu next to the connection.
3. Select **Remove**.

Removing a connection clears all associated tokens from local storage.

---

## Next steps

- [Launching from the overlay](./overlay) — open tools without re-authenticating
- [Quickstart](./quickstart) — connect your first org end-to-end
- [Security and privacy](../security/local-data-and-privacy) — how credentials are stored
