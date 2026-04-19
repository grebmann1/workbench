---
title: Anonymous Apex
---

# Anonymous Apex

**Menu path:** Code → Anonymous Apex  
**URL parameter:** `applicationName=anonymousapex`

The Anonymous Apex tool lets you write and execute Apex code directly against your connected org — without creating a class or trigger. Results, debug logs, and exceptions are shown immediately after execution.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **Anonymous Apex** in the left menu (under **Code**).
3. Type your Apex code in the editor.
4. Click **Execute** (or press `Ctrl/Cmd + Enter`).
5. The execution result and debug log appear in the output panel below.

---

## Editor features

- Apex syntax highlighting
- Auto-indentation
- Support for multi-line scripts — the editor is a full code panel, not a single-line input
- **Save** button to persist the current script to the virtual workspace for later use

---

## Execution output

After running a script, the output panel shows:

| Section | Content |
| --- | --- |
| **Status** | Success or failure indicator |
| **Compiled lines** | Number of Apex lines compiled |
| **Exception** | Full exception message and line number if the script throws |
| **Debug log** | The `System.debug()` output and log lines from the execution |

Debug log output follows the standard Salesforce log category format. You can set the log level before executing using the log level selector in the toolbar.

---

## Saving scripts

Click **Save** to store the current script in the local virtual workspace. Saved scripts appear in the side panel and can be reopened across sessions. The AI agent can also access, edit, and run your saved scripts.

---

## Tips

- Use `System.debug(JSON.serialize(record));` to print complex objects in a readable format.
- You can call any Apex method that the running user has access to, including `Database.query()`, DML, and callouts (if the org has remote site settings configured).
- The AI agent can write Apex for you — describe the operation in natural language and it will produce and execute the script.

---

## Related tools

- [API Explorer](./api-explorer) — call REST/SOAP endpoints without writing Apex
- [VS Code Integration](../vscode/overview) — open saved scripts in the full embedded editor with Apex LSP support
- [AI Agent](../ai-agent/setup) — generate and execute Apex using natural language
