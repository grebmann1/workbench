---
title: Launching from the Overlay
---

# Launching from the Overlay

The Workbench overlay is the fastest way to access tools while you are already working inside a Salesforce org. It is injected automatically into every Salesforce page when the Chrome extension is installed — no configuration required.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Shift + E` | Toggle the overlay panel open / closed |
| `Ctrl/Cmd + Shift + S` | Open the overlay with the quick-search focused |
| `Ctrl/Cmd + Shift + Space` | Open Workbench as a Chrome side panel |

---

## How the overlay works

When you navigate to a Salesforce org (e.g. `https://myorg.lightning.force.com`), the extension:

1. Detects the active Salesforce session from the page context (session ID and server URL).
2. Injects the overlay panel into the DOM.
3. Pre-fills the current org so you can launch tools without re-authenticating.

The overlay shows four tabs:

| Tab | What it shows |
| --- | --- |
| **Organization** | Summary info for the current org (name, edition, limits) |
| **Quick Links** | Shortcuts to your most-used Workbench tools |
| **Object** | Inspect the SObject context of the current page |
| **Users** | Active users and quick user-switching |
| **Dev Tools** | Technical details: session info, API version, debug flags |

---

## Opening a tool from the overlay

1. Press `Ctrl/Cmd + Shift + E` to open the overlay (or click the extension icon in the Chrome toolbar).
2. Browse the **Quick Links** tab or type in the search box (`Ctrl/Cmd + Shift + S`).
3. Click any tool name — Workbench opens that tool in a new browser tab, automatically passing your current session credentials.

The tool URL follows this pattern:

```
https://app.workbench-salesforce.com/app?applicationName=<tool>&sessionId=...&serverUrl=...
```

You never need to log in separately — the session is carried over from the page you were on.

---

## Pinning the side panel

For a persistent workspace alongside Salesforce, use `Ctrl/Cmd + Shift + Space` to open Workbench as a Chrome side panel. The side panel stays open as you navigate between Salesforce pages and automatically updates the connected org context.

---

## Next steps

- [Using the menu](./menu) — navigate within the Workbench app itself
- [Managing org access](./org-access) — add more orgs or switch connections
- [Applications overview](../applications/overview) — full list of available tools
