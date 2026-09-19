# Demo design references

The homepage tour and product film share `AppPreview.tsx`. These are React demo replicas of the current app surfaces, with deterministic animation states and fictional org data. They do not execute the authenticated LWC runtime.

The film's title cards and captions keep their own presentation style. The screens inside the film follow the product UI.

| Surface         | Production sources                                                                                                                | Replicated details                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workbench shell | `packages/lwc/main/component/skeleton/{app,header,menu,footer}`                                                                   | Session banner, Workbench/Beta heading, app tabs, grouped navigation, blue utility footer                                                                                     |
| Navigation      | `packages/lwc/main/application/applicationRegistry/application.manifest.json`                                                     | Actual visible app names, menu groups, and order imported at build time                                                                                                       |
| SOQL            | `packages/lwc/applications/soql/app`, `packages/lwc/main/component/builder/header`                                                | Purple dataset icon, Save/Run and result toolbar, SObjects browser, query tab, autocomplete, split editor/results, deleted-record toggle                                      |
| Metadata        | `packages/lwc/applications/metadata/{app,menu,viewer,structureViewer,structureViewerItem}`                                        | Quick links, separate types and records panels, component tabs, Workbench/JSON tabs, expandable metadata structure                                                            |
| Overlay         | `packages/lwc/extension/views/overlay`, `packages/lwc/extension/extension/{header,footer}`, `packages/lwc/extension/overlay/item` | Filter/search/action header, refresh text, full tab labels, organization/user fieldsets, object filters and Q/C/U badges, keyboard hints                                      |
| VS Code         | `packages/vscode/src/setup.common.ts`, Salesforce extension panels, `assets/images/screenshots/screenshot-editor.png`             | Standalone light VS Code layout, host welcome banner, command bar, activity rail, project tree, breadcrumbs, highlighted code, Salesforce connection/schema panel, status bar |
| Browser agent   | `packages/lwc/main/agent/{app,message,publisher,toolMessage}`, `assets/images/screenshots/screenshot-agent.gif`                   | Browser side-panel header, search/tools, conversation controls, outbound bubble, reasoning/tool rows, model selector, composer, automatic conversation scroll                 |

Reference screenshots were inspected locally. No screenshots containing real user or org data are embedded into the demo.

## Shared assets

- The cloud icon uses `assets/workbench-logo-128.png`: the production icon's silhouette with the lettering updated to Workbench for the product tour and store media.
- The SLDS icons are extracted from the repository's installed `@salesforce-ux/design-system` package, retaining its artwork.
- The empty-state SVG is extracted from the actual `illustration/empty` LWC template. Its colors match the light SLDS cloud-blue 80/90 tokens.
- Refresh generated SVG assets with `node tools/product-film/sync-preview-assets.mjs`.

## Keeping the demo accurate

When a source UI changes, update its matching preview component and compare the same state against the app. Preserve the named cursor targets and `SlidePlay` inputs so the homepage and film continue to use the same workflow. App navigation labels update with the generated application manifest.

The fixed preview canvas scales as a whole on smaller screens; the app panels are not rearranged into invented mobile layouts. Film framing uses a shorter viewport with normal panel scrolling. In the animated agent, new tool results and the final reply scroll into view.
