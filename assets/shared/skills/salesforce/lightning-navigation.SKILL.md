---
name: lightning-navigation
description: Navigate Salesforce Lightning reliably (record pages, list views, setup, and app pages), including settle waits, shadow DOM-safe interaction, and modal handling.
---

# Lightning Navigation

Use this skill when browser automation targets Salesforce Lightning pages.

## URL patterns (preferred over click-path navigation)

- Record view: `${instanceUrl}/lightning/r/${ApiName}/${Id}/view`
- New record: `${instanceUrl}/lightning/o/${ApiName}/new`
- List views: `${instanceUrl}/lightning/o/${ApiName}/list?filterName=__Recent`
- Setup home: `${instanceUrl}/lightning/setup/SetupOneHome/home`
- Setup node: `${instanceUrl}/lightning/setup/${SetupNode}/home`
- App page/tab: `${instanceUrl}/lightning/n/${TabApiName}`
- App launcher target: `${instanceUrl}/lightning/app/${AppApiName}`

## Auth-aware navigation

- If session context is uncertain, navigate through `connector.frontDoorUrl` with `retURL`.
- Prefer the `sf open ...` shim when available for Salesforce navigation intents.

## Settle strategy

- After `page.goto(...)`, run `waitForLightning(page)` before snapshots/interactions.
- If needed, fallback check:
  - `await page.waitForFunction(() => !document.querySelector('.slds-spinner_container[role="status"]'), { timeout: 8000 });`

## Shadow DOM and element targeting

- Lightning components rely heavily on shadow DOM.
- Prefer `getSnapshot(page)` + `getElementByRef(page, ref)` for robust targeting.
- Avoid direct selectors like `document.querySelector('lightning-input...')` for primary interaction flow.

## Modals and dialogs

- Standard modal signals: `role="dialog"` and `.slds-modal__container`.
- Dismiss via `Escape` first, then explicit close button selectors when necessary.

## Typical workflows

- Open record and inspect:
  1. `page.goto(/lightning/r/.../view)`
  2. `waitForLightning(page)`
  3. `getSnapshot(page)`
- Navigate list view:
  1. `page.goto(/lightning/o/Account/list?filterName=AllAccounts)`
  2. `waitForLightning(page)`
  3. snapshot + ref-driven actions
- Open setup page:
  1. `page.goto(/lightning/setup/PermSets/home)`
  2. settle + snapshot

## Boundaries

- Experience Cloud (`/s/...`) behavior is variable and should be treated as out-of-scope unless explicitly requested.
- Classic UI fallback (`/_ui/...`) should trigger a warning and a return to Lightning URL patterns.
