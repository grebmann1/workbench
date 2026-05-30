/**
 * Workbench page reference helpers.
 *
 * The host renders a single LWC application at a time, selected by a
 * `?applicationName=<id>` URL parameter. Other URL params are app-scoped
 * state (e.g. `agentforce` uses `tab`, `agentId`, `conversationId`,
 * `stepId`). This module is the small typed shim apps use to:
 *
 *  - Read their state out of the wired pageRef without each app
 *    re-implementing the "is this pageRef even mine?" check.
 *  - Build a pageRef for navigation without depending on `lwr/navigation`
 *    here. The shared module stays pure — `NavigationMixin` /
 *    `lwr/navigation`'s `navigate(navContext, pageRef)` is the caller's
 *    job in the LWC layer.
 *  - Compare two pageRefs for equality of the *navigationally meaningful*
 *    fields, so the wire setter doesn't re-dispatch on every URL update.
 *
 * Boundary: this file MUST NOT import from `lwr/navigation`, the LWC
 * runtime, or any host-api module. It is pure types + value compares so
 * apps and tests can use it identically.
 */

/**
 * Structural shape of an application page reference. This intentionally
 * mirrors what `@wire(CurrentPageReference)` produces for `type:
 * 'application'` references but is declared locally so the shared module
 * stays decoupled from `lwr/navigation`'s runtime types.
 *
 * `state.applicationName` selects which app is mounted. Every other key
 * is app-scoped and carries through to the URL as a query param.
 */
export interface WorkbenchPageRef {
    type: 'application';
    state: { applicationName: string; [k: string]: string | undefined };
}

/**
 * Read app-state params from a page reference IF the pageRef is for the
 * given app. Returns `null` if:
 *   - the pageRef is missing / null / undefined,
 *   - the pageRef is not an `application` reference, or
 *   - `state.applicationName` does not match `app` (case-insensitive).
 *
 * The returned object is the pageRef's `state` minus `applicationName`
 * (the caller already knew that — the question they asked was "what
 * other params did this URL carry?"). `undefined` values are filtered
 * so callers can use `'tab' in result` checks without surprises.
 *
 * The optional `K` type parameter narrows the result keys when the
 * caller knows the schema upfront — e.g.
 *   `readAppState<'tab' | 'agentId'>(pageRef, 'agentforce')`.
 */
export function readAppState<K extends string = string>(
    pageRef: WorkbenchPageRef | null | undefined,
    app: string
): Partial<Record<K, string>> | null {
    if (!pageRef || pageRef.type !== 'application' || !pageRef.state) {
        return null;
    }
    const refApp = String(pageRef.state.applicationName || '').toLowerCase();
    if (refApp !== String(app).toLowerCase()) {
        return null;
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(pageRef.state)) {
        if (key === 'applicationName') continue;
        if (value === undefined) continue;
        out[key] = value;
    }
    return out as Partial<Record<K, string>>;
}

/**
 * Build a pageRef for navigation to a different app/state. Pair with
 * `lwr/navigation`'s `navigate(navContext, pageRef)` at the call site.
 *
 * `undefined` values are filtered so callers can pass an unconditional
 * `{ tab, agentId, conversationId, stepId }` object — missing fields
 * stay out of the URL instead of becoming `?tab=undefined`.
 */
export function buildPageRef(
    app: string,
    state: Record<string, string | undefined>
): WorkbenchPageRef {
    const cleanState: { applicationName: string; [k: string]: string | undefined } = {
        applicationName: app,
    };
    for (const [key, value] of Object.entries(state)) {
        if (key === 'applicationName') continue;
        if (value === undefined) continue;
        cleanState[key] = value;
    }
    return { type: 'application', state: cleanState };
}

/**
 * Pure equality check for two page references. Two pageRefs are equal
 * iff they have the same `type` and the same set of state key/value
 * pairs. Used by the `@wire(CurrentPageReference)` setter to short-
 * circuit redundant store dispatches when LWR emits a no-op pageRef
 * update (which it does, e.g. on initial render and on internal route
 * cache refreshes).
 *
 * Both `null` and `undefined` are treated as "no pageRef" and compare
 * equal to each other.
 */
export function pageRefStateEquals(
    a: WorkbenchPageRef | null | undefined,
    b: WorkbenchPageRef | null | undefined
): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    if (a.type !== b.type) return false;
    const aState = a.state || {};
    const bState = b.state || {};
    const aKeys = Object.keys(aState).filter(k => aState[k] !== undefined);
    const bKeys = Object.keys(bState).filter(k => bState[k] !== undefined);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
        if (aState[k] !== bState[k]) return false;
    }
    return true;
}
