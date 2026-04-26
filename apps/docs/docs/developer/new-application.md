---
title: Adding a New Application
---

# Adding a New Application

A **routed application** is a full-screen tool accessible from the left-side menu and via the `?applicationName=<path>` URL parameter. Examples include SOQL Explorer, Metadata Explorer, and API Explorer.

This guide walks through adding one from scratch.

---

## Overview

```
packages/lwc/main/
├── application/
│   └── myTool/          ← your new folder
│       └── app/
│           ├── app.ts
│           ├── app.html
│           └── app.css
└── component/skeleton/registry/
    └── registry.ts      ← register the entry here
```

---

## Step 1 — Create the LWC component

Create the folder and files for your application under `packages/lwc/main/application/`:

```
packages/lwc/main/application/myTool/app/app.ts
packages/lwc/main/application/myTool/app/app.html
packages/lwc/main/application/myTool/app/app.css
```

The root component **must** be named `app` inside a folder matching your tool's namespace.

### Minimal `app.ts`

```typescript
import ToolkitElement from 'core/toolkitElement';
import { store, connectStore, SELECTORS } from 'core/store';

export default class App extends ToolkitElement {
    connectedCallback() {
        connectStore(store, this._storeChange.bind(this), this);
    }

    _storeChange(newState: any) {
        // react to Redux store changes here
    }
}
```

Extending `ToolkitElement` (from `core/toolkitElement`) gives you access to:
- `this.connector` — the active `jsforce` connection
- `this.alias` — the current org alias
- Standard LWC lifecycle hooks

### Minimal `app.html`

```html
<template>
    <div class="slds-var-p-around_medium">
        <h1>My Tool</h1>
    </div>
</template>
```

---

## Step 2 — Register the entry

Open `packages/lwc/main/component/skeleton/registry/registry.ts` and add your entry to the top-level import block and `APPLICATION_ENTRIES` array:

```typescript
// 1. Add the import at the top
import myTool_app from 'myTool/app';

// 2. Add the entry in APPLICATION_ENTRIES
{
    name: 'myTool/app',
    module: myTool_app,
    isFullHeight: true,
    isDeletable: true,
    isElectronOnly: false,
    isOfflineAvailable: false,
    isMenuVisible: true,
    isTabVisible: true,
    label: 'My Tool',
    type: 'developer',                // used for filtering / grouping logic
    description: 'Brief description shown in the Quick Actions panel.',
    quickActionIcon: 'standard:apex', // SLDS icon name
    shortName: 'MY',
    path: 'mytool',                   // the ?applicationName= value
    menuGroup: 'code',                // 'data' | 'code' | 'explorers' | 'deploy'
    menuOrder: 50,                    // controls position within the group
},
```

### Entry fields reference

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | `'namespace/app'` — must match the LWC module path |
| `module` | LWC class | The imported default export of your `app.ts` |
| `isFullHeight` | boolean | `true` makes the tool fill the available viewport height |
| `isDeletable` | boolean | Whether the open tab can be closed by the user |
| `isElectronOnly` | boolean | Hide on web/Chrome extension; show only on desktop |
| `isOfflineAvailable` | boolean | Whether the tool functions without an org connection |
| `isMenuVisible` | boolean | Show in the left navigation menu |
| `isTabVisible` | boolean | Show as an openable tab |
| `label` | string | Display name in the menu and tab bar |
| `type` | string | Semantic category (`'explorer'`, `'developer'`, `'data'`) |
| `description` | string | Shown in Quick Actions and tooltips |
| `quickActionIcon` | string | SLDS icon for Quick Actions (e.g. `'standard:apex'`) |
| `shortName` | string | Abbreviated label used in narrow tabs |
| `path` | string | URL parameter value (`?applicationName=<path>`) |
| `menuGroup` | string | Group key: `'data'`, `'code'`, `'explorers'`, or `'deploy'` |
| `menuOrder` | number | Sort order within the group (lower = higher in list) |

---

## Step 3 — Add the LWR module alias

Open `lwc.config.json` (or the relevant LWR config for the target surface) and ensure your namespace is mapped. Most applications under `packages/lwc/main/application/` are picked up automatically by the existing `@lwc/rollup-plugin` glob patterns — verify by checking the `modules` array in the build config for your target.

---

## Step 4 — Build and verify

```bash
# Web target (LWR dev server)
npm run start:dev:web

# Chrome extension target
npm run build:extension
```

Open the app and confirm:

1. Your tool appears in the menu under the correct group.
2. Navigating to `/app?applicationName=mytool` loads your component.
3. The tab title shows the correct label.

---

## Connecting to the org

Use the `connector` property inherited from `ToolkitElement` to make Salesforce API calls:

```typescript
async fetchData() {
    const conn = this.connector.conn; // jsforce Connection
    const result = await conn.query('SELECT Id, Name FROM Account LIMIT 10');
    this.records = result.records;
}
```

The connector is always pre-authenticated with the active session — no extra auth steps needed.

---

## Using Redux store

Global application state lives in a Redux store accessed via `core/store`. Subscribe to state slices you need:

```typescript
import { store, connectStore, SELECTORS } from 'core/store';

connectedCallback() {
    connectStore(store, this._storeChange.bind(this), this);
}

_storeChange(newState: any) {
    this.currentAlias = SELECTORS.ui.getCurrentAlias(newState);
}
```

---

## Related guides

- [Adding a New Tool](./new-tool) — for utilities that don't need a full route
- [Architecture Overview](../architecture/overview) — monorepo layout and build targets
- [VS Code Integration](../vscode/overview) — if your tool needs editor capabilities
