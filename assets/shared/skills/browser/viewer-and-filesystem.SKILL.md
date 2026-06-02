---
name: viewer-and-filesystem
description: Work with /workspace and /mnt paths, open local viewer pages, and use workspace UI/file helpers for file-driven flows.
---

# Viewer and Filesystem

Use this skill when workflows involve generated files or local app-like pages.

## Storage zones

- `/workspace` for persisted sandbox files.
- `/mnt/<name>` for mounted local folders (if configured).
- `/workspace/tmp/${conversationId}` for conversation-scoped scratch files.

## Viewer flow

- Use `open /workspace/path/file.html` to render local HTML assets.
- In viewer pages, rely on workspace helpers:
  - `workspace.ui.filePicker(...)`
  - `workspace.ui.toast(...)`
  - `workspace.files.search(...)`

## Guidance

- Prefer file picker for user-selected inputs.
- Keep outputs under canonical absolute paths.
- For heavy text transforms, use bash pipelines after writing source files.
