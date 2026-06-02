---
name: chrome-tabs
description: Open, list, close, and navigate browser tabs from the Workbench sandbox via js. Use when the user asks to inspect pages, manage tabs, or capture screenshots.
---

# Chrome Tabs (sandbox)

Use this skill for browser tab automation in Workbench.

## When to use

- User asks to list tabs, open a tab, close a tab, activate a tab, or inspect page state.
- User asks "what do you see" and you need a screenshot through `logImage`.

## Available globals (inside `js`)

- `listTabs(): Promise<Array<{ id, title, url, active }>>`
- `createTab(url?, { forceNew? })` (idempotent unless `forceNew: true`)
- `closeTab(tabId)`
- `activateTab(tabId)`
- `connectToPage(tabId)` (Puppeteer page handle)
- `waitForPageLoad(page, options?)`
- `waitForLightning(page, options?)`
- `getSnapshot(page)`
- `getElementByRef(page, ref)`
- `logImage(base64Png)`

## Recipes

- Open or reuse an automation tab:
  - `const tab = await createTab('https://example.com');`
- Capture a screenshot for visual confirmation:
  - `const shot = await page.screenshot({ encoding: 'base64' }); logImage(shot);`
- Keep tab usage clean:
  - reuse `createTab()` default behavior for retries
  - call `closeTab(tab.id)` for force-created temporary tabs

## Not available

- There are no direct tools named `chrome_screenshot`, `chrome_open_tab`, `chrome_navigate_tab`, `chrome_group_tabs`, etc.
- Always use `js` with the sandbox globals listed above.
