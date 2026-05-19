---
name: memory
description: Persistent agent memory across conversations. Read /workspace/memory at the start of any task that may benefit from prior user preferences, recurring org facts, or past lessons, and append new notes after completing work the user is likely to repeat. Use when the user says "remember this", "from now on", "prefer", "always", "next time", "forget that"; when learning a non-obvious org schema/field meaning; when recovering from an error worth remembering; or when starting a task type seen before. Promote recurring patterns into real skills via save-skill so they become first-class on the next turn.
---

# Memory

Keep durable context across sessions in a small, readable file tree. Treat memory as augmentation to the prompt, not authority — the user can override anything in it.

## Layout

- `/workspace/memory/notes.md` — global user preferences and cross-org lessons.
- `/workspace/memory/orgs/<alias>/notes.md` — facts and quirks specific to one org.
- `/workspace/memory/orgs/<alias>/schema.md` — non-obvious field/object meanings, picklist conventions.

`<alias>` is the alias from the current Salesforce connection (use the connection info already in context, or `sf org list`). Skip per-org files when there is no active connection.

## Read protocol (start of task)

Before working on a task that could benefit from prior context, scan only the relevant files:

1. `bash` → `ls /workspace/memory 2>/dev/null && ls /workspace/memory/orgs/<alias> 2>/dev/null`.
2. `readFile` only the files whose names match the task topic. Do not load everything blindly.
3. Skip the read entirely for trivial one-shot requests (e.g. "what time is it").

Missing files are normal — treat as empty.

## Write protocol (end of task)

Append when something has been learned that the user will plausibly need again:

- User preferences ("I prefer SOQL with explicit fields") → `/workspace/memory/notes.md`.
- Org-specific facts ("alias `staging` uses `Account.External_ID__c` as the integration key") → `/workspace/memory/orgs/<alias>/notes.md`.
- Schema nuances (custom field meaning, picklist conventions) → `/workspace/memory/orgs/<alias>/schema.md`.

Write rules:

- Always `readFile` first, then `writeFile` with the existing content plus one new bullet. Do not clobber.
- One fact per bullet, ISO-dated: `- 2026-05-19: <fact>`.
- Keep each bullet ≤ 200 characters. Link to a record id when relevant.
- Never record secrets, tokens, passwords, raw PII, or full record dumps.
- Do not record transient state (current selection, last query, scratch values).

## Autonomy

Record without asking when:

- The user uses imperative recall language ("remember", "from now on", "always", "next time", "prefer").
- A correction was issued ("no, use X instead of Y") — record the rule, not the conversation.
- A non-obvious technical fact was discovered through investigation (hidden field meaning, permission quirk, recurring error fix).

Ask first when:

- The fact involves a personal or business decision rather than a technical truth.
- About to write more than 3 bullets in one go.
- About to promote a memory into a saved skill (see below).

## Promotion to a saved skill

When the same memory file accumulates 3+ bullets describing the same recurring workflow (e.g. "always export query results as CSV"), propose promoting it:

1. Summarize the recurring workflow in one sentence.
2. Ask: "Noticed this pattern N times — save it as a skill called `<name>` so it triggers automatically next time?"
3. On approval, call `save-skill` with `--scope user` (or `project` if explicitly requested). The new skill is auto-discovered on the next turn.
4. Replace the promoted bullets in `notes.md` with one line: `- <date>: promoted to skill <name>`.

## Citing memory

When a response or decision is driven by something in memory, surface it with a single prefixed line so the user can audit:

`> from memory: prefer explicit field lists in SOQL (2026-04-12)`

## Forgetting

When the user says "forget X" or "that's no longer true":

1. `readFile` the relevant memory file.
2. `writeFile` the same content with the matching bullet removed.
3. Confirm the change in the response.
