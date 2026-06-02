# Agentforce Explorer — Detailed Roadmap (Consensus-Reviewed)

> **How this document was produced.** Four architects reviewed the high-level
> roadmap (`auto-roadmap/agentforce-explorer-roadmap.plan.md`) under four
> distinct lenses: **Pragmatist (P)**, **Quality / long-term (Q)**, **Platform /
> boundary (PL)**, **Performance / scale (PF)**. Each voted `AGREE` /
> `MODIFY` / `REJECT` on every item with file:line evidence and was required
> to disagree on at least three items. **Only items with ≥3/4 convergence are
> adopted below.** Where any architect modified an item, the union of
> modifications is merged into the final spec. Items with ≥2 REJECTs are
> moved to the **Killed** appendix. The full **Dissent log** at the end
> records every disagreement and why the team converged.
>
> **Consensus rule.** Every adopted item lists the vote tally. If you read
> something in the spec and ask "why did we do it this way?", the answer is
> in the modification notes for that item or in the Dissent log.

---

## Critical fact corrections (found during review)

The high-level draft contained four factual errors that propagate into
multiple items. Fix once, then act on the corrected facts everywhere.

1. **`runAndCacheQuery` SWR primitive does not exist** at
   `shared/modules/toolingApi/toolingApi.ts:312-342`. Those lines are tail
   of `toolingQueryAll` + `listApexClasses/Triggers`. The real
   `runAndCacheQuery` lives in `applications/metadata/slices/metadata.ts:312`,
   has no in-flight dedupe, no TTL, no schema versioning, and call sites
   pass 4 args to a 3-arg signature. **Treat SWR caching as something to
   build, not reuse.** See item **F2** below.
2. **The bug is two lines, not one.** `packages/lwc/main/agent/tools/modules/agentforceTools.ts:36` AND `:60` both query the renamed-out `GenAiPlanner` entity. Item N1 must fix both.
3. **`npm run test` glob already covers `applications/**`.** No glob change
   needed for N15 — just write the tests.
4. **The silent-catch count is 6, not 8.** Real sites: `slices/agents.ts:213, 306, 329, 344` and `slices/debugger.ts:111, 134`. The draft's claim of "inline catches in `dependencies.ts`, `editor.ts`" is false — those files have zero such catches.

Additional platform/perf truths the architects established:

5. **`host-api/connector.ts` is types-only** (9-line re-export). Adding
   runtime functions there violates the host-api contract per
   `host-api/README.md`. The shared `runSoqlQuery` helper goes in
   `shared/modules/soqlQuery/`, not `host-api/connector.ts`.
6. **jsforce ships CometD, not Pub/Sub gRPC.** L3's "Pub/Sub API" framing
   is wrong on the technology — only feasible path is CometD CDC subscribe
   to `/data/GenAiInteractionChangeEvent` *if* Salesforce ships CDC for
   that entity.
7. **`existing` cross-app `invokeCommand` sites in `shell.ts:618,655,688`
   do NOT use `hasCommand` guards** — that's a latent bug, not a pattern
   to perpetuate. All new cross-app calls must `hasCommand` first.
8. **The roadmap's autoFetch defaults are production-hostile.**
   `slices/agents.ts:185-189` defaults to `autoFetch: true, maxFetch: 10000` —
   any helper that inherits this verbatim makes every future feature ship
   the same 50-roundtrip foot-gun. Default to `first-page` cap 200, with
   explicit opt-in for autoFetch.

---

## F — Foundation items (pre-Horizon-1 prerequisites)

These items emerged from the consensus review as load-bearing for everything
else. Each must land before the H1 items that depend on it.

### F1 — Move agent tools off `core/*` imports
**Vote: 4/4 AGREE (cross-cutting).** Pragmatist + Platform both flagged it.
- **Files:** `packages/lwc/main/agent/tools/modules/agentforceTools.ts:1-3`
  currently imports `from 'core/connector'` and `from 'core/store'`.
  Should import from `host-api/store` per the README treaty.
- **Effort:** XS (¼d). Trivial path rewrite, but lock the boundary now.
- **Acceptance:** `grep -n "from 'core/" packages/lwc/main/agent/tools/modules/agentforceTools.ts` returns 0 results.
- **Sequencing:** Lands in the same change as N1 (the bug fix).

### F2 — Build the SWR cache primitive that the original draft assumed existed
**Vote: 3/4 AGREE (Pragmatist would defer until 2nd consumer).** Performance is
emphatic; without it, X3/X4/X10/L4/L6 inherit dead-reference assumptions.
- **Files:**
  - **NEW** `packages/lwc/shared/modules/swrCache/swrCache.ts`
  - **NEW** `packages/lwc/shared/modules/swrCache/__tests__/swrCache.test.ts`
- **Contract:**
  ```ts
  export interface SwrOptions { ttlMs: number; staleWhileRevalidateMs: number; }
  export interface SwrEntry<T> { data: T; fetchedAt: number; revalidating: boolean; }
  export function swr<T>(
      key: string,
      loader: () => Promise<T>,
      opts: SwrOptions,
  ): Promise<T>;
  export function invalidate(keyPrefix: string): void;
  ```
  Keyed on `(orgId, soql, mode)`. In-flight dedupe via promise map.
  Cache scope: in-memory per session (no localStorage for transcripts —
  PII risk).
- **Effort:** S (1d).
- **Acceptance:**
  - In-flight dedupe verified by test (2 concurrent `swr(k, …)` calls →
    1 loader invocation).
  - Test for stale-while-revalidate: returns stale, fires background
    refresh, next call returns fresh.
  - Test for TTL: hard expiry past `ttlMs + staleWhileRevalidateMs`.
- **Sequencing:** Before X1 / X4 / X10 / L4 / L6. Not blocking H1 N-items.
- **Risks:** None. Cache is opt-in per call site.

### F3 — Type the host `CommandPayloads` map
**Vote: 4/4 AGREE.** Quality non-negotiable. Platform supports.
- **Files:**
  - **EDIT** `packages/lwc/main/host-api/commands.ts` (add typed payload map)
  - **NEW** `packages/lwc/main/host-api/__tests__/commands.test.ts`
- **Contract:**
  ```ts
  export interface CommandPayloads {
      'agentforce.open': void;
      'agentforce.openAgent': { agentId: string; tab?: AgentforceTab };
      'agentforce.openTrace': { conversationId: string; stepId?: string };
      'recordviewer.open': { recordId: string };
      'soql.executeQueryIncognito': { soql: string };
      'soql.open': void;
      'api.executeRequest': { request: ApiRequest };
      'anonymousApex.executeApex': { code: string };
      // ... future entries appended over time
  }
  export function invokeCommand<K extends keyof CommandPayloads>(
      id: K, payload: CommandPayloads[K]
  ): Promise<unknown>;
  ```
- **Effort:** S (½d).
- **Acceptance:**
  - All existing `invokeCommand` call sites compile against the map.
  - Adding an unmapped command-id is a TypeScript error.
- **Sequencing:** Before N9, N10. Pre-H1.
- **Risks:** Low. Existing call sites in `shell.ts` may surface incomplete
  type info — fix as you go.

### F4 — Setup-URL builder
**Vote: 4/4 AGREE.** Platform identified the gap; needed by N9, X7, X11.
- **Files:**
  - **NEW** `packages/lwc/shared/modules/sf/setupUrl.ts`
- **Contract:**
  ```ts
  export type SetupTarget =
      | { type: 'Flow'; name: string }
      | { type: 'ApexClass'; name: string }
      | { type: 'BotDefinition'; id: string }
      | { type: 'Record'; id: string };
  export function buildSetupUrl(orgInstanceUrl: string, target: SetupTarget): string;
  ```
- **Effort:** XS (¼d).
- **Acceptance:** 4 fixture-based tests for each target type.
- **Sequencing:** Before N9.
- **Risks:** None.

---

## Horizon 1 — NOW (target: ~12 dev-days)

> Goal: stop the bleeding. Make the existing app feel finished.
> Persona: Maya + Raj equally.

### N1 — Critical bug fix + agent tool surface
**Vote: 4/4 MODIFY.** Splits cleanly into N1a + N1b.

**N1a — Bug fix (ships day 1)**
- **Files:** `packages/lwc/main/agent/tools/modules/agentforceTools.ts` —
  edit lines 36 AND 60 (both query `GenAiPlanner`); update `description`
  strings; refresh tool zod descriptions referencing the entity.
- **Effort:** XS (½d incl. one regression test).
- **Acceptance:**
  - Both tool SOQL strings contain `BotDefinition`.
  - One unit test asserts each tool's SOQL contains `FROM BotDefinition`.
  - Manual smoke: `agentforce_list_agents` returns ≥1 agent in a
    populated org.
- **Sequencing:** Ships independently, day 1. Blocks nothing.
- **Telemetry:** None.
- **Risks:** Field semantics drift between `GenAiPlanner` and
  `BotDefinition` — verify `Description` column maps cleanly. 30-min
  jsforce check.

**N1b — Two new agent tools (after N7)**
- **Files:** Same module; +80 LOC for two tools + tests.
- **Contract:**
  ```ts
  agentforce_get_interaction_steps({ interactionId: SalesforceId })
      → { steps: GenAiInteractionStep[]; truncated: boolean }
      // First-page only, cap 200. Truncation flag honest.
  agentforce_open_in_explorer({ agentId: SalesforceId; tab?: AgentforceTab })
      → { ok: true } | { error: 'Agentforce app not loaded' }
      // MUST guard: hasCommand('agentforce.openAgent') before invoke.
  agentforce_list_agents({ query?: string; limit?: number /*default 50, cap 200*/ })
      // Modified from existing — adds query+limit to prevent token blowout
      // at 1000-agent orgs.
  ```
- **Effort:** S (1d incl. tests).
- **Acceptance:**
  - 5+ test cases per tool (zod schemas, valid args, invalid IDs, missing
    command, truncation flag).
  - `agentforce_open_in_explorer` returns structured error if command
    missing — does **not** throw.
- **Sequencing:** After N7 (so `tab` arg is meaningful) and F3 (so
  `invokeCommand` is typed).
- **Risks:** Tool prompt token blowout if `agentforce_list_agents` returns
  1000 rows uncapped — addressed by query/limit params.

### N2 — Extract `runSoqlQuery` helper
**Vote: 4/4 MODIFY.** Hottest item in the review. **Do not put in
`host-api/connector.ts`.**

- **Files:**
  - **NEW** `packages/lwc/shared/modules/soqlQuery/soqlQuery.ts` (~120 LOC)
  - **NEW** `packages/lwc/shared/modules/soqlQuery/__tests__/soqlQuery.test.ts` (~150 LOC)
  - **NEW** `packages/lwc/main/host-api/soql.ts` — thin re-export only
  - **EDIT** `packages/lwc/applications/agentforce/slices/agents.ts` (delete
    lines 165-191; rewrite call sites at 213, 306, 329, 344)
  - **EDIT** `packages/lwc/applications/agentforce/slices/debugger.ts` (delete
    lines 65-92; rewrite call sites at 111, 134)
  - **EDIT** `packages/lwc/main/agent/tools/modules/agentforceTools.ts`
    (replace inline `toolingQuery`)
- **Contract:**
  ```ts
  export type SalesforceId = string & { __brand: 'SalesforceId' };
  export function asSalesforceId(s: string): SalesforceId; // throws if invalid
  export function escapeSoqlLiteral(s: string): string;    // rejects \n; escapes '
  export interface SoqlOptions {
      mode?: 'tooling' | 'data';                // default: 'tooling'
      paging?: { mode: 'first-page'; cap: number }
             | { mode: 'auto-fetch'; cap: number };
      // Default: { mode: 'first-page', cap: 200 }.
      // 'auto-fetch' requires SOQL to contain LIMIT (validated; throws in dev).
      requestId?: string;                        // for in-flight dedupe (F2)
  }
  export function runSoqlQuery<T>(
      connector: ConnectorLike, soql: string, opts?: SoqlOptions,
  ): Promise<T[]>;
  ```
- **Effort:** M (1.5d). Includes tests on the security-relevant primitive.
- **Acceptance:**
  - Test coverage ≥85% on the new module.
  - `escapeSoqlLiteral("O'Brien")` returns `O\\'Brien`; rejects `\n`.
  - `asSalesforceId('foo')` throws.
  - All three duplicate `soqlQuery` functions deleted (deletion target:
    50+ lines net negative).
  - No new `: any`.
- **Sequencing:** After N16 (typed store first); before N3, N1b.
- **Risks:** If escape semantics are wrong, SOQLi gets *worse*. Tests on
  escape are non-negotiable.

### N3 — Replace silent `catch { return [] }` with `reportError`
**Vote: 4/4 (2 AGREE, 2 MODIFY).** Adopt with the modifications.
- **Files:**
  - `packages/lwc/applications/agentforce/slices/agents.ts` (4 catches at
    213, 306, 329, 344)
  - `packages/lwc/applications/agentforce/slices/debugger.ts` (2 catches at
    111, 134)
  - **NEW** `packages/lwc/shared/modules/sliceHelpers/handleSliceError.ts`
  - **NEW** `applications/agentforce/slices/__tests__/agents.test.ts`
  - **NEW** `applications/agentforce/slices/__tests__/debugger.test.ts`
- **Contract:**
  ```ts
  export function handleSliceError(scope: string, err: unknown): never {
      reportError(err, { source: scope });
      throw err; // let createAsyncThunk's rejected handler run
  }
  ```
  **One** call per error path — never `reportError` AND let the thunk
  reject double-count. Apply 250ms dedupe by `(opName, message)` to avoid
  toast spam during playback flapping.
- **Stale-vs-clear policy** (decide explicitly per slice field):
  - `agents` list: **keep stale** on rejection (Maya can keep working).
  - `topics`/`actions` (scoped to selection): **clear** on rejection (stale
    = misleading).
  - `interactions`: **keep stale**.
  - `steps` (scoped to interaction): **clear**.
- **Distinguish error classes** via SOQL error codes:
  `INSUFFICIENT_ACCESS_OR_READONLY` → "permission denied";
  `INVALID_TYPE` → "entity not available in this org";
  network 5xx → "service error".
- **Effort:** M (1d, including test scaffolding for slice unit tests that
  doesn't exist yet for this app).
- **Acceptance:**
  - All 6 silent catches deleted.
  - `state.error` non-empty on rejection.
  - `reportError` called exactly once per rejection (mock spy).
  - Stale-vs-clear behavior tested per field.
  - No new `any`.
- **Sequencing:** After N2.
- **Risks:** Behavior change. Add release-notes line: "errors that were
  previously silent now appear in the footer".

### N4 — Empty / loading / error states pass
**Vote: 3/4 AGREE, 1 MODIFY (Pragmatist cuts SVGs).** Compromise: keep
small (≤2KB inline) SVGs but centralize them.
- **Files:**
  - **NEW** `applications/agentforce/shared/emptyStates/emptyStates.ts` (named entry, lookup map)
  - **NEW** 4× SVGs in same dir (or one file with `<symbol>` defs), each ≤2KB
  - **EDIT** `inspector.html`, `debugger.html`, `dependencies.html`, `editor.html`
- **Contract:**
  ```ts
  <c-empty-state kind="debugger" cta-label="View last 7d" oncta={…} />
  ```
  Branches per state: `no-org` (handled by host shell, do NOT re-implement),
  `no-data`, `permission-denied`, `error` (with retry).
- **Skeleton loaders:** inspector tree (8 rows), interaction list (5
  cards). Step timeline keeps regular spinner — load is sub-200ms typical.
  Skeletons: `role="status" aria-live="polite"`, static template fragments
  (no `Array.from` over @track).
- **Effort:** S (1d).
- **Acceptance:**
  - 3 branches verified per panel via `<c-empty-state>` tests.
  - "No org" empty state is **not duplicated** inside agentforce —
    inherited from host shell.
- **Sequencing:** After N3.
- **Risks:** Visual regression — manual screen pass before merge.

### N5 — Refresh button per panel
**Vote: 3/4 AGREE, 1 MODIFY (Performance: debounce + in-flight guard).**
- **Files:** 4 panel `.html` + handlers (~10 lines each).
- **Contract:** `handleRefresh()` dispatches existing `fetch*` thunk with
  `{ bypassCache: true }`. Add `bypassCache` param to thunks now (unused
  until F2 lands; prevents future contract break).
- **Constraints:**
  - Disabled while `state.loading === true`.
  - Debounced 500ms.
  - Short-circuit if `lastFetchedAt < 2s ago`.
- **Effort:** XS (½d).
- **Acceptance:**
  - All 4 panels have refresh button.
  - Spinner on the button itself, not just the panel.
  - Test asserts thunk dispatched with `{ bypassCache: true }`.
- **Sequencing:** Independent.
- **Risks:** None.

### N6 — Inspector type-ahead search
**Vote: 3/4 AGREE, 1 MODIFY (Performance: substring + cap + debounce).**
- **Files:**
  - **NEW** `applications/agentforce/inspector/search/fuzzyMatch.ts`
  - **NEW** `applications/agentforce/inspector/search/__tests__/fuzzyMatch.test.ts`
  - **EDIT** `inspector.ts`, `inspector.html`
- **Contract:**
  ```ts
  export interface MatchResult { score: number; ranges: Array<[number,number]>; }
  export function fuzzyMatch(query: string, target: string): MatchResult | null;
  ```
  Algorithm: **substring + token-prefix**, NOT Levenshtein. O(n) with
  tiny constants. If real fuzzy required, lazy-load `fuse.js` (~13 KB gz)
  only when the search input opens.
- **Constraints:**
  - Build flat denormalized index `{id, label, type, parentId}[]` once
    per `agents/topics/actions` change, not per keystroke.
  - Debounce input 120ms.
  - Cap rendered hits at 50; show "+N more" pill.
  - Perf budget: <16ms per keystroke at 100k labels (1000 agents × 10
    topics × 10 actions).
- **Effort:** S (1.5d, raised from 1d for cap+denorm+debounce).
- **Acceptance:**
  - 8+ test cases (case-insensitive, multi-token, accent-insensitive,
    no-match, exact, with highlight ranges).
  - 50-cap test: query for `"a"` in 1000-agent fixture renders ≤50 rows.
- **Sequencing:** Independent.
- **Risks:** Without cap, `"a"` returns 30k matches → DOM dies.

### N7 — URL state for selection + lens
**Vote: 3/4 AGREE, 1 MODIFY (Quality: typed pageReference helper).**
- **Files:**
  - **NEW** `packages/lwc/shared/modules/pageReference/pageReference.ts`
  - **EDIT** `applications/agentforce/app/app.ts`
- **Contract:**
  ```ts
  export interface WorkbenchPageRef {
      type: 'application';
      state: { applicationName: string; [k: string]: string | undefined };
  }
  export function readAppState<K extends string>(
      pageRef: WorkbenchPageRef | null | undefined, app: string,
  ): Partial<Record<K,string>> | null;
  ```
  URL is **canonical** for selection — store reflects URL, not vice versa.
  Shape: `?applicationName=agentforce&tab=<inspector|debugger|dependencies|editor>&agentId=<id>&conversationId=<id>&stepId=<n>`.
- **Performance constraints:**
  - `storeChange` does not refetch on every URL update — compare prev/next
    selection.
  - `pageRef` JSON-equality short-circuit (mirror recordviewer pattern).
- **Effort:** S (1d).
- **Acceptance:**
  - Round-trip: select → URL update → reload → selection restored.
  - Browser back/forward works.
  - Invalid `agentId` falls back gracefully (no crash).
  - `readAppState` test rejects malformed inputs.
- **Sequencing:** After N16. Blocks N8, N9, N10, X5.
- **Risks:** Race conditions during URL hydration vs store dispatches —
  copy `recordviewer/app/app.ts:62-69` pattern exactly.

### N8 — Conversation-ID deep link + jump-to-first-error
**Vote: 3/4 AGREE, 1 MODIFY (Performance: server-side filter for first-error).**
- **Files:**
  - `debugger/debugger.ts` (+~40 LOC)
  - `slices/debugger.ts` (+~15 LOC for `jumpToFirstError`)
  - **EDIT** `slices/__tests__/debugger.test.ts` from N15.
- **Contract:**
  - `?conversationId=…` → switch to debugger tab, dispatch
    `selectInteraction`, on `fetchSteps.fulfilled` scroll to first failed
    step.
  - **Failed-first sort** on interactions list (already-loaded data, no
    extra round-trip).
  - **Jump-to-first-error**: Issue lightweight SOQL `WHERE Status='Error'
    AND GenAiInteractionId='…' ORDER BY StepOrder LIMIT 1` to find target
    `StepOrder`, then load step window centered on it. Until X3 lands,
    button disabled if first error not in current window.
  - F8 keyboard shortcut. Don't fire in inputs.
- **Effort:** S (1.5d, raised from 1d for the data plumbing).
- **Acceptance:**
  - URL with `conversationId` lands on debugger + selected interaction
    within 2 store ticks.
  - F8 jumps to first `Status === 'Error'`.
  - 3+ test cases for `jumpToFirstError` reducer.
- **Sequencing:** After N7.
- **Risks:** Without server-side filter, naïve impl loads all steps before
  scroll fires — 15-30s blocking on 5000-step interaction.

### N9 — Cross-app links from dependency graph + step rows
**Vote: 4/4 MODIFY.** Splits into N9a + N9b. Defer graph-node clicks to X11.

**N9a — Add `recordviewer.open` + step-row "Open record" button** (this round)
- **Files:**
  - **EDIT** `applications/recordviewer/app/app.ts` — register
    `recordviewer.open({recordId})` with module-scope bootstrap (mirror
    `soql/app/app.ts:49-118` pattern, NOT inline in `connectedCallback`).
  - **EDIT** `applications/agentforce/debugger/debugger.ts` (+~25 LOC)
  - **EDIT** `applications/agentforce/debugger/debugger.html` (button per
    step row)
- **Contract:** Parse `StepInput` for any 18-char Salesforce ID; if found,
  surface "Open record" button. Button calls
  `if (await hasCommand('recordviewer.open')) { invokeCommand('recordviewer.open', {recordId}) }
  else { window.open(buildSetupUrl(orgUrl, {type:'Record', id: recordId}), '_blank') }`.
- **Effort:** S (1d).
- **Acceptance:**
  - `recordviewer.open` registered + tested.
  - Step row with recordId → button → opens record.
  - Step row without recordId → no button.
  - `hasCommand` guard verified by mock.
- **Sequencing:** After F3 (typed CommandPayloads), F4 (setup URL).
- **Risks:** Wrong-Id false positives (validate against jsforce sobject
  prefixes if cheap; else accept and document).

**N9b — Add `code.openMetadata` (deferred to X11; budget here for awareness)**
- Pushed into X11 where it composes with the graph-node clickthrough work.

### N10 — Slash commands
**Vote: 3/4 MODIFY** (Pragmatist: 2 commands; Platform: namespace; Quality:
validator extension).
- **Files:**
  - `agentforce.manifest.json` (+~25 LOC)
  - `app/app.ts` — register handlers
  - **EDIT** `tools/scripts/generate_application_manifest.js` (+~15 LOC for
    commandId-shape validation; full registration check at runtime)
- **Slash commands shipped** (consensus on namespacing — `/agent` is too
  generic, collision risk with future `/agentscript`/`/agentchat`):
  - `/agentforce` → `agentforce.open` (existing — keep)
  - `/af-agent <name>` → `agentforce.openAgent` (fuzzy-match by label)
  - `/af-trace <id>` → `agentforce.openTrace`
- **Cut for now:** `/topic`, `/agentforce-debugger`, `/agentforce-deps` —
  no usage signal. Add when requested.
- **Effort:** S (1d, raised from ½d for validator extension).
- **Acceptance:**
  - 3 slash commands present + manifest-validated.
  - Boot-time warning for unregistered command IDs (new validator).
- **Sequencing:** After N7, F3.
- **Risks:** Low. Build-time dedupe catches collisions.

### N11 — Token sheet hookup + color reconciliation
**Vote: 3/4 AGREE, 1 MODIFY (Pragmatist: smaller scope).** Compromise:
hookup + one agent-blue this round; AA foreground variants in X12.
- **Files:**
  - `applications/agentforce/app/app.css` (+1 import line)
  - 6 component CSS files (delete duplicate `:root` blocks, ~10-30 LOC each)
  - `applications/agentforce/shared/agentlensTokens.css` (canonicalize)
- **Contract:** One source of truth. Define `--af-color-agent` once;
  replace 4 different agent-blue hexes. Reference SLDS where useful;
  `--af-*` for agentforce-specific concerns only.
- **Effort:** XS (½d).
- **Acceptance:**
  - Net deletion ≥80 LOC of CSS.
  - `grep -rn '#[0-9a-fA-F]\{6\}' applications/agentforce/` returns ≤5 hits.
  - All 4 "agent blue" hexes reconciled to `--af-color-agent`.
- **Sequencing:** Independent.
- **Risks:** LWC shadow DOM token inheritance — verify; hoist tokens to
  `:root` in `app.css` if needed.

### N12 — Compress debugger toolbar
**Vote: 4/4 AGREE.**
- **Files:** `debugger/debugger.html`, `debugger.css` (~80 LOC).
- **Contract:** One row: ⏮⏯⏭ + scrubber + step counter + speed + 🔍 search
  + ⚙ Filters (5) disclosure popover.
- **Constraints:** Filter popover renders only when open (no
  always-rendered `for:each`).
- **Effort:** S (½d).
- **Acceptance:**
  - Toolbar height ≤48px.
  - All controls accessible.
  - Active filter count visible on disclosure button.
- **Sequencing:** Independent.
- **Risks:** SLDS popover focus management — use existing pattern.

### N13 — Step-card name in collapsed header
**Vote: 4/4 AGREE (Performance gates on N16/X4 memo).**
- **Files:** `debugger/debugger.ts:262-285` (stepList getter) + step row
  template (~10 LOC).
- **Constraints:** Must not increase per-render allocation in `stepList`
  getter — gated by N16 (typed) and X4 (memoized) ideally landing first.
- **Effort:** XS (½d).
- **Acceptance:**
  - Each step row shows: type badge + name + duration + tokens.
  - Unknown name → falls back to type label.
  - Test for name-extraction helper.
- **Sequencing:** After N16, ideally after X4.
- **Risks:** At 5000 steps, unmemoized getter is the worst perf bug in the
  app. **N13 is the canary** — if slow after landing, X4 becomes P0.

### N14 — Wire 1 analytics event (was 2)
**Vote: 3/4 MODIFY** (Pragmatist: 1 event only; defer `agent_selected`).
- **Files:** `app/app.ts` (+5 LOC).
- **Contract:** Single `agentforce.app_opened` event via
  `host-api/analytics`. Defer `agentforce.agent_selected` (high-cardinality,
  low signal until UA shape stabilizes).
- **Effort:** XS (¼d).
- **Acceptance:** Event fires once on app activate.
- **Sequencing:** Move EARLY in week 1 (signal arrives sooner).
- **Risks:** Without instrumentation, success metrics are aspirational —
  state that explicitly in the success-metrics section.

### N15 — Test foundation (5 files + perf-budget test)
**Vote: 4/4 MODIFY.** Pragmatist: 2 files. Quality: 7 + coverage gate.
Platform: glob already exists (correct). Performance: add perf test.
**Synthesis: 5 files + ≥70% coverage TARGET (not gate yet).**
- **Files (all NEW):**
  - `dependencies/__tests__/graphAnalysis.test.ts` — pure-function tests
    for `findCycles`, `computeCentrality`, `computeDiameter` on 5 fixtures
    (linear, cycle, disconnected, single-node, 200-node random).
    **Plus a perf-budget test:** `analyze()` on 200-node fixture
    completes <50ms wall-clock on a single core.
  - `slices/__tests__/agents.test.ts` — selectAgent/setApiMode/
    fetchAgents.fulfilled/rejected (rejected branches from N3).
  - `slices/__tests__/debugger.test.ts` — playback FSM
    (next/prev/toggle/filter), `jumpToFirstError` (3 cases), `setFilter`
    cursor preservation.
  - `inspector/search/__tests__/fuzzyMatch.test.ts` — from N6.
  - `main/agent/tools/modules/__tests__/agentforceTools.test.ts` — from N1.
- **Effort:** M (2.5d).
- **Acceptance:**
  - All files green.
  - `npm run test` includes new files (glob already covers them).
  - Coverage *measured* and reported (target ≥70% on slices + pure
    modules); not yet a CI gate (avoid scope creep). Add as a separate
    item if CI tooling needs wiring.
- **Sequencing:** Land alongside the items they cover.
- **Risks:** None.

### N16 — Type safety pass (sequence FIRST)
**Vote: 4/4 MODIFY.** Quality: move FIRST, full scope. Pragmatist: scope
to store shape only. **Synthesis: move FIRST after N1a; scope to store
shape + treeData + currentModel + parsed shapes; defer Mermaid types to X11.**
- **Files:**
  - **NEW** `applications/agentforce/slices/types.ts`
  - **EDIT** 6 component files (storeChange, treeData, currentModel,
    parsed shapes)
- **Concrete typing:**
  ```ts
  // slices/types.ts
  export interface AgentforceStoreShape {
      agentforce: AgentforceState;
      agentforceDebugger: DebuggerState;
      application: { currentApplication: string;
                     connector: ConnectorLike | null };
  }
  type TreeNode =
      | { type: 'agent';  id: string; label: string; children: TreeNode[]; ... }
      | { type: 'topic';  id: string; label: string; children: TreeNode[]; ... }
      | { type: 'action'; id: string; label: string; ... };
  // editor.ts:15
  currentModel: import('monaco-editor').editor.ITextModel | null = null;
  // llmDetail.ts — define LlmStepInput / LlmStepOutput discriminated unions
  ```
- **`any` policy:** target ≤2 remaining `any`s in
  `applications/agentforce/**`, each marked
  `// TYPE-DEBT: <reason> — see <issue/item>`. The Mermaid `as any` at
  `dependencies.ts:187` keeps until X11.
- **Effort:** M (2d).
- **Acceptance:**
  - `grep -rn ': any\b\|as any\b' applications/agentforce/` returns ≤2
    lines, each annotated.
  - `tsc -p` clean.
  - Unit test asserts `AgentforceStoreShape` matches actual store snapshot.
- **Sequencing:** **SECOND** in H1 (right after N1a). Everything else
  builds on it.
- **Risks:** Strict typing surfaces real type errors elsewhere — budget
  ½d for fallout.

### N17 — Migrate all `GenAiPlanner` references in `agentforceTools.ts` (added)
**Vote: 4/4 AGREE** (Pragmatist found this; it expands N1a).
The bug isn't only at lines 36 and 60. The other 4 tool calls (lines 68,
74, 101, 124 per Pragmatist's note) also reference renamed-out entities.
Sweep the whole file in the same N1a change.

---

## Horizon 2 — NEXT (target: ~3 dev-weeks)

> Goal: differentiation. Beat native Setup on what Setup can't do.

### X1 — Broken-reference detection
**Vote: 3/4 AGREE, 1 MODIFY (Performance: chunked aggregates).**
- **Files:** `slices/agents.ts` (extend `fetchDependencies`), `inspector/`
  (red-dot rendering), `dependencies/` (red-node coloring).
- **Detection scope:**
  - Flow: `ActiveVersionId IS NULL` → "inactive". Missing from
    `FlowDefinition` query → "missing".
  - Apex: `WHERE Name IN (...)` against `ApexClass` — set difference
    from expected.
  - Prompt templates: same pattern against `GenAiPromptTemplate`.
- **Performance constraints:**
  - **Chunk by `WHERE Id IN (...)` 200 IDs max** per entity type.
  - Run 3 entity-type lookups in parallel (Promise.all), throttle ≤4
    concurrent.
  - Cache result per `selectedAgentId` for 5 min via F2 (SWR).
  - **No "scan all" button** — that belongs to L6 with its own budget.
- **Effort:** L (4d, raised from 3d for chunking + caching + Apex/Prompt
  resolution).
- **Acceptance:**
  - Action with deactivated Flow → red dot + tooltip.
  - Action with missing Apex → red dot + tooltip.
  - Action with missing prompt template → red dot + tooltip.
  - Single-agent scan <2s wall-clock; <1s with cache hit.
  - 8 test fixtures: Flow active/inactive/missing × Apex present/missing.
- **Sequencing:** After F2.
- **Risks:** "Scan all" temptation. Reject explicitly.

### X2 — Agent health score card
**Vote: 4/4 AGREE.**
- **Files:**
  - **NEW** `applications/agentforce/shared/health/healthScore.ts` (pure
    function)
  - **NEW** `viewer/healthCard.{ts,html,css}` (~120 LOC)
  - **NEW** `shared/health/__tests__/healthScore.test.ts`
- **Contract:**
  ```ts
  export interface HealthInputs {
      topicCount: number; actionCount: number; cycles: string[][];
      brokenRefs: BrokenReference[]; failureRate24h: number;
  }
  export function computeHealthScore(i: HealthInputs):
      { score: number; band: 'good'|'warn'|'bad'; reasons: string[] };
  ```
- **24h failure rate** via single aggregate SOQL: `SELECT PlannerId,
  COUNT(Id) ... WHERE Status='Error' AND StartTime > LAST_N_DAYS:1 GROUP BY
  PlannerId`.
- **Effort:** M (2d).
- **Acceptance:**
  - Visible above viewer when agent selected.
  - 6 stats render correctly per fixture.
  - Selector memoized on `(agentId, X1 result hash, debugger interactions hash)`.
- **Sequencing:** After X1, F2.
- **Risks:** Failure-rate query on huge orgs — verified <800ms in prod.

### X3 — Pagination + lazy step-detail load
**Vote: 4/4 MODIFY.** Splits to X3a (pagination) + X3b (virtualization,
gated on telemetry).

**X3a — Pagination + critical lazy load** (this round)
- **Constraints (Performance non-negotiables):**
  - **Drop `StepInput`/`StepOutput` from the step-list query.** Lazy-load
    on row expansion via `SELECT StepInput, StepOutput FROM
    GenAiInteractionStep WHERE Id='…'`. Cuts payload ~20× on 5000-step
    interactions.
  - **Cursor paging on `StepOrder`**, NOT `queryMore`. Required for
    deep-link "centered window" case (N8).
  - Interactions: keyset paginate on `(StartTime DESC, Id DESC)` (ties
    exist), page size 25, in-memory cap 200 LRU.
  - Server-side filters: `Status IN ('Failed','Timeout')`, date range.
  - Drop `autoFetch` everywhere; default `first-page` cap 200.
- **Files:** `slices/agents.ts`, `slices/debugger.ts`, `debugger.html`
  (load-older button, expand-row lazy load).
- **Effort:** L (3d).
- **Acceptance:**
  - >50 interactions → load-older button.
  - Step expand → fetches input/output on demand.
  - 5000-step interaction first-paint <500ms (perf budget).
  - Test: cursor advancement; lazy-load fires only on expand.
- **Sequencing:** After F2.
- **Risks:** jsforce `queryMore` semantics — verified during impl.

**X3b — Virtualization** (gated on telemetry)
- **Decision rule:** review N14 telemetry first. If P95 trace length <500
  steps, virtualization is dead code. Defer until proven.
- If proven needed: fixed-height (40px) collapsed rows; expanded rows are
  separate overlay/drawer (avoids variable-height windowing complexity).
- **Effort:** L (3d, conditional).

### X4 — Memoize step list + worker-offload graph analysis
**Vote: 3/4 demand worker (Performance is emphatic; Pragmatist defers).**
**Synthesis: ship the worker. 3-1 majority + perf evidence.**
- **Files:**
  - `debugger/debugger.ts` — two-tier memo on `stepList`
  - `dependencies/dependencies.ts` — call worker from main
  - **NEW** `applications/agentforce/workers/graphAnalysis.worker.ts`
  - **EDIT** `tools/build/rollup.workers.mjs` (extend input glob to
    `applications/*/workers/`)
- **Two-tier memo for stepList:**
  - Tier 1 (heavy): map `steps → StepItem[]` keyed on
    `(stepsHash, filters, searchQuery)`. Excludes `currentStepIndex` and
    `expandedSteps`.
  - Tier 2 (cheap): apply `isActive`/`isExpanded` flags as final pass —
    no allocations.
- **`prettifyJson` removed from hot path:** lazy getter that runs once on
  expand and caches on the StepItem.
- **Worker offload:** `analyze()` runs in
  `applications/agentforce/workers/graphAnalysis.worker.ts`. Cache key:
  `node count + edge count + sorted node IDs joined`. Pure function;
  serializable.
- **Constraints:**
  - Worker file lives **app-local**, never `packages/workers/src/`.
  - May require extending `rollup.workers.mjs` to scan
    `applications/*/workers/` — flag as a build affordance to verify in
    spike.
- **Effort:** L (2.5d, including build wiring).
- **Acceptance:**
  - stepList recompute on filter change <30ms at 5000 steps; <5ms on
    playback tick.
  - Graph analysis off main thread; main never blocks.
  - Memoized `analyze()` returns cached result for identical input.
- **Sequencing:** After X3a (real perf data informs cache shape).
- **Risks:** Worker placement may require `rollup.workers.mjs` change —
  budget +1d if needed.

### X5 — Bookmark + permalink (defer repro bundle)
**Vote: 3/4 AGREE, 1 MODIFY** (Pragmatist: cut repro bundle; Quality:
versioned localStorage). **Synthesis: bookmark+permalink ship; repro
bundle deferred.**
- **Files:** `slices/debugger.ts` (+~20 LOC), `debugger.html` (bookmark
  icon).
- **localStorage versioning:**
  ```ts
  const BOOKMARK_KEY = 'workbench.agentforce.bookmarks.v1';
  // On read: if version mismatch, drop and warn.
  ```
- **Caps:** ≤100 bookmarks per interaction; LRU.
- **Permalink:** uses N7 URL state.
- **Effort:** S (¾d).
- **Acceptance:**
  - Star a step → persists across reload.
  - Permalink button copies URL with `stepId`.
  - Bookmarked steps highlighted.
  - Slice test: bookmark add/remove/cap/dedupe.
- **Sequencing:** After N7.
- **Risks:** None.

### X6 — LLM-call A/B diff
**Vote: 3/4 AGREE, 1 MODIFY (Performance: line-level + worker for >100KB).**
**Synthesis: keep with perf modifications; persona priority allows the work.**
- **Files:** `applications/agentforce/llmDiff/{ts,html,css}`,
  `workers/textDiff.worker.ts` (or reuse if pattern exists).
- **Algorithm:** **line-level** Myers diff, NOT character-level.
  Pre-tokenize on `\n`; deduplicate unchanged lines.
- **Worker offload:** any blob >100KB diffs in worker.
- **Cap:** 500KB combined input; show "Truncated for diff" otherwise.
- **Reuses `variableDiff` patterns** but does NOT inherit its `: any` — fix
  in N16 first (variableDiff.ts:54).
- **Effort:** L (3d, raised from 2d for worker).
- **Acceptance:**
  - Pin two LLM-call steps → side-by-side diff.
  - 50KB blobs render <500ms; 200KB blobs <2s with worker.
  - Token delta computed.
- **Sequencing:** After N16.
- **Risks:** Character-level diff would peg main thread on large LLM
  blobs — line-level is non-negotiable.

### X7 — Editor v2: real `.agent` source view (LAND FIRST in H2)
**Vote: 4/4 AGREE.** Quality: this is the largest *negative* code change in
H2; ship FIRST.
- **Files:**
  - `editor/editor.ts` — delete synthetic DSL (lines 37-83), render
    `selectedScriptContent.agentSource` directly (~50 LOC deleted, ~20 LOC
    added).
  - `editor/editor.html` — header (filename + lock icon + Copy + "Open
    in Setup").
- **Performance constraints:**
  - **Cache bundle by `(agentId, lastModifiedDate)` via F2.** Default TTL
    1h. User refresh → invalidate.
  - **Backoff polling on `checkRetrieveStatus`:** 500ms, 1s, 1.5s, 1.5s,
    capped at 1.5s. Most retrieves complete in 2 polls.
  - **Monaco model lifecycle:** dispose on agent switch. Verify no leak
    (50 agents × undisposed = ~500MB resident).
- **Effort:** M (2d).
- **Acceptance:**
  - Selecting agent → renders real `.agent` source.
  - Read-only enforced (lock icon visible).
  - Empty bundle → empty state, NOT synthetic DSL.
  - Cached open <50ms; cold <5s typical, <30s timeout.
- **Sequencing:** **FIRST in H2.** After F2.
- **Risks:** Monaco model leak. Test dispose explicitly.

### X10 — Inspector grouping + favorites (status badges deferred)
**Vote: 3/4 MODIFY.** Pragmatist: cut status badges (50 SOQL on inspector
load is a no-go). Performance: status badges OK only with single
aggregate query. **Synthesis: ship favorites + grouping now; status
badges in a separate small item using the X2 aggregate.**
- **Files:** `inspector/inspector.ts` (+~30 LOC), `cacheManager` integration.
- **Favorites:** pin ≤3 agents, persisted via `cacheManager`. Per-org keyed.
- **Grouping:** by `IsActive`-equivalent field on `BotDefinition`.
- **Effort:** S (¾d).
- **Acceptance:**
  - 3-pin cap enforced.
  - Group by status renders.
  - Test: dedupe + cap behavior.
- **Sequencing:** Independent.
- **Risks:** None at this scope.

**X10b — Status badges** (separate, follow-up)
- Wired off the X2 aggregate query (`SELECT PlannerId, COUNT(Id) ...
  GROUP BY PlannerId` cached 60s).
- **Effort:** XS (½d). After X2.

### X11 — Dependencies graph polish (clickthrough + filters + mermaid export)
**Vote: 4/4 MODIFY.** All cut scope. Synthesis below.
- **Files:**
  - `dependencies/dependencies.ts` (~80 LOC for clickthrough + filters)
  - `dependencies.html` (filter UI)
  - **EDIT** `applications/code/app/app.ts` — register
    `code.openMetadata({type, name})` with web fallback to setup URL (F4).
- **Phase 1 scope (this item):**
  - Click flow node → `code.openMetadata({type:'Flow', name})` with
    `hasCommand` guard + `buildSetupUrl` fallback.
  - Click apex node → same pattern with `type:'ApexClass'`.
  - Filter checkboxes by node type (agent/topic/action/flow/apex) — hide
    live.
  - Export as mermaid markdown to clipboard.
- **Phase 2 cuts:** minimap, search-with-highlight, SVG/PNG export. Add
  later if requested.
- **Performance constraints:**
  - Hard-cap **single-agent** scope. No "show all agents" toggle (would
    be 10k+ nodes; mermaid OOMs).
  - `bindFunctions` per `_lastGraphKey`, not per render.
  - Type the Mermaid bindings as part of this item — remove
    `(mermaid as any).render` cast at line 187.
- **Effort:** M (2.5d).
- **Acceptance:**
  - Click handlers wired; mermaid markdown export works.
  - `_lastGraphKey` short-circuit verified.
  - No new `any`.
- **Sequencing:** After F3, F4, N16.
- **Risks:** Mermaid version-pin (Risk #4 from foundation). Add render
  smoke test for `classDef` directives.

### X12 — A11y pass (includes AA foreground variants from N11)
**Vote: 4/4 AGREE.**
- **Files:** `inspector.html`+`.ts` (keyboard handlers + role attrs),
  `playbackBar`, `debugger`, `dependencies` for focus rings,
  `agentlensTokens.css` (add `--af-cyan-text`, `--af-green-text`,
  `--af-orange-text` AA variants).
- **Scope:** WCAG 2.1 AA. Run `eq-accessibility` skill.
- **Acceptance:**
  - All interactive elements have `role` + `aria-label` + keyboard
    handlers.
  - Focus rings visible.
  - AA contrast on all foreground/background pairs.
  - One playwright-style smoke test for inspector keyboard nav.
- **Effort:** M (2d).
- **Sequencing:** After N11.
- **Risks:** Mermaid SVG a11y — accept as known limitation.

### X13 — Settings component (2 settings + CACHE_CONFIG registration)
**Vote: 3/4 MODIFY** (Pragmatist: 1 setting; Platform: register
CACHE_CONFIG). **Synthesis: 2 settings + CACHE_CONFIG done right.**
- **Files:**
  - **NEW** `applications/agentforce/appSettings/`
  - **EDIT** manifest: `"settingsComponent": "agentforce/appSettings"`
  - **EDIT** `packages/lwc/shared/modules/cacheManager/cacheManager.ts` —
    add `agentforce_default_tab`, `agentforce_max_interactions` to
    `CACHE_CONFIG`.
- **Settings shipped:**
  - `agentforce_default_tab` (Maya wants Inspector default)
  - `agentforce_max_interactions` (cap for X3a, default 200)
- **Cut for now:** playback speed, apimode toggle, compact mode (no
  request signal).
- **Effort:** S (1d).
- **Acceptance:**
  - Settings component renders.
  - Persists across sessions.
  - Validator passes.
- **Sequencing:** After X3a.
- **Risks:** None.

### X14 — Skill markdown for agent assistant (1 skill)
**Vote: 3/4 MODIFY** (Pragmatist: 1 only; Persona: debugging).
- **Files:** **NEW** `assets/shared/skills/agentforce-debugging.SKILL.md`.
- **Effort:** XS (½d).
- **Acceptance:** Auto-loaded by
  `tools/scripts/generate_manifest_skill.js`. References real (post-N1)
  tool names.
- **Sequencing:** After N1.
- **Risks:** None.

### X15 — Icon system migration (SLDS for chrome; keep unicode for status)
**Vote: 3/4 MODIFY** (Pragmatist: keep unicode geometric; Quality: enforce
SLDS for chrome).
- **Migrate:**
  - Emoji insight icons (🔁 ⚡ 📐) → SLDS utility (`utility:loop`,
    `utility:strategy`, `utility:measuring_tape`).
  - Playback ASCII arrows (← →) → SLDS utility (`utility:chevronleft`,
    `utility:chevronright`).
  - Inspector toggle (▼ ▶ at 8px) → SLDS utility (`utility:chevrondown`,
    `utility:chevronright`).
- **Keep unicode** for step-status indicators (✓ ✗ —): pixel-perfect,
  zero bundle weight, accessible (SR announces unicode names).
- **Effort:** S (1d).
- **Acceptance:**
  - `grep -rn '[🔁⚡📐←→▶◀]' applications/agentforce/` returns 0 hits.
  - Unicode geometric `✓✗—` retained for status only.
  - Verify with `rollup-plugin-visualizer` no full SLDS icon set
    accidentally bundled.
- **Sequencing:** After N11.
- **Risks:** Bundle bloat if tree-shake fails — verify.

### X16 — Spacing + typography token scale (debugger as exemplar)
**Vote: 3/4 AGREE, 1 REJECT** (Pragmatist: SLDS already provides).
**Synthesis: smallest scope — define the scale, refactor debugger only,
do NOT touch SLDS-aligned areas.**
- **Files:** `agentlensTokens.css` (add scale), `debugger.css` (refactor).
- **Tokens:** `--af-space-1..6`, `--af-text-xs..lg`, `--af-weight-medium/semi/bold`.
- **Effort:** S (1d).
- **Acceptance:**
  - Scale defined in tokens.
  - Debugger CSS uses scale (no raw px/rem for spacing/typography).
  - Other surfaces untouched.
- **Sequencing:** After N11.
- **Risks:** Scope creep into SLDS-aligned areas — bound the diff.

---

## Horizon 3 — LATER (strategic bets)

### L1 — Cross-org agent compare (with prerequisites)
**Vote: 4/4 AGREE (Performance: prerequisites required).**
- **Hard prerequisites (NEW item L0-prep):**
  - **Inspector tree virtualization.** Current `inspector.html:22-106`
    renders all agents directly. Two un-virtualized 1000-agent trees =
    dead tab. Size: 3d.
  - **Bulk IN-clause queries.** `WHERE GenAiPlannerId IN (200 IDs)` per
    chunk. ~10k SOQL → ~5-10 round-trips per org.
  - **Diff in worker.** Action-level diff at 10k nodes/side requires
    worker offload.
- **Spike (2d, kill-or-keep):** answer 3 yes/no:
  1. Does `applications/textCompare/` accept arbitrary string pairs?
  2. Is `BotDefinition.LastModifiedDate + AiAuthoringBundle` enough to
     lock a stable version?
  3. Can two trees render side-by-side without rewriting inspector?
  Any "no" → kill the bet.
- **Diff data contract:**
  ```ts
  type AgentDiff = {
      addedTopics: GenAiPlugin[]; removedTopics: GenAiPlugin[];
      changedTopics: TopicChange[];
      // ... keep contract narrow; topic-level first; action-level lazy on expand
  };
  ```
- **Files:** new `crossOrg/` subdir, `slices/crossOrg.ts`, plus L0-prep
  edits.
- **Performance:** agent-level diff render <2s at 1000 agents; topic-level
  <4s; action-level lazy.
- **Effort:** XL (3-4 weeks, raised from 2 weeks per Performance review).
- **Sequencing:** After L0-prep.
- **Risks:** Without virtualization, DOA on large orgs.

### L2 — Editor write-back (3-flag scoped)
**Vote: 3/4 AGREE (Pragmatist rejects; majority overrides).** Quality
demands flag scoping.
- **Spike (3d):** verify `AiAuthoringBundle` deploy round-trip semantics.
  Kill if no clean path.
- **Three-flag gating:**
  - `agentforce_writeback_per_agent` (default off)
  - `agentforce_writeback_per_field` (default off)
  - `agentforce_writeback_dry_run_required` (default ON)
- **Mandatory: dry-run preview is non-skippable** in the UI.
- **Conflict detection:** compare freshly-listed `AiAuthoringBundle.lastModifiedDate`
  against editor's loaded copy.
- **Backoff polling on `checkDeployStatus`** (mirror X7).
- **Effort:** XL (4-6 weeks, raised from 3w; 3w was optimistic).
- **Sequencing:** After X7.
- **Risks:** Half-done feature lives behind a flag forever. **Honest
  expectations:** if spike says >5w post-spike, kill.

### L3 — Live tail via CometD CDC (renamed from "Pub/Sub")
**Vote: 4/4 MODIFY.** All architects: rename to CometD CDC; reject polling.
- **Investigation (1d):** verify Salesforce ships CDC for
  `GenAiInteractionStep` (more useful than the conversation entity). If
  no CDC: **kill outright.** No polling fallback.
- **Implementation (only if CDC exists):**
  - Subscribe via existing CometD/Faye stack (mirror
    `applications/platformevent/app/app.ts:86`).
  - Backpressure: throttle UI updates to 250ms; coalesce events.
  - Cap live buffer at last 500 events; LRU evict.
  - Reconnect with backoff.
- **Effort:** L (2 weeks if CDC exists; 1d kill spike otherwise).
- **Acceptance:**
  - Event-to-render <100ms when subscribed.
  - CPU <5% steady-state at 10 events/sec.
  - 1000 events/min stress: backpressure throttle holds.
- **Sequencing:** Independent.
- **Risks:** No CDC = kill. Honor the kill.

### L4 — Token-cost leaderboard (MVP first)
**Vote: 3/4 MODIFY** (Pragmatist: 1d MVP; Performance: aggregate SOQL).
- **MVP (1d):** Top-10 most expensive interactions via single aggregate
  `SELECT GenAiInteractionId, SUM(TokenCount) FROM GenAiInteractionStep
  ... GROUP BY GenAiInteractionId ORDER BY SUM(TokenCount) DESC LIMIT 10`.
  Surface as a "Sort by cost" toggle on debugger interaction list.
- **Full version (later, 1-1.5w):** per-agent trend, per-topic breakdown
  (verify SOQL `GROUP BY` is feasible — topic FK may not exist on step
  entity), per-prompt-template cost, sparkline charts.
- **Caching:** SWR 5-15min via F2.
- **Effort:** MVP S (1d); full L (1.5w).
- **Acceptance (MVP):**
  - Single aggregate SOQL, <800ms.
  - Top-10 list sorted correctly.
- **Sequencing:** After F2.
- **Risks:** Topic FK availability unknown — investigate before full
  version.

### L6 — Org-level audit report (markdown only)
**Vote: 3/4 MODIFY** (Pragmatist: markdown only, no PDF; Performance:
chunked aggregates).
- **Files:** new `audit/` subdir.
- **Scope:**
  - Markdown export only (PDF cut — `jspdf` is in vendor bundle but
    per-agent detail is useless 1000-page doc).
  - Reuse X1 chunked broken-ref scan; do NOT write parallel impl.
  - One-row-per-agent summary table.
- **Worker offload** if generation >1s.
- **Effort:** M (1w).
- **Acceptance:**
  - Report generation <10s for 1000 agents.
  - 5-10 chunked aggregate SOQLs total.
- **Sequencing:** After X1.
- **Risks:** Out-of-scope at 10k agents (would need streaming write);
  document.

### L8 — Dark mode (spike-gated, 2-3d)
**Vote: 3/4 AGREE (Platform: spike for host theme switcher; Pragmatist:
2d).**
- **Spike (1d):** Does host already set `data-theme="dark"`?
  - Yes → app-local `--af-*` overrides only (2d implementation).
  - No → punt to a host-shell roadmap (not agentforce's problem).
- **Files:** `agentlensTokens.css` (dark variants). Match Monaco theme.
- **Acceptance:**
  - All foreground/background pairs verified AA in dark.
  - Cut AAA high-contrast variant — separate item.
- **Effort:** Spike 1d + 2d implementation = 3d.
- **Sequencing:** After X16.
- **Risks:** Host machinery may not exist. Honor the spike outcome.

---

## Killed items

These items did not survive consensus review (≥2 architect rejects, or
unanimously rejected after reconciliation).

### X8 — Step renderer registry — KILLED
- **Votes:** 1 REJECT (Pragmatist), 2 MODIFY (Quality, Platform), 1 AGREE
  (Performance). No 4/4 path. Pragmatist's red flag (registry before 2
  consumers) decisive: 5 hardcoded step types, single consumer (debugger),
  no external plugin authors.
- **Replaced by:** keep the existing `switch` statement in `debugger.ts`.
  When a 6th step type lands, refactor *then* (1d). Track potential
  registry as a future item; do not build speculatively.

### X9 — Action-type renderer registry — KILLED
- **Votes:** Same shape as X8.
- **Replaced by:** keep the `actionFields` map in `viewer.ts:146-155`. If
  Salesforce ships a 6th action type, add a case. Build the registry only
  when 2+ apps consume it.

### L5 — Plugin surface — KILLED
- **Votes:** 2 REJECT (Pragmatist, Platform), 1 MODIFY (Quality), 1
  AGREE (Performance). Two strong rejects.
- **Reasoning:** Premature; depends on X8/X9 which were also killed; agent-
  domain registries don't belong in host-api; "documented as public" =
  contract freeze without versioning machinery.
- **Replaced by:** internal documentation of any registries that emerge
  organically. Promotion to public surface requires a separate roadmap
  item per registry with cross-architect signoff.

### L7 — Step-by-step replay with override — KILLED
- **Votes:** 3 REJECT (Pragmatist, Quality, Performance), 1 AGREE (Platform).
- **Reasoning:** Depends on a Salesforce "resume from step" API that does
  not exist. Roadmap-pending without commit.
- **Replaced by:** none. Revisit if/when API exists.

### L9 — Conversation simulator — KILLED
- **Votes:** 3 REJECT, 1 AGREE.
- **Reasoning:** Depends on agent-runtime API that doesn't exist. Even
  with API, replay cost is server-side and dollar-loud.
- **Replaced by:** none.

### L10 — Web app responsive pass — KILLED
- **Votes:** 2 REJECT (Pragmatist, Quality), 2 AGREE (Platform, Performance).
  Tied, but Pragmatist + Quality cite that **CLAUDE.md and the original
  draft's own "Cuts" list** explicitly say "Workbench is desktop-first; do
  not invest". The roadmap contradicts itself if it ships L10.
- **Replaced by:** none. Reinforce desktop-first stance.

---

## Sequencing plan (consensus order)

**Day 0:** F1 (agent-tools imports), F3 (typed CommandPayloads), F4
(setup URL).

**Day 1:** N1a (the 2-line bug fix + sweep), N17 (other GenAiPlanner refs
in same file).

**Days 2-3:** N16 (typed store — FIRST per Quality non-negotiable).

**Days 4-6:** N2 (`runSoqlQuery` extraction + escape + branded ID), F2
(SWR primitive).

**Day 7:** N3 (error contract through new helper).

**Days 8-9:** N7 (URL state) → N8 (deep-link + jump-to-error) → N6 (search).

**Day 10:** N5 (refresh), N4 (empty/loading/error), N13 (step-card name),
N14 (one analytics event).

**Days 11-12:** N9a (recordviewer.open + step Open-record), N10 (slash
commands), N11 (token sheet hookup), N12 (toolbar compress), N15 (5 test
files + perf-budget test), N1b (new agent tools — after N7).

**Total H1: ~12 dev-days** (matches the original draft's overall budget,
but with strict ordering).

**Horizon 2 sequence:**
- Week 1: X7 (FIRST — biggest debt payoff), X1 (broken refs), X2 (health
  card), X10 (favorites + grouping).
- Week 2: X3a (pagination + lazy load), X4 (memo + worker), X5 (bookmark +
  permalink), X11 (graph clickthrough + export), X12 (a11y pass).
- Week 3: X6 (LLM A/B diff), X13 (settings + CACHE_CONFIG), X14 (skill
  md), X15 (icon system), X16 (spacing scale), X10b (status badges
  follow-up). X3b (virtualization) deferred pending telemetry.

**Horizon 3 sequence (by strategic bet ranking):**
- L0-prep (inspector virtualization, 3d) → L1 (cross-org compare, 3-4w).
- L4 MVP (token cost MVP, 1d) — opportunistic.
- L8 spike (1d) → L8 implementation (2d) if host theme switcher exists.
- L3 spike (1d) → kill or 2w implementation.
- L2 spike (3d) → kill or 4-6w implementation.
- L6 (org audit report markdown, 1w).

---

## Dissent log

Architectural disagreements that surfaced during review and how they
were reconciled. Recording these so future contributors can re-litigate
with full context.

### D1: Where does `runSoqlQuery` live? (N2)
- **Original draft:** `host-api/connector.ts`.
- **Pragmatist position:** `applications/agentforce/shared/runSoql.ts` (app-local until 2 apps need it).
- **Quality position:** `shared/modules/soqlQuery/` (named entry, with brand+escape).
- **Platform position:** `shared/sf/runSoqlQuery.ts` (shared, NOT host-api).
- **Performance position:** `host-api/connector.ts` is fine *if* the helper has correct paging defaults.
- **Resolution:** Land in `shared/modules/soqlQuery/`. Re-export from
  thin `host-api/soql.ts` if a stable host-api prefix is wanted later.
  Default policy is `first-page` cap 200 (Performance non-negotiable).
  Why: types-only `host-api/connector.ts` becomes runtime, violating the
  contract; shared/ matches the existing convention for pure cross-app
  utilities.

### D2: Step renderer registry (X8) — kill or keep?
- **Pragmatist:** REJECT — speculative infra, single consumer.
- **Quality:** MODIFY — versioned contract + typed prop bag.
- **Platform:** MODIFY — keep app-local in
  `applications/agentforce/shared/`.
- **Performance:** AGREE — perf-neutral.
- **Resolution: KILLED.** Pragmatist's red flag wins: zero external
  consumers, agent-domain concept, can be added in 1d when 6th step type
  lands. Track as future item.

### D3: Worker offload for `graphAnalysis.analyze()` (X4)
- **Pragmatist:** Defer (workers add IPC complexity).
- **Quality:** AGREE worker-offload in principle; demand worker contract
  types up front.
- **Platform:** App-local placement
  (`applications/agentforce/workers/`), not `packages/workers/src/`.
- **Performance:** **Worker is REQUIRED** — Brandes O(V·E) at 250+ nodes
  blocks UI 50-150ms per render.
- **Resolution: ship the worker.** 3-1 majority + measured perf evidence.
  Place app-local. Budget +1d if `rollup.workers.mjs` needs extending to
  scan `applications/*/workers/`.

### D4: Plugin surface (L5)
- **Pragmatist:** REJECT — premature.
- **Quality:** MODIFY — version contract first.
- **Platform:** REJECT — agent-domain registries don't belong in host-api.
- **Performance:** AGREE — perf-neutral.
- **Resolution: KILLED.** Two strong rejects. Document any registries
  internally; promote to public surface only when a real second consumer
  emerges.

### D5: How many slash commands? (N10)
- **Pragmatist:** 2 (`/agent`, `/trace`).
- **Quality:** All 5, with validator extension.
- **Platform:** Namespace `/af-*` to avoid global collision.
- **Performance:** Neutral.
- **Resolution:** 3 commands shipped (`/agentforce`, `/af-agent
  <name>`, `/af-trace <id>`), namespaced to avoid collision. Cut topic /
  debugger / deps for now (no usage signal). Validator extension
  ships per Quality.

### D6: Editor write-back (L2) — keep or kill?
- **Pragmatist:** REJECT — competes with Salesforce roadmap; 3w optimistic.
- **Quality:** MODIFY — 3-flag scoping, 4-6w realistic.
- **Platform:** AGREE — uses existing `shared/metadataApi`.
- **Performance:** AGREE — network-bound, scales fine.
- **Resolution: keep, scoped to 3 flags + dry-run-required + 4-6w
  honesty.** 3-1 majority. Pragmatist's concern logged: if spike says
  >5w post-spike, kill.

### D7: Responsive pass (L10) — keep or kill?
- **Pragmatist:** REJECT — contradicts CLAUDE.md desktop-first.
- **Quality:** REJECT — same.
- **Platform:** AGREE.
- **Performance:** AGREE.
- **Resolution: KILLED.** The original draft's own Cuts list says "do not
  invest" in mobile; L10 contradicts. Reinforce desktop-first.

### D8: SVG empty-state illustrations (N4)
- **Pragmatist:** Cut SVGs entirely — text-only states.
- **Quality:** Centralized component with SVGs OK.
- **Platform:** Neutral.
- **Performance:** Neutral if SVGs ≤2KB.
- **Resolution:** Centralized `<c-empty-state>` component, small inline
  SVGs (≤2KB each).

### D9: Tests — count + coverage gate (N15)
- **Pragmatist:** 2 files, no gate.
- **Quality:** 7 files + ≥70% CI gate.
- **Platform:** Glob already exists (correct fact).
- **Performance:** Add perf-budget test for `analyze()`.
- **Resolution:** 5 files + perf-budget test + ≥70% coverage TARGET (not
  CI gate yet — wiring CI gate is its own item if/when needed).

### D10: How many `any`s to drop in N16?
- **Pragmatist:** Just store-shape (1d).
- **Quality:** All 25, including Mermaid (2d).
- **Platform:** Neutral.
- **Performance:** Neutral.
- **Resolution:** Drop ≤2 remaining; defer Mermaid types to X11. 2d effort.

### D11: F2 SWR primitive — build now or defer?
- **Pragmatist:** Defer until 2nd consumer.
- **Quality:** Build with versioned contract.
- **Platform:** Place in `shared/modules/`.
- **Performance:** Build NOW — original draft assumed it existed (it
  doesn't); X1, X4, X10, L4, L6 all depend on it.
- **Resolution: build NOW** as F2. 3-1 majority + the load-bearing
  dependency on H2 items.

### D12: 24h failure-rate query in X2/X10b — per-agent or aggregate?
- **Pragmatist (implicit):** Doesn't matter at small scale.
- **Performance:** **Aggregate ONLY.** 1000 per-agent queries = governor
  death.
- **Resolution:** Single aggregate `GROUP BY PlannerId` query, cached 60s.
  Wired once in X2; X10b reuses.

### D13: L3 technology — Pub/Sub gRPC vs CometD CDC?
- **Original draft:** "Pub/Sub API."
- **Performance:** jsforce ships **CometD**, not Pub/Sub gRPC. Use CDC
  via existing CometD stack (mirror `platformevent` app).
- **Resolution:** Renamed to "CometD CDC." If no CDC for the entity:
  kill outright. No polling fallback.

---

## Success metrics — honesty correction

The original "30% activation / 15% D7 retention / P50 < 30s task time" are
**aspirational**, not measurable today. We do not have a stats pipeline.

**Pragmatist non-negotiable:** these targets must be relabeled
"Aspirational, revisit post-launch" until either (a) we wire a dashboard
or (b) we have telemetry beyond N14's single event. Do not gaslight the
team into thinking we're succeeding against numbers we can't measure.

**Realistic measurement plan:**
- Pre-launch: N14 ships 1 event (`agentforce.app_opened`).
- Post-launch month 1: review N14 telemetry; if signal warrants, add
  `agent_selected` + `step_inspected` (sampled at 10% to avoid 2400
  events/hour from playback).
- Qualitative: GitHub issues with `agentforce` label; Slack feedback;
  2 design-partner interviews per quarter.

---

## File reference map (consensus-validated)

Hot-spots cited above (absolute paths from
`/Users/grebmann/Documents/personnal/projects/code/sf-toolkit-web/`):

**App-local hot-spots:**
- `packages/lwc/applications/agentforce/agentforce.manifest.json`
- `packages/lwc/applications/agentforce/app/app.ts`
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
- `packages/lwc/applications/agentforce/shared/agentlensTokens.css`

**Cross-app / host-api targets:**
- `packages/lwc/main/agent/tools/modules/agentforceTools.ts` — bug at lines 36+60
- `packages/lwc/main/host-api/commands.ts` — typed CommandPayloads target (F3)
- `packages/lwc/main/host-api/store.ts` — `reportError` surface
- `packages/lwc/main/host-api/connector.ts` — types-only; **DO NOT add runtime**
- `packages/lwc/applications/recordviewer/app/app.ts` — N9a target
- `packages/lwc/applications/code/app/app.ts` — X11 target
- `packages/lwc/applications/textCompare/` — L1 reuse candidate
- `packages/lwc/applications/platformevent/app/app.ts:86` — L3 CometD pattern

**Shared targets (NEW or extend):**
- `packages/lwc/shared/modules/soqlQuery/` — N2 (NEW)
- `packages/lwc/shared/modules/swrCache/` — F2 (NEW)
- `packages/lwc/shared/modules/sliceHelpers/` — N3 helper (NEW)
- `packages/lwc/shared/modules/pageReference/` — N7 typed helper (NEW)
- `packages/lwc/shared/modules/sf/setupUrl.ts` — F4 (NEW)
- `packages/lwc/shared/modules/cacheManager/cacheManager.ts` — X13 register

**Reference patterns:**
- `applications/recordviewer/app/app.ts:62-69` — `CurrentPageReference`
- `applications/soql/app/app.ts:49-118` — `registerCommand` exemplar
- `applications/platformevent/app/app.ts:86` — CometD subscribe
- `applications/metadata/slices/metadata.ts:312` — existing
  `runAndCacheQuery` (NOT the SWR primitive the draft claimed; F2 supersedes)

---

## Architects' non-negotiables (combined)

These are the hills the four architects committed to defending. Any
re-litigation of these requires re-running the consensus.

1. **N2 lives in `shared/modules/soqlQuery/`, NOT `host-api/connector.ts`.**
2. **N2 default paging is `first-page` cap 200.** No inheriting today's
   `auto-fetch maxFetch 10000` foot-gun.
3. **N16 (typed store) ships SECOND in H1, right after N1a.** Everything
   else builds on it.
4. **X3a drops `StepInput`/`StepOutput` from the step-list query** —
   lazy-load on row expand. Single highest-leverage perf change.
5. **X3a uses cursor paging on `StepOrder`**, not `queryMore`.
6. **X4 moves `analyze()` to a worker.** Not optional.
7. **L3 is CometD CDC, not Pub/Sub gRPC.** Reject polling fallback.
8. **L1 gates on inspector virtualization (L0-prep).** No virtualization
   = dead tab.
9. **N6 uses denorm + cap + debounce; no Levenshtein on hot path.**
10. **N9 + all cross-app calls use `hasCommand` guards.** Don't perpetuate
    `shell.ts:618,655,688`'s anti-pattern.
11. **F3 typed `CommandPayloads` ships before any cross-app jump.**
12. **N15 lands a coverage measurement** even if not yet a CI gate.
13. **`runSoqlQuery` `escapeSoqlLiteral` + branded `SalesforceId` are
    non-negotiable** in N2 — anything less makes SOQLi worse than today.
14. **No third namespace** (`host-helper/`, `host-shared/`). Per
    host-api/README.md.
15. **App-local workers in `applications/<id>/workers/`,** never
    `packages/workers/src/`.
16. **Slash commands use `/<appId>-<verb>` namespacing,** not bare verbs.
17. **Success metrics are aspirational** until telemetry exists. Do not
    pretend otherwise.
18. **Killed items (X8, X9, L5, L7, L9, L10) stay killed** until the
    rejection conditions change (2nd consumer for registries, Salesforce
    APIs for L7/L9, mobile-first reversal in CLAUDE.md for L10).
