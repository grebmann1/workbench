# Salesforce expert workflows

Reviewed September 18, 2026. Status: bounded user-access checks and Blueprint evidence implemented locally;
Record Explorer investigation controls rolled back at the user’s request.
Field-change assessment and broader access coverage remain planned. Real-org acceptance is pending.
Scope: Workbench's Salesforce extension panel and connected feature apps.
Audience assumption: experienced Salesforce admins, developers, and consultants
investigating unfamiliar orgs, resolving incidents, and assessing changes.

## Product direction

Help an expert answer a specific question about their org, inspect the evidence,
and take the next action without reconstructing context in another tool.

A field list remains useful for API names, types, and query construction. It is
supporting material. A successful investigation produces an explanation, a
reproducible query, a comparison, or an actionable change assessment. Generic
object definitions and counts do not constitute that outcome.

The proposed interaction is: start with a record, field, user, error, or query;
choose an investigation; inspect findings and coverage; open the relevant query,
component, or Setup page; verify and save the result. Keep direct tool access and
dense tables for experts who already know what they need.

## Workflows worth prioritizing

| Priority              | Expert's question                                          | Useful output                                                                                                 | Next action                                                              |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| First                 | What is happening with this record or field?               | Current values, relevant metadata and automation, a query scoped to the record, and explicit missing evidence | Query selected fields, inspect automation, check access                  |
| Next                  | Why can this user view the record but not edit this field? | Separate object, field, record, and UI findings; permission sources where supported                           | Inspect the granting configuration, compare a working user, rerun checks |
| Next                  | What could break if I change this field?                   | Supported references, formulas, picklist/record-type constraints, usage evidence, and unexamined areas        | Open exact components and prepare a change checklist                     |
| Later                 | Why does this work in sandbox but fail in production?      | A scoped semantic comparison of relevant configuration                                                        | Review differences and export evidence for the change                    |
| Extend existing tools | Why is this query slow or this job failing?                | Query-plan evidence or job errors/results in the original context                                             | Revise a query, inspect failed rows, prepare a deliberate retry          |

Access and change-impact work must have explicit supported scopes. A broad
promise to explain every Salesforce permission or dependency is not an MVP.

## What the code already provides

Paths below are relative to `packages/lwc/` unless otherwise stated.

| Existing capability                                                                  | Evidence                                                              | Product implication                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| URL-driven record panel, org and user tools                                          | `extension/panels/salesforce/salesforce.ts`, `salesforce.html`        | Use the active Salesforce page as the investigation entry point             |
| Record values, editing, changed-value review, SOQL handoff                           | `applications/recordviewer/recordExplorer/recordExplorer.ts`, `.html` | Extend the current record workflow instead of building another inspector    |
| Object schema, relationships, Blueprint, limits                                      | `applications/object/sobject/sobject.ts`, `.html`                     | Keep schema available; make useful investigations discoverable beside it    |
| Blueprint gathers automation, sharing, permissions, layouts, formulas, code and jobs | `applications/object/blueprint/constants.ts`, `blueprint.ts`          | Connect and qualify this evidence before adding more inventory screens      |
| Permission/profile comparisons and field-security reports                            | `applications/accessAnalyzer/app/app.ts`, `README.md`                 | Reuse comparison infrastructure, while auditing actual user-access coverage |
| SOQL plans, saved queries and exports                                                | `applications/soql/README.md`, `slices/query.ts`                      | Prepare useful query drafts and preserve existing expert controls           |
| Setup audit filters and job monitoring/details                                       | `applications/auditTrail/app/app.ts`, `applications/jobs/app/app.ts`  | Provide contextual handoffs; do not duplicate these tools                   |

Original gaps established by source inspection (before the first implementation):

- `recordExplorer.ts:403` generates `SELECT Id FROM <object>` for the record's
  SOQL action. The record ID and selected field are absent. The object-level
  query action in `object/sobject/sobject.ts:163` is similarly minimal.
- `accessAnalyzer/app/app.ts:757` opens a user selector with an empty result
  callback. Its filter UI is commented out in `app.html:210`. The README's
  user-level effective-access claim is not demonstrated by this unfinished
  flow. Do not advertise an implemented user diagnosis based on that README.
- `object/blueprint/blueprint.ts:615` catches sharing-metadata read failures and
  returns null; its callers turn that into an empty list. The template can then
  say no sharing rules were found. Unavailable evidence is different from an
  empty successful result.
- `blueprint.ts:1292` finds Apex classes by class-name matching, excludes
  namespaced classes, and limits results to 50. These are candidate matches,
  not established dependencies. Scheduled Apex matching also uses heuristics.
- `object/sobject/sobject.ts:232` requests a record count when describing an
  object. Detailed profiling should be deliberate and scoped, particularly in
  large orgs; describe should not become an automatic data scan.

These were source findings from the initial review. The implementation below
addresses the scoped SOQL handoff, Blueprint coverage, and investigation-time
record count. Authenticated real-org behavior has not yet been exercised.

## How experts should use it

**Extension panel:** enter from the record or Setup page already under
investigation. Show the org, object, record, and selected field prominently.
Offer a compact set of relevant actions, such as Query this record, Inspect
automation, and Check access. Keep field search, API-name copy, and direct
editing fast. Promote longer investigations into the full Workbench while
retaining context.

**Full Workbench:** provide room for queries, detailed evidence, and comparisons.
Let users open a record ID/URL or object/field reference directly, keep multiple
investigations, and return to their previous selection. Carry org identity,
object API name, record ID, field API name, API mode, and any selected target
user through supported actions. Distinguish the connected user from the user
whose access is being examined.

**Field details:** put useful actions adjacent to the selected field: query its
value for this record, prepare a data-profile query, inspect supported
references, inspect relevant configuration, and open field Setup. Retain the
definition as a compact reference. Show successful empty, not checked,
unsupported, unavailable, partial, and failed states distinctly.

**AI:** let it coordinate the same tools and explain returned evidence. Its
answer should identify findings, sources, remaining unknowns, and the next useful
check. Metadata showing an active flow is a candidate explanation, not proof that
the flow executed or caused a particular value. Investigations must remain usable
without configuring an AI provider.

Example scenario, not an observed org result: an admin investigating
`Invoice__c.Status__c` selects the field on a failing record, opens a query with
that record and field already selected, inspects the object's validation rules
and active automation, and opens a relevant component. If logs or tracked
history are unavailable, the result says what remains unproven. A saved evidence
note can accompany the support ticket.

## Salesforce already supplies part of the answer

Salesforce's [User Access Summary](https://help.salesforce.com/s/articleView?id=users_access_summary.htm&language=en_US)
shows assigned permissions and their granting sources. Its
[Where is this used? feature](https://help.salesforce.com/s/articleView?id=platform.fields_references.htm&language=en_US)
surfaces supported custom-field references. Our proposed differentiation is to
combine the current record/field context, relevant evidence, comparisons, and
next actions. Link to native Setup when that already completes the task.

For access investigations, Salesforce documents
[UserRecordAccess and sharing-object queries](https://help.salesforce.com/s/articleView?id=000386023&language=en_US&type=1).
Treat record-access results as one part of the investigation. Keep field/object
permissions and UI configuration separate; the
[API guide](https://developer.salesforce.com/docs/platform/api/guide/calls.html)
explains that some UI requirements are not enforced by API calls.

Before promising effective-user access, verify coverage of assignments,
permission-set groups and muting, licenses, session-dependent access, sharing,
and applicable restrictions. Record which checks actually ran. Before promising
field impact, validate the supported metadata types and reference collection in
real orgs. No matches within partial coverage never establishes safe deletion.

## Implementation sequence

### 1. Record-to-field investigation — UI rolled back; redesign deferred

- Improve the existing SOQL handoff: prepare a new draft scoped to the current
  record and selected fields. Preserve the query API mode. Do not overwrite an
  unrelated query draft or execute the query merely by navigating.
- Add a contextual handoff to the existing object Blueprint with its object and
  relevant category selected. Label object-wide evidence as object-wide until
  field-level matching has been implemented.
- Keep the current record/field selected on return. Reject stale responses when
  the org or record changes; never reuse one org's evidence for another.
- Correct Blueprint's failed-versus-empty handling for the categories used by
  this workflow. Label heuristic matches and truncated/partial results.
- Add exact component/Setup links and an exportable evidence note containing
  org identity, timestamp, inputs, findings, and coverage; exclude credentials.

Acceptance: from a record field, reach a query containing that record ID and
field, inspect relevant Blueprint evidence, and return without re-entering
context. Denied metadata reads must be shown as unavailable. Navigation must
not execute a query or mutate Salesforce data. Both current-record and generic
object exploration remain usable.

Rollback (September 18): restored the compact Record Explorer layout, original
SOQL toolbar action and field/value rows. Removed investigation controls, field
checkboxes and selection persistence after manual feedback. Read-only schema
discovery and stale-record/org response guards remain. Blueprint evidence and
contextual routes remain available independently; redesign of the Record Explorer
entry point requires a new product decision.

### 2. Bounded access investigation — implemented locally

Start with one target user, one supported object, one record, and optionally one
field. Show separate findings for object permission, field permission, record
access, and remaining UI/context checks. Expose contributing sources where
verified. Implement the unfinished user-selection path and update documentation
to match supported coverage. Add working-user comparison after the single-user
result is trustworthy. Open the precise Setup surface for remediation and allow
the checks to be rerun afterward.

Acceptance scenarios include object access without field edit access, field
access without record edit access, and unavailable evidence. An unsupported or
unfinished check cannot become a red denial or green success. Automated fixes
are outside this slice.

Implementation: open **Admin → Access Analyzer** and enter the object, record and optional field.
The new default workflow searches for one target user and runs object, optional
field, and record read/edit checks only on request. Missing or mismatched evidence
remains unknown. Profile and active direct permission-set sources are shown with
Setup links; group/muting and session-dependent contributions remain unresolved.
The result exports its inputs, queries, sources and remaining checks. The previous
comparison workspace loads when selected. Browser fixtures cover field denial,
record sharing denial, unavailable evidence and export.

Remaining acceptance: authenticated orgs, permission-set groups and muting,
license/session/restriction coverage, and working-user comparison. The current
scope does not certify that a user can complete a UI edit. See the Library for
verification evidence and the 401/BlackTab startup regression fixed in this stage.

### 3. Deliver field-change assessment

Add a supported-reference view with component links, explicit coverage, and a
deliberate data-profile action. Query templates must respect the field's type
and supported filter/group operations. Label sample size and filtering; records
visible to the connected user are not necessarily all records in the org.
Include formulas, picklist/record-type configuration, and permissions where
available. Add a scoped cross-org comparison afterward, matching components by
stable API identity rather than org-specific IDs.

Acceptance: a user can identify the examined references and data scope, inspect
the original components, and export a review checklist. Missing coverage remains
visible. The feature must not certify that a field is unused or safe to remove.

## Delivery boundaries and validation

Reuse the existing applications and `host-api/commands` contract. Extend typed
payloads only where needed; retain app-owned state and avoid direct app imports
of `core/*`. Share pure helpers through the existing shared namespace. A new
application or parallel navigation framework is unnecessary for the first slice.

Read the relevant repository skills before implementation. Preserve existing
workspace changes. Validate the touched query/context/state logic with focused
tests, real navigation with browser fixtures, and the closest TypeScript check.
Build affected extension targets. Separate fixture results from real Salesforce
acceptance, including a restricted session and more than one org. Capture an
existing-error baseline when the package typecheck is already failing.

Measure completion of representative expert tasks and repeated context entry,
not the number of fields or metadata categories displayed. Compare the same
tasks with the current product before choosing numeric performance targets.

The remaining work complements the shell/navigation roadmap in
`ui-ux-live-acceptance.plan.md`. Keep this plan while access diagnosis, field-change
assessment, and real-org acceptance are outstanding. Remove it after the remaining
work is implemented and validated; retain completion evidence in the Library.
