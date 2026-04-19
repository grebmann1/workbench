---
title: Navigating the Menu
---

# Navigating the Menu

Inside the Workbench app, the left-side navigation menu gives you access to every tool and utility. Tools are grouped by purpose so related items stay together.

---

## Menu groups

| Group | Tools |
| --- | --- |
| **Explorers** | Org Overview, Metadata Explorer, SObject Explorer, Access Analyzer, Record Viewer, Files |
| **Data** | SOQL Explorer, Data Import |
| **Code** | API Explorer, Anonymous Apex, Event Explorer, Code Toolkit |
| **Deploy** | Deploy & Retrieve |
| **Utilities** | Text Compare, Smart Input, SARIF Viewer, Documentation Search |
| **Connections** | Salesforce Connections |
| **Others** | Settings, Release Notes |

The **Home** item at the top of the menu opens the dashboard with a summary of your connected org and quick-access cards.

---

## Switching between tools

Click any item in the menu to navigate to that tool. The URL updates to reflect the active tool:

```
/app?applicationName=soql
/app?applicationName=metadata
/app?applicationName=sobject
```

You can bookmark any tool URL to return directly to it later. Workbench will restore the active connection automatically if it is still valid.

---

## Collapsing the menu

The menu can be collapsed to a narrow icon rail to give more horizontal space to the active tool. Click the collapse toggle at the bottom of the menu bar.

---

## Command palette

Press `Ctrl/Cmd + K` inside the Workbench app to open the command palette (Quick Pick). Start typing a tool name or action — the palette shows matching results and lets you navigate to any tool or trigger common actions without using the mouse.

---

## Platform availability

A small number of tools are only available on specific platforms:

| Tool | Availability |
| --- | --- |
| Code Toolkit | Desktop (Electron) only |
| Smart Input | Chrome extension only (beta) |
| All other tools | All platforms |

If a menu item is greyed out, you are likely on a platform that does not support it.

---

## Next steps

- [Launching from the overlay](./overlay) — open tools directly from within a Salesforce org page
- [Managing org access](./org-access) — connect additional orgs
- [Applications overview](../applications/overview) — detailed description of every tool
