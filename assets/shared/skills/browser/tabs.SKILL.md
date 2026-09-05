---
name: tabs
description: Manage browser tabs safely with idempotent createTab, tab reuse, activation, and cleanup patterns.
---

# Tabs

Use this skill for tab lifecycle decisions.

## Core behavior

- `createTab(url?)` reuses the tracked agent tab by default.
- `createTab(url, { forceNew: true })` always opens a new tab.
- `closeTab(tabId)` clears tracked state if it closes the tracked tab.

## Recommended patterns

- Start with `listTabs()` or `getCurrentTab()` when the user refers to existing tabs, "this tab", or visible page content.
- Reuse a single worker tab for sequential scraping/navigation.
- Open extra tabs only when parallel/isolated context is required.
- Close force-created tabs once work completes.

## Anti-patterns

- Do not call `createTab(..., { forceNew: true })` in loops/retries.
- Do not call `createTab()` to inspect a page the user already has open — connect to that tab instead.
- Do not mutate the user's active tab unless they asked you to change it. Inspecting (snapshot/screenshot/read) is always OK.
