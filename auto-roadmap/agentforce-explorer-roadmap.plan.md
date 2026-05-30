# Agentforce Explorer — Detailed Roadmap

> Synthesized from a 6-specialist brainstorm (2 architects, PM, UX, UI, engineer)
> against the current codebase at `packages/lwc/applications/agentforce/`.
> Today's date: 2026-05-27. App last touched on 2026-05-21 (commit `f410851d`).

---

## TL;DR

Agentforce Explorer is a promising 2-day demo that stalled. The bones are right
(inspector / debugger / dependencies / editor) — the connective tissue is
missing. Six specialists converged on the same diagnosis:

- **It feels like four disconnected rooms.** No URL state, no cross-tab links,
  no cross-app links, no shareable deep-links to a step.
- **It silently fails.** Eight `catch { return [] }` sites swallow real errors.
  Users cannot tell "no data" from "no permission" from "wrong API version".
- **It does not scale.** No caching, no pagination beyond `LIMIT 50`, no list
  virtualization, mermaid renders synchronously on every store dispatch.
- **It speaks two visual languages at once.** SLDS chrome + AgentLens body, with
  4 different "agent blue" hexes across surfaces and a token sheet that is never
  imported.
- **One real bug**: `agentforceTools.ts:36` still queries the renamed-out
  `GenAiPlanner` entity. The AI tool returns 0 agents.

The plan below is split into three horizons (Now / Next / Later) with concrete
work items, owners, file references, and effort estimates. Every item ties back
to one of the specialist findings. Items not making the cut are listed at the
end.

---

## Personas (drives prioritization)

- **Maya the agent builder** — admin / declarative dev. Audits topics +
  dependencies before deploy. Cares about cross-org parity.
- **Raj the agent debugger** — support / SRE. Lands on the app from a customer
  ticket with a conversation ID. Needs the failing step in <30s.
- **Lin the prompt engineer** — iterates on prompt templates. Wants A/B,
  token-cost visibility, and replay with overrides.
- **Diego the architect** — reviewer. Wants a one-page health summary + an
  exportable diagram for design review.

Persona priority for the roadmap: **Maya + Raj first**. Lin and Diego are
served by spillover.

---

## Critical bug — fix on day 1

**`packages/lwc/main/agent/tools/modules/agentforceTools.ts:36`** queries
`GenAiPlanner`. The slice migrated to `BotDefinition` in commit `f410851d`.
`agentforce_list_agents` AI tool currently returns empty in every org. Single-line
fix; ship before anything else.

---

## Horizon 1 — NOW (0–3 weeks, ~10 dev-days)

> Goal: stop the bleeding. Make the existing app feel finished.
> Persona: Maya + Raj equally.

### N1 — Critical bug fix + agent tool surface (XS, ½d)
- Fix `agentforceTools.ts:36`: `GenAiPlanner` → `BotDefinition`.
- Add `agentforce_get_interaction_steps` tool (mirrors debugger slice).
- Add `agentforce_open_in_explorer({agentId})` that calls
  `invokeCommand('agentforce.openAgent', …)` so the AI can drive the UI.

### N2 — Extract `runSoqlQuery` helper, kill 3 duplicates (S, ½d)
- Promote `soqlQuery` from `slices/agents.ts:167-191` and
  `slices/debugger.ts:68-92` to `host-api/connector.ts`.
- Sweep `agentforceTools.ts` to use it (3rd duplicate).
- Validate IDs `/^[a-zA-Z0-9]{15,18}$/` before SOQL composition.
- Unblocks every later improvement (caching, retries, pagination).

### N3 — Replace silent `catch { return [] }` with `reportError` (S, ½d)
8 sites: `slices/agents.ts:213, 305, 327, 344` + `slices/debugger.ts:111, 134`
+ inline catches in `dependencies.ts`, `editor.ts`. Wire into the host's
`reportError` from `host-api/store` so failures surface in the footer
instead of disappearing.

### N4 — Empty / loading / error states pass (S, 1d)
- 4 illustrative SVG empty states (inspector, debugger, dependencies, editor),
  each with a CTA ("Open Agent Builder", "View last 7d", "Pick an agent",
  "Connect to org").
- Replace blank spinners with skeleton loaders (8 rows for tree, 5 cards for
  interaction list, 3 step-cards for timeline).
- First-class error cards with retry button.
- Distinguish "no org connected" from "no agents in this org" from "permission
  denied".

### N5 — Refresh button per panel (XS, ½d)
Inspector header, interaction list header, dependencies header, editor header.
One handler each, dispatches existing fetch thunk. No more page-reloads.

### N6 — Inspector type-ahead search (S, 1d)
Single text input above tree. Fuzzy match across agent / topic / action labels.
Highlights matches. Solves Maya's #1 complaint at >50 agents.

### N7 — URL state for selection + lens (S, 1d)
`?applicationName=agentforce&tab=debugger&agentId=…&conversationId=…&stepId=…`.
Mirror the `recordviewer/app/app.ts:62-69` pattern with
`@wire(CurrentPageReference)`. Unlocks deep-linking, sharing, bookmarks.

### N8 — Conversation-ID deep link + jump-to-first-error (S, 1d)
- Honor `?conversationId=…` → land on debugger tab, auto-select interaction,
  scroll to first failed step.
- "Jump to error" button on playback bar (keyboard `F8`).
- Failed-first sort on interactions list (Failed/Timeout pinned to top, color
  banded).

### N9 — Cross-app links from dependency graph + step rows (S, 1d)
Wire SVG node clicks (the graph is currently dead). Add commands that don't
exist yet:
- `recordviewer.open({recordId})` (one-line addition in
  `recordviewer/app/app.ts`).
- `code.openMetadata({type, name})` (electron-only fallback to "open in Setup"
  on web).

Then in agentforce: dependency Flow node → `code.openMetadata`; Apex node →
same; debugger step row "Open record" → `recordviewer.open`; step input
containing SOQL → `soql.executeQueryIncognito` (already registered).

### N10 — Slash commands (XS, ½d)
Add to `agentforce.manifest.json`:
- `/agent <name>` → `agentforce.openAgent`
- `/trace <id>` → `agentforce.openTrace`
- `/topic <name>` → `agentforce.openTopic`
- `/agentforce-debugger`, `/agentforce-deps`

Pattern at `applications/soql/app/app.ts:56-110`.

### N11 — Token sheet hookup + color reconciliation (S, ½d)
- **`shared/agentlensTokens.css` is never imported.** Wire it into `app.css`
  and delete the duplicate token blocks at the top of `debugger.css`,
  `dependencies.css`, `llmDetail.css`, `playbackBar.css`, `variableDiff.css`,
  `editor.css`.
- Define `--af-color-agent / topic / action / flow / apex` once. Replace 4
  different agent-blues across inspector / dependencies legend / debugger badge
  / llm detail.
- Add foreground variants (`--af-cyan-text`, `--af-green-text`,
  `--af-orange-text`) at AA-passing contrast for body text uses.

### N12 — Compress debugger toolbar (S, ½d)
Today: 4 stacked rows × ~40px = 160px of chrome before first step row visible.
Collapse summary + playback + filter + search into one row with a "Filters (5)"
disclosure. Reclaims ~120px → doubles visible timeline rows on a 13" laptop.

### N13 — Step-card name in collapsed header (XS, ½d)
Currently shows badge type + duration + tokens. Add the step's
human-readable name (it's already in the data). Lets users scan a 1000-step
trace without expanding.

### N14 — Wire 2 analytics events (XS, ½d)
`agentforce.app_opened`, `agentforce.agent_selected`. Without this we can't
measure anything from Horizon 2 onward.

### N15 — First test files (M, 2d)
Add `applications/agentforce/**/__tests__/*.test.ts` to `npm run test` glob.
Write the 3 highest-leverage:
- `dependencies/__tests__/graphAnalysis.test.ts` — pure functions, cycles,
  centrality, diameter on 5 fixtures.
- `slices/__tests__/agents.test.ts` — selectAgent / setApiMode / fetchAgents
  reducer behaviors. Catches the regression that just landed.
- `slices/__tests__/debugger.test.ts` — playback FSM (next/prev/toggle/filter).

### N16 — Type safety pass (S, 1d)
- Define `AgentforceStoreShape` in `slices/types.ts` (replaces 5 copies of
  `storeChange({…}: any)`).
- Type `treeData`, `currentModel: monaco.editor.ITextModel`, `MermaidApi`
  interface, `_parsedInput/_parsedOutput` shapes.
- Drop ~20 of 25 `any`s.

**Horizon 1 done criteria:**
- Maya finds any agent in <5s (search).
- Raj lands on a failing step from a conv-ID URL in <10s (deep link).
- Nothing silently fails (every error reaches the footer).
- Mermaid graph nodes click through to flow / apex / record.
- The token sheet is the source of truth.
- 3 test files green; CI runs them.

**Total Horizon 1: ~10 dev-days.** Ship as v1, write release notes.

---

## Horizon 2 — NEXT (1–2 months, ~4 dev-weeks)

> Goal: differentiation. Beat native Setup on the things Setup can't do.
> Persona: Maya (broken refs + health), Lin (A/B + cost), Diego (export +
> health score).

### X1 — Broken-reference detection (M, 3d)
Flag actions whose `FlowDefinitionId` resolves to missing or inactive Flow,
or Apex class that doesn't exist. Surface in:
- Inspector tree → red dot on action node, tooltip with reason.
- Dependencies graph → red node + "Broken reference" insight count.
- Health score (X2).

`fetchDependencies` already pulls FlowDefinition status (`agents.ts:367-375`)
— just needs to consume it.

### X2 — Agent health score card (M, 2d)
Single panel above viewer when an agent is selected:
`# topics · # actions · cycle count · bottleneck label · broken refs · failure rate (24h)`.
This is the artifact Diego links in PR review. Cheap once X1 + debugger
counts exist.

### X3 — Pagination + virtualization (M, 3d)
- `GenAiInteraction`: drop `LIMIT 50`. Keyset paginate on `StartTime DESC`,
  window 25, "Load older" button.
- `GenAiInteractionStep`: replace `autoFetch maxFetch 10000` with `LIMIT 200`
  + lazy fetch by `StepOrder` ranges as user scrolls. Use `responseTarget:
  'QueryResult'` + `queryMore`.
- Virtualize step list — incremental render with intersection observer
  (LWC-friendly approach; SLDS doesn't ship a virtualizer).

### X4 — Memoize step list + graph analysis (S, 1d)
- `debugger.ts:242-286` `stepList` getter recomputes per render. Cache on
  `(steps, filters, searchQuery, currentStepIndex, expandedSteps)`.
- `graphAnalysis.analyze()` — memoize on graph hash; the function is already
  pure.
- Move analysis into a worker via `host-api/worker` (~½d on top — graph
  analysis is JSON-serializable).

### X5 — Bookmark / annotate / share steps (S, 1d)
- `bookmarks` array in debugger slice, persisted to localStorage per
  interaction.
- "Copy permalink" on each step (uses URL state from N7).
- "Copy as repro bundle" — JSON `{agentId, conversationId, stepId, input,
  output, timestamp, orgInfo}` for Slack-paste.

### X6 — LLM-call A/B diff (M, 2d)
Pin two LLM-call steps (same or different interactions). Side-by-side prompt
diff + response diff + token delta. Reuses the existing `variableDiff`
component pattern.

### X7 — Editor v2: real `.agent` source view (M, 2d)
Drop the synthetic AgentScript DSL (`editor.ts:37-83`). Render
`selectedScriptContent.agentSource` from `AiAuthoringBundle` (already loaded).
Add a header with file path + lock icon (read-only watermark) + "Copy" /
"Open in Setup".

The synthetic DSL is the single biggest piece of debt — it pretends to be a
file that was never on disk. Removing it is a *negative* code change.

### X8 — Step renderer registry (M, 2d)
`shared/stepRendererRegistry.ts`: `registerStepRenderer(stepType, ComponentTagName)`.
Default registrations: planner JSON view, topic-classification view,
`llmDetail`, `variableDiff`. New step types from Salesforce (Reasoning, RAG,
MCP) become drop-in renderers without forking the debugger.

### X9 — Action-type renderer registry (M, 2d)
Today `viewer.ts:146-155` hardcodes `actionFields`. Make it a registry:
`registerActionTypeRenderer(type, {fields, jumpCommand})`. Renderers for
`flow`, `apex`, `prompt`, `headlessAction`, `apiAction`, `dataCloudAction`.
Each declares its own jump-out command — dependency graph + viewer use the
same registry.

### X10 — Inspector grouping + favorites + status badges (S, 1d)
- Pin up to 3 frequently-used agents to the top, persisted in `cacheManager`.
- Group by status (Active / Inactive / Draft).
- Status badges on nodes ("3 errors today") wired from debugger slice — solves
  the "where do I start my day" question.

### X11 — Dependencies graph polish (M, 2d)
- Make the graph interactive (currently zoom/pan only — node click does
  nothing). Click → focus + side panel.
- Minimap + node-type filter checkboxes.
- Search with highlight.
- Export as SVG / PNG / mermaid markdown (one click, copies to clipboard).

### X12 — A11y pass (M, 2d)
Run the `eq-accessibility` skill. Concrete fixes:
- Tree nodes need `role="button"` or proper keyboard handlers (currently
  bare `<div onclick>`).
- Tree expand/collapse on Enter/Space.
- Focus rings (`--af-focus-ring` token).
- Color contrast cleanup (already partially done in N11).
- Replace emoji insight icons with SLDS utility icons (semantic + screen-reader
  friendly).

### X13 — Settings component (S, 1d)
Per `apps/docs/docs/developer/new-application.md:163-209`:
`agentforce_default_tab`, `agentforce_max_interactions`,
`agentforce_default_playback_speed`, `agentforce_show_apimode_toggle`,
`agentforce_compact_mode`.

### X14 — Skill markdown for agent assistant (XS, ½d)
`assets/shared/skills/agentforce-debugging.SKILL.md`,
`agentforce-promotion.SKILL.md`, `agentforce-onboarding.SKILL.md`.
Auto-loaded by `tools/scripts/generate_manifest_skill.js`.

### X15 — Icon system migration (M, 1.5d)
Standardize on SLDS utility (chrome) + SLDS standard (object types). Drop
unicode geometric, emoji, ASCII text. 5 icon systems → 2.
Files: `inspector.html` (toggle), `playbackBar.html` (arrows),
`debugger.html` (status), `dependencies.html` (insights + zoom).

### X16 — Spacing + typography token scale (S, 1d)
Add `--af-space-1..6`, `--af-text-xs..lg`, `--af-weight-medium/semi/bold`.
Refactor debugger as exemplar. Pre-req for compact mode + dark mode.

**Horizon 2 done criteria:**
- App does something Setup cannot: broken-ref detection, A/B diff, repro
  export, dependency graph clickthrough.
- Step list renders smoothly at 1000+ steps.
- Architects link us in PR reviews (because of X2 + X11 export).
- One contributor can ship a custom step renderer without forking.

**Total Horizon 2: ~4 dev-weeks.** Ship as v1.5 with announcement.

---

## Horizon 3 — LATER (quarter+)

> Goal: platform bets. Open the surface, go cross-org, go live.
> Persona: Maya (cross-org), Raj (live + replay), Diego (org-level audit).

### L1 — Cross-org agent compare ★ (XL, 2 weeks)
The differentiation play. Pick two connectors → render two trees side-by-side
with delta annotations on the dependency graph (added/removed/changed nodes),
prompt-template text diff. Setup cannot do this.

Spike (2 days) before commit:
- Reuse `applications/textCompare/` for the text diff?
- What's the diff unit — agent? topic? individual record?
- Salesforce stable agent-version concept to lock against?

Flag-gated. Default off until 2-3 design partners validate.

### L2 — Editor write-back ★ (XL, 3 weeks)
DSL or form-based edit of an agent's topic/action with Metadata API deploy,
dry-run preview, conflict detection, rollback.

3-day spike before commit (`AiAuthoringBundle` deploy round-trip).
Flag-gated. Behind confirmation modal + dry-run preview. Default off.

### L3 — Live conversation streaming ★ (XL, 2 weeks)
Pub/Sub API subscription for `GenAiInteractionChangeEvent`. "Live tail"
toggle on debugger. Requires a worker for gRPC-over-HTTP plumbing
(jsforce may not have it natively — verify in 1-day investigation; **kill if
no native channel**, polling won't pass governor limits).

### L4 — Token-cost leaderboard (M, 1w)
Top-10 most expensive interactions (7d / 30d), per-agent trend, per-topic
breakdown, per-prompt-template cost. For Lin.

### L5 — Plugin surface (L, 1.5w)
Public-document the registries:
- `registerStepRenderer` (X8)
- `registerActionTypeRenderer` (X9)
- `registerGraphDecorator` (new — annotations on dependency graph)
- `registerMonacoLanguage('agentscript', …)` (when Salesforce ships official
  grammar)

Plus event bus (`shared/eventBus.ts`) for agent-aware apps.
First plugin: ToolCalls panel as a custom renderer (dogfood).

### L6 — Org-level audit report (M, 1w)
"Agentforce posture" PDF / markdown export covering all agents, their health
scores, broken refs, top-cost prompts. For Diego's QBR meetings.

### L7 — Step-by-step replay with override (XL, conditional)
Edit planner output, re-run from step N. Hard — depends on Salesforce
exposing a "resume from step" API. Spike + park as roadmap-pending.

### L8 — Dark mode + theme variants (M, 1w)
`[data-theme="dark"]` overrides on `--af-*` tokens. Match Monaco theme.
Verify all foreground/background pairs against AA in dark.
High-contrast theme toggle for AAA.

### L9 — Conversation simulator (XL, conditional)
Replay an interaction's input through the *current* agent definition
post-edit. Magical, depends on agent-runtime API. Spike → kill or commit.

### L10 — Web app responsive pass (M, 1w)
Today the app assumes 1440px+. Inspector → drawer below 900px, toolbars →
overflow disclosure, mobile-friendly tab bar.

---

## Cuts — what we are NOT building

- **In-app chat / voice surface for testing agents.** That's Setup's job.
- **Authoring from scratch** ("Create new agent" button). Explorer first;
  authoring is Salesforce's roadmap.
- **YAML / JSON view toggle in editor.** The "Copy JSON" already lives in
  viewer.
- **Generic Bot debugger covering legacy Einstein Bots.** Agentforce-only.
- **Marketplace / template gallery.**
- **Mobile-first.** Workbench is desktop-first; do not invest.
- **Replace Mermaid with custom layout engine (cytoscape / d3-dagre).**
  Solves the wrong problem — we don't need richer layouts, we need fewer
  re-renders and a worker.

---

## Cross-cutting work (touches every horizon)

- **Tests as ongoing tax**, not a separate roadmap line. Every Horizon 1+
  item lands with at least a slice / pure-function test.
- **`auto-roadmap/` cleanup** per CLAUDE.md: when an item ships, remove
  it from this file or strike it through.
- **Telemetry**: N14 establishes the baseline. Every Horizon 2 item declares
  its own analytics events.
- **Settings**: each new flag in Horizon 3 strategic bets goes through X13's
  settings component, not bare flags.

---

## Risks & open questions

1. **Salesforce ships their own equivalent in Setup.** Mitigation: lean hard
   into cross-org (L1) and cross-app linking (N9, X9) — structurally outside
   Setup's reach.
2. **Tooling-API field shape changes between releases.** `BotDefinition`,
   `GenAiInteractionStep` are recent. Wrap field lists in a constants file +
   on `INVALID_FIELD` retry without the failing field.
3. **`AiAuthoringBundle` format churn.** Bundle layout iterates; our retrieve
   silently produces empty source if files rename. Log unknown extensions.
4. **Mermaid version pin.** 10→11 broke `classDef` directives (we use them).
   Lock version in `package.json`, add render smoke test.
5. **Pub/Sub API availability** in jsforce-bundled distribution. Investigate
   in week 1 of L3 spike. Kill bet if absent.
6. **`flow-explorer` app does not exist.** Several proposed cross-app jumps
   assume it. Either build (separate scope) or fall back to Setup deep-link.
7. **`code` app `isElectronOnly: true`.** Web users can't click through to
   Apex/Flow source. Either expose web-shaped "open in Setup" URL builder or
   accept degraded web UX.
8. **Two "selection" mental models** (selected agent in Inspector vs. global
   conv-ID search in Debugger). Not a bug today but blocks Horizon 2 IA
   refactor — pick one before X1.

---

## File reference map

Hot-spots cited above (absolute paths from
`/Users/grebmann/Documents/personnal/projects/code/sf-toolkit-web/`):

- `packages/lwc/applications/agentforce/agentforce.manifest.json`
- `packages/lwc/applications/agentforce/app/app.ts`
- `packages/lwc/applications/agentforce/app/app.html`
- `packages/lwc/applications/agentforce/inspector/inspector.ts`
- `packages/lwc/applications/agentforce/viewer/viewer.ts`
- `packages/lwc/applications/agentforce/debugger/debugger.ts`
- `packages/lwc/applications/agentforce/dependencies/dependencies.ts`
- `packages/lwc/applications/agentforce/dependencies/graphAnalysis.ts`
- `packages/lwc/applications/agentforce/editor/editor.ts`
- `packages/lwc/applications/agentforce/llmDetail/llmDetail.ts`
- `packages/lwc/applications/agentforce/variableDiff/variableDiff.ts`
- `packages/lwc/applications/agentforce/playbackBar/playbackBar.ts`
- `packages/lwc/applications/agentforce/slices/agents.ts`
- `packages/lwc/applications/agentforce/slices/debugger.ts`
- `packages/lwc/applications/agentforce/shared/agentlensTokens.css` (orphaned!)
- `packages/lwc/main/agent/tools/modules/agentforceTools.ts` (line 36 bug)
- `packages/lwc/main/host-api/connector.ts` (target for `runSoqlQuery`)
- `packages/lwc/main/host-api/commands.ts`
- `packages/lwc/main/host-api/store.ts` (`reportError`)
- `apps/docs/docs/developer/new-application.md`

Reference patterns:
- `applications/recordviewer/app/app.ts:62-69` — URL routing via
  `CurrentPageReference`.
- `applications/soql/app/app.ts:56-110` — `registerCommand` exemplar.
- `applications/soql/__tests__/` — colocated test pattern.
- `shared/modules/toolingApi/toolingApi.ts:312-342` — proven SWR cache
  primitive (`runAndCacheQuery`).

---

## Sequencing — engineer's preferred order

**Days 1-2 (week 1):** N1, N2, N3, N16 — fix bug, kill duplication, surface
errors, type the store. Foundation.

**Days 3-5 (week 1):** N4, N5, N6, N7, N8 — UX gaps. Empty states, refresh,
search, URL state, conv-ID deep link.

**Days 6-7 (week 2):** N9, N10, N15 — cross-app links, slash commands, first
test files. Cross-app needs the recordviewer/code commands added too — that's
1 line each in those apps.

**Days 8-10 (week 2-3):** N11, N12, N13, N14 — visual reconciliation,
toolbar compress, step name, analytics. Ship Horizon 1.

**Weeks 4-5 (Horizon 2 start):** X1, X2, X3 — broken refs, health card,
pagination. Persona delight + scale credibility.

**Weeks 6-7:** X4, X5, X6, X7 — perf memoization, share/bookmark, A/B diff,
real `.agent` editor.

**Week 8:** X8, X9, X10, X11 — registries, inspector grouping, graph polish.

**Weeks 9-10:** X12, X13, X14, X15, X16 — a11y, settings, skills, icons,
spacing tokens. Ship Horizon 2.

**Quarter+:** Horizon 3 by strategic-bet ranking — L1 > L2 > L3 > everything
else. Spikes always before commit.

---

## Success metrics (per PM)

- **Activation:** 30% of Workbench WAUs with Agentforce-enabled orgs open the
  app within 7 days of v1 release.
- **Retention:** 15% D7 return rate among activated users.
- **Task time:** P50 < 30s "find a failing step" (Raj); P50 < 15s "audit
  agent" (Maya).
- **Qualitative:** GitHub issues with `agentforce` label, Slack feedback,
  2 design-partner interviews/quarter.

Without N14 (analytics events) the first three are aspirational. Don't skip it.
