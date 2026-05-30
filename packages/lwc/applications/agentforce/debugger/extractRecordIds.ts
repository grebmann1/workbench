// extractRecordIds.ts
// Module: applications/agentforce/debugger/extractRecordIds
//
// N9a — pull plausible Salesforce record Ids out of a step's StepInput /
// StepOutput so the debugger can offer "Open record" buttons that hand off
// to the recordviewer app via `invokeCommand('recordviewer.open', …)`.
//
// Scope discipline:
//  - Pure / synchronous regex over the raw text. No SOQL queries, no
//    network, no host-api dependencies.
//  - App-local — DO NOT promote to host-api or shared. Other apps that
//    want the same affordance should ship their own extractor tuned to
//    their own data shapes.
//
// Detection contract (v1, deliberately permissive):
//  - Match the shape `[a-zA-Z0-9]{15,18}` — the canonical Salesforce
//    record-Id length. We do NOT validate the 18-char checksum suffix;
//    surfacing one or two false-positive buttons is preferable to
//    rejecting valid Ids when checksum verification is out of scope.
//  - False-positive guard: skip strings that are ALL letters (no digit).
//    Things like `EMAILMESSAGEID`, `RECORDIDPLACEHOLDER`, or a 16-letter
//    UPPERCASE class constant look like Ids by length but never are in
//    practice. Real Ids always contain at least one digit.
//  - Cap at 5 unique Ids per step. Surfacing 50 buttons on a fat
//    ActionExecution payload is noise, not signal — agents tend to repeat
//    the same handful of Ids, and the cap keeps the UI bounded.

const ID_PATTERN = /\b[a-zA-Z0-9]{15,18}\b/g;
const HAS_DIGIT = /\d/;
const MAX_IDS_PER_STEP = 5;

/**
 * Extract up to {@link MAX_IDS_PER_STEP} unique plausible Salesforce
 * record Ids from a free-text blob. Order is insertion order of first
 * occurrence — callers can rely on that for stable rendering. Matches
 * are not checksum-validated (see module header for rationale).
 */
export function extractRecordIds(text: string): string[] {
    if (typeof text !== 'string' || text.length === 0) return [];

    const seen = new Set<string>();
    const out: string[] = [];

    const matches = text.match(ID_PATTERN);
    if (!matches) return out;

    for (const candidate of matches) {
        if (seen.has(candidate)) continue;
        // All-letters guard: a 15-18 char alphabetic identifier is almost
        // certainly a constant or template placeholder, not an Id.
        if (!HAS_DIGIT.test(candidate)) continue;
        seen.add(candidate);
        out.push(candidate);
        if (out.length >= MAX_IDS_PER_STEP) break;
    }

    return out;
}
