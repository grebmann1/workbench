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
