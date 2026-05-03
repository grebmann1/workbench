# A11y follow-ups

Items intentionally deferred from the T1-C additive a11y sweep (SOQL, Metadata, SObject). Each entry has a severity and the reason it was deferred. Severities follow axe's `impact` taxonomy (critical / serious / moderate / minor).

## Deferred — require non-additive changes

### [Serious] Metadata filter live-region announce
- File: `packages/lwc/applications/metadata/menu/menu.ts` (and `packages/lwc/main/component/slds/fileTree/fileTree.ts`)
- Gap: when a user types in the `slds-file-tree` filter inside the metadata menu, the number of matching records is not announced to screen readers.
- Why deferred: wiring this up requires `slds-file-tree` to emit a new `filtermatched` event carrying the match count so the parent (`menu.ts`) can call `announce('N matches found')`. That is a new event on a shared component, not an additive aria attribute, so it was pushed out of this sweep's "template attributes only" scope.
- Fix sketch: after `fileTree.handleSearch` finishes filtering, `dispatchEvent(new CustomEvent('filtermatched', { detail: { count }, bubbles: true, composed: true }))`. Consumers (`menu.ts`, SOQL `fieldsPanel.ts`) wire `onfiltermatched` → `announce(`${count} matches found`)` (debounced ~200 ms).

### [Moderate] Monaco editor internal textarea labeling (SOQL)
- File: `packages/lwc/applications/soql/queryEditorPanel/queryEditorPanel.html` (uses `<editor-soql>` which wraps Monaco).
- Gap: Monaco renders its own `<textarea>` that may lack an `aria-label`. We cannot label Monaco's internal DOM from the template.
- Why deferred: fix belongs inside the `editor-soql` / Monaco integration, which owns the textarea. Out of scope for a template-only sweep.
- Fix sketch: in the Monaco integration layer, pass `aria-label="SOQL query editor"` into `editor.create({ accessibilitySupport: 'on', ariaLabel: 'SOQL query editor' })`.

### [Moderate] Tabulator-rendered results grid row/cell roles (SOQL)
- File: `packages/lwc/applications/soql/outputTable/outputTable.html` (`<div lwc:dom="manual" class="custom-table">`).
- Gap: Tabulator owns the DOM under `.custom-table`; row/cell ARIA roles depend on the Tabulator build, not our template.
- Why deferred: rewriting Tabulator's rendered DOM is outside additive template scope.
- Fix sketch: configure Tabulator to emit `role="grid" / role="row" / role="gridcell"` (recent Tabulator versions support an `accessibilityMode` or equivalent option), or add a wrapper `<div role="grid" aria-label="Query results">` — the latter is a mild future additive-safe improvement once we re-enter this area.

### [Moderate] `slds-file-tree-item` keyboard map audit (tree navigation)
- File: `packages/lwc/main/component/slds/fileTree/fileTreeItem.ts`
- Gap: the sweep skipped extracting `component/slds/treeNav/treeNav.ts` on the assumption that `slds-file-tree-item` already owns treeitem keydown (Arrow / Home / End). Worth a manual + axe verification pass to confirm ArrowDown / ArrowUp / Home / End all move focus between treeitems per WAI-ARIA Authoring Practices.
- Why deferred: pending verification; if a gap is found, extract the helper then.

## Pre-existing noise workarounds

### [Critical] `lightning-vertical-navigation` slotted `role="list"` has no visible children (`aria-required-children`)
- Rule id: `aria-required-children`
- File:line: `node_modules/lightning-base-components/src/lightning/verticalNavigationSection/verticalNavigationSection.html` — emits `<div role="list"><slot></slot></div>` with the list items distributed from the parent shadow root.
- Where axe sees it: the vertical-nav rendered by `slds-tabset variant="vertical"` on the Settings page (`packages/lwc/main/pages/settings/app/app.html`) and every other shell surface that uses the Settings app's vertical tabset for Playwright's shell coverage (`packages/tests-e2e/tests/extension/a11y-shell.spec.ts`).
- Why pre-existing: `<slot>` is invisible to axe's ARIA structural checks — it cannot flatten shadow DOM distribution to prove that the list has `listitem` children. The fix is in `lightning-base-components` and out of scope for this worktree.
- Suppression: T1-A specs (`a11y-shell.spec.ts`, `settings-ai.spec.ts`) call `.disableRules(['aria-required-children', 'aria-required-parent'])` for the Settings-app / shell scans only. Onboarding + the static fixtures do not suppress these rules.

### [Critical] `lightning-button-icon` inner `<button>` has no discernible text (`button-name`)
- Rule id: `button-name`
- File:line: `node_modules/lightning-base-components/src/lightning/buttonIcon/buttonIcon.html` — the inner shadow button does not reflect `alternative-text` onto a DOM-level `aria-label` visible to axe.
- Where axe sees it: multiple `lightning-button-icon` instances in the shell header + footer + settings toolbar. All have `alternative-text` / `title` set at the component level (`packages/lwc/main/component/skeleton/header/header.html`, `packages/lwc/main/component/skeleton/footer/footer.html`, `packages/lwc/main/pages/settings/app/app.html`).
- Why pre-existing: axe's `button-name` rule evaluates the inner shadow-root `<button>` node, which has no `aria-label` attribute of its own (lightning-base-components uses `aria-labelledby` → a separate node in the parent shadow root that axe can't trace through). Fix must land in `lightning-base-components`.
- Suppression: T1-A shell spec adds `button-name` to `.disableRules(...)`.

### [Critical] `lightning-vertical-navigation-item` `role="listitem"` outside visible list (`aria-required-parent`)
- Rule id: `aria-required-parent`
- File:line: `node_modules/lightning-base-components/src/lightning/verticalNavigationItem/verticalNavigationItem.html` — emits `<div role="listitem">` in its own shadow root, separate from the parent `role="list"` container.
- Why pre-existing: same shadow-DOM distribution problem as above — axe can't walk through the slot to match parent/child roles when the `role="list"` and the `role="listitem"` live in different shadow roots.
- Suppression: same `.disableRules(...)` entry on the two T1-A specs that traverse the Settings/shell surface.

## T2 backlog — Tier 2 app sweep (audit-only items)

Filed during the Tier-2 sweep. Criticals in these files were fixed inline in the same sweep. Items below are Serious / Moderate / Minor.

### Missing accessible sub-label / help text wiring
- [Serious] `packages/lwc/applications/api/header/header.html:81-85` — `slds-searchable-combobox` inside the Key column has no `aria-label`; column context only. Fix: pass `aria-label="Header key"` through the combobox. Effort: S.
- [Serious] `packages/lwc/applications/api/header/header.html:97-103` — still uses the table column "Value" as implicit label. aria-label added in this sweep covers axe but pattern should use a real `<label>` via `slds-field-light`'s label slot. Effort: M.
- [Serious] `packages/lwc/applications/smartinput/app/app.html:87-92` — bare `<input>` inside `slds-field` whose `label` prop does not wire to the inner input's `aria-labelledby`. Column is labeled "Category name" via the parent `slds-field`, but axe sees the raw input. Effort: M (slds-field enhancement).
- [Serious] `packages/lwc/main/pages/documentation/cta/basicSearch/basicSearch.html:25` — submit `<button tabindex="-1">` with `slds-assistive-text`. Visible text is present (axe passes), but negative tabindex on a submit button means keyboard users cannot tab to it. Form still submits via Enter in the input. Effort: S.

### Native `<button>` accessible name via `title` only
Native buttons with `title=` but no visible text or `aria-label`. Axe accepts `title` as last-resort accessible name so these are NOT critical, but best practice is to add an explicit `aria-label`. Effort: S each.
- [Minor] `packages/lwc/applications/recordviewer/recordExplorer/recordExplorer.html:12, 23, 34, 44, 70, 95, 250`
- [Minor] `packages/lwc/applications/recordviewer/recordExplorerRow/recordExplorerRow.html:26, 43, 54, 65, 76, 85`

### Missing landmarks / region roles
- [Moderate] `packages/lwc/main/pages/home/welcome/welcome.html` — page uses `<div class="welcome-page">` with no top-level `<main>` / landmark. Effort: S.
- [Moderate] `packages/lwc/main/pages/home/quickLauncher/quickLauncher.html` — `<div role="button" tabindex="0">` items have keyboard handlers; should also use `<button>` element for semantics. Effort: M.
- [Moderate] `packages/lwc/main/pages/release/notes/notes.html:8-21` — `<li onclick>` entries in the version list are clickable but not focusable and have no keydown handler. Effort: M.
- [Moderate] `packages/lwc/applications/platformevent/eventViewer/eventViewer.html:70-134` — schema table lacks a `<caption>` / aria-label tying it to the channel being viewed. Effort: S.
- [Moderate] `packages/lwc/applications/recordviewer/recordExplorer/recordExplorer.html:232-296` — table `role="grid"` but rows / cells rendered by child components don't set `role="row"` / `role="gridcell"`. Effort: M.

### Form / input refinements
- [Moderate] `packages/lwc/applications/api/appSettings/appSettings.html:10-18` — `lightning-input type="toggle"` uses `variant="label-hidden"`; helper text ("Control how the request/response panels split inside API Explorer.") should be wired via `aria-describedby`. Effort: S.
- [Moderate] `packages/lwc/applications/smartinput/appSettings/appSettings.html:11-19, 31-39` — same pattern (label-hidden toggle + external description). Effort: S.
- [Moderate] `packages/lwc/applications/textCompare/app/app.html:42-50` — `lightning-input type="toggle"` has label but toolbar context is not conveyed to AT; wrap with `role="toolbar"` + `aria-label`. Effort: S.

### Icon-only toggles / stateful announcements
- [Moderate] `packages/lwc/applications/anonymousApex/app/app.html:35, 42` — `lightning-button-icon-stateful` (Debug, Recent) now has alt-text; when toggled, the stateful change isn't announced. Wire `announce()` on toggle. Effort: M.
- [Moderate] `packages/lwc/applications/api/app/app.html:34, 40, 89, 96` — same pattern; announce toggle changes. Effort: M.
- [Moderate] `packages/lwc/applications/smartinput/app/app.html:11, 17` — same. Effort: M.
- [Moderate] `packages/lwc/applications/package/app/app.html:10-17` — same. Effort: M.
- [Moderate] `packages/lwc/applications/recordviewer/app/app.html:10-16` — same. Effort: M.
- [Moderate] `packages/lwc/applications/platformevent/app/app.html:96-102` — same. Effort: M.
- [Moderate] `packages/lwc/applications/platformevent/messageList/messageList.html:5-13` — filter stateful toggle: no announce on change. Effort: M.

### GraphQL Explorer app — not present
- [Info] `packages/lwc/applications/graphql/**` directory does not exist in this worktree. Tier-2 spec references it but there is no source to audit or route to visit. Skipped from the smoke spec.

### Tier-2 smoke spec axe rule suppressions
The Tier-2 smoke spec disables the same pre-existing lightning-base-components noise rules as T1-A (see "Pre-existing noise workarounds" above): `aria-required-children`, `aria-required-parent`, `button-name`. These are out-of-scope for additive template fixes.
