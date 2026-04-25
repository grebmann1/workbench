# Desktop Action Parity

Workbench Desktop should expose the same core outcomes through UI, CLI, automation, and agent-facing surfaces.

| User outcome | UI surface | Desktop CLI | Automation API | Renderer handler | Status |
| --- | --- | --- | --- | --- | --- |
| Open Workbench home | Desktop app launch | `workbench-desktop` | `/command/execute` `openApp` | main window load | Done |
| Open org by alias | Connection list / launch intent | `open org --target-org <alias>` | `/command/execute` `openOrg` | direct window boot | Done |
| Open org by SFDX URL | Connection import/share | `open org --sfdx-url-file ...` | `/command/execute` `openOrg` | stored OAUTH config + direct window boot | Done |
| Open SOQL Explorer | App navigation | `open soql --target-org <alias>` | `/command/execute` `openPage` | `desktop-command` openPage | Done |
| Open SOQL with query | SOQL app tab state | `open soql --query ...` | `/command/execute` `openPage` route state | `desktop-command` openPage | Done |
| Execute SOQL | SOQL run button / fake bash | `sf data query ...` | `/command/execute` execute soql | `desktop-command` executeSoql | Done |
| Execute REST API request | API Explorer / fake bash | `sf api request ...` | `/command/execute` execute api | `desktop-command` executeApi | Done |
| Execute Anonymous Apex | Apex app / fake bash | `sf apex run ...` | `/command/execute` execute apex | `desktop-command` executeApex | Done |
| Navigate to app page | App menu/navigation | `sf navigate --app <app>` | `/command/execute` openPage | `desktop-command` openPage | Done |
| List windows | Automation menu/API | planned `windows --json` | `/electron/list-of-windows` | main process | Partial |
| List orgs | Connection page / fake bash | planned `org list --json` | `/org/list` | main process | Partial |

## Rule

When a new desktop UI action is added, add or update the matching CLI/automation capability in the same change unless the action is explicitly user-only.
