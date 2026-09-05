---
name: chrome-tabs
description: Open, list, close, and navigate browser tabs from the Workbench sandbox via js. Use when the user asks to inspect pages, manage tabs, or capture screenshots.
---

# Chrome Tabs (sandbox)

Use this skill for browser tab automation in Workbench.

## When to use

- User asks to list tabs, open a tab, close a tab, activate a tab, or inspect page state.
- User asks "what do you see", to solve a quiz, or to read the current / visible tab.

## Available globals (inside `js`)

- `listTabs(): Promise<Array<{ id, title, url, active }>>`
- `getCurrentTab()` (active tab from `listTabs()`, or first listed tab)
- `createTab(url?, { forceNew? })` (idempotent unless `forceNew: true`)
- `closeTab(tabId)`
- `activateTab(tabId)`
- `connectToPage(tabId?)` (Puppeteer page handle; omits tabId → active tab)
- `waitForPageLoad(page, options?)`
- `waitForLightning(page, options?)`
- `getSnapshot(page)`
- `getElementByRef(page, ref)`
- `logImage(base64Png)`

## Recipes

- Inspect the user's current / visible tab (quiz, "this page", "what do you see"):
    - `const tab = await getCurrentTab();`
    - `const page = await connectToPage(tab.id);` (`connectToPage()` with no arg also attaches to the active tab)
    - `const snapshot = await getSnapshot(page);` — returns ARIA YAML (a string). `console.log(snapshot)`.
    - Do **not** call `createTab()` for an already-open page.
- Open or reuse an automation tab:
    - `const tab = await createTab('https://example.com');`
- Capture a screenshot for visual confirmation:
    - `const shot = await page.screenshot({ encoding: 'base64' }); logImage(shot);`
- Keep tab usage clean:
    - reuse `createTab()` default behavior for retries
    - call `closeTab(tab.id)` for force-created temporary tabs

The `js` runtime already wraps scripts in async. Use top-level `await`. Do **not** wrap recipes in `(async () => { ... })();` — that returns immediately with empty output.

## Not available

- There are no direct tools named `chrome_screenshot`, `chrome_open_tab`, `chrome_navigate_tab`, `chrome_group_tabs`, etc.
- Always use `js` with the sandbox globals listed above.
