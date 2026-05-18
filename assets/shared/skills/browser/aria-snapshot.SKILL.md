---
name: aria-snapshot
description: Reliable page interaction using getSnapshot + getElementByRef, including iframe recursion and post-action re-snapshot loops.
---

# ARIA Snapshot

Use this as the default interaction strategy on unknown or dynamic pages.

## Workflow

1. `const snapshot = await getSnapshot(page)`
2. Identify target by role/name and reference id (`ref=eN`)
3. `const handle = await getElementByRef(page, "eN")`
4. Perform one action
5. Re-run snapshot before next action

## Why this works

- Snapshot refs are more stable than fragile CSS selectors.
- Works better across shadow DOM boundaries.
- Includes iframe context in the generated snapshot tree.

## Rules

- Never assume refs remain valid after navigation or major DOM changes.
- Re-snapshot after route transitions, modal open/close, or async updates.
