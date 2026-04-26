---
title: Adding a New Tool (Utility)
---

# Adding a New Tool (Utility)

A **tool** (or utility) is a lighter-weight entry that does not need its own route or tab. Tools are launched from the menu as a panel or modal overlay. Examples include Text Compare and Smart Input.

If you need a full-screen routed experience with its own URL, see [Adding a New Application](./new-application) instead.

---

## Overview

```
packages/lwc/main/
├── tools/
│   └── myUtility/        ← your new folder
│       └── app/
│           ├── app.js
│           ├── app.html
│           └── app.css
└── core/applications/
    └── applications.ts   ← register the entry here
```

---

## Step 1 — Create the LWC component

Create the folder and files under `packages/lwc/main/tools/`:

```
packages/lwc/main/tools/myUtility/app/app.js
packages/lwc/main/tools/myUtility/app/app.html
packages/lwc/main/tools/myUtility/app/app.css
```

Existing utilities use plain `.js` (not TypeScript) — follow the same convention for consistency unless the area you are working in already uses `.ts`.

### Minimal `app.js`

```javascript
import { LightningElement } from 'lwc';

export default class App extends LightningElement {
    // your component logic
}
```

Unlike routed applications, tools do not need to extend `ToolkitElement` unless they need org connectivity. If your utility needs the active Salesforce connection, extend `ToolkitElement` from `core/toolkitElement`.

### Minimal `app.html`

```html
<template>
    <div class="slds-var-p-around_medium">
        <h1>My Utility</h1>
    </div>
</template>
```

---

## Step 2 — Register the entry

Open `packages/lwc/main/core/applications/applications.ts` and add your entry to the import block and `BASE_APP_MAPPING` object:

```typescript
// 1. Add the import at the top
import myUtility_app from 'myUtility/app';

// 2. Add the entry in BASE_APP_MAPPING
'myUtility/app': {
    module: myUtility_app,
    isFullHeight: true,
    isDeletable: true,
    isElectronOnly: false,
    isOfflineAvailable: true,
    isMenuVisible: true,
    isTabVisible: true,
    label: 'My Utility',
    type: i18n.UTILITY,           // use i18n.UTILITY for generic tools
    description: 'Brief description.',
    quickActionIcon: 'utility:magicwand',
    shortName: 'Util',
    path: 'myutility',
},
```

### Entry fields reference

| Field | Type | Description |
| --- | --- | --- |
| `module` | LWC class | The imported default export of your `app.js` |
| `isFullHeight` | boolean | Fill the viewport height when opened |
| `isDeletable` | boolean | Whether the opened tab can be closed |
| `isElectronOnly` | boolean | Restrict to the Electron desktop app |
| `isChromeOnly` | boolean | Restrict to the Chrome extension (e.g. Smart Input) |
| `isOfflineAvailable` | boolean | Works without an active org connection |
| `isMenuVisible` | boolean | Show the item in the left navigation menu |
| `isTabVisible` | boolean | Allow the tool to be opened as a tab |
| `label` | string | Display name |
| `type` | string | Use `i18n.UTILITY` for general-purpose tools |
| `description` | string | Tooltip / Quick Actions description |
| `quickActionIcon` | string | SLDS icon name |
| `shortName` | string | Abbreviated label for narrow tabs |
| `path` | string | Unique path key (used internally for navigation) |

### Available `type` values

| Constant | Value | Use for |
| --- | --- | --- |
| `i18n.HOME` | `'home'` | The home dashboard only |
| `i18n.EXPLORER` | `'explorer'` | Data/schema exploration tools |
| `i18n.DEVELOPER` | `'developer'` | Code execution / API tools |
| `i18n.DATA` | `'data'` | Data manipulation tools |
| `i18n.UTILITY` | `'utility'` | General-purpose utilities |
| `i18n.CONNECTION` | `'connection'` | Org connection management |
| `i18n.DOCUMENTATION` | `'documentation'` | Docs-search tools |
| `i18n.EXTRA` | `'extra'` | Settings, release notes, etc. |

---

## Difference between a tool and an application

| | Tool / Utility | Application |
| --- | --- | --- |
| Registration file | `core/applications/applications.ts` | `skeleton/registry/registry.ts` |
| Source folder | `packages/lwc/main/tools/` | `packages/lwc/main/application/` |
| Has its own route | No | Yes (`?applicationName=<path>`) |
| Shown in menu groups | Optional (no group key) | Yes (requires `menuGroup`) |
| Typical file language | `.js` | `.ts` |

---

## Step 3 — Build and verify

```bash
# Web dev server
npm run start:dev:web

# Chrome extension
npm run build:extension
```

Open the app and confirm:

1. Your tool appears in the left menu if `isMenuVisible: true`.
2. Clicking the item opens your component.

---

## Related guides

- [Adding a New Application](./new-application) — for full-screen routed tools
- [Architecture Overview](../architecture/overview) — monorepo and build target details
