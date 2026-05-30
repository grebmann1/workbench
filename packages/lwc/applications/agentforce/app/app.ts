import Analytics from 'host-api/analytics';
import { registerCommand, type AgentforceTab } from 'host-api/commands';
import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { track, wire } from 'lwc';
import { CurrentPageReference, NavigationContext, navigate } from 'lwr/navigation';
import type { PageReference } from 'lwr/router';
import {
    buildPageRef,
    pageRefStateEquals,
    readAppState,
    type WorkbenchPageRef,
} from 'shared/pageReference/pageReference';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';
import { asSalesforceId } from 'shared/soqlQuery/soqlQuery';
import { reduxSlice as agentsSlice, fetchAgents } from 'agentforce/slices/agents';
import {
    reduxSlice as debuggerSlice,
    fetchSteps as debuggerFetchSteps,
} from 'agentforce/slices/debugger';
import type { ConnectorLike } from 'host-api/connector';
import { fuzzyMatch } from 'agentforce/inspector/search/fuzzyMatch';
import type { GenAiPlanner } from 'agentforce/slices/agents';

/**
 * URL state shape for the agentforce app:
 *   ?applicationName=agentforce
 *    &tab=<inspector|debugger|dependencies|editor>
 *    &agentId=<id>
 *    &conversationId=<id>
 *    &stepId=<n>
 */
type AgentforceUrlKey = 'tab' | 'agentId' | 'conversationId' | 'stepId' | 'topicId';

const VALID_TABS: ReadonlyArray<AgentforceTab> = [
    'inspector',
    'debugger',
    'dependencies',
    'editor',
];

function isValidTab(value: string | undefined): value is AgentforceTab {
    return !!value && (VALID_TABS as ReadonlyArray<string>).includes(value);
}

/**
 * Best-effort Salesforce ID validator. Returns the input if valid, else null.
 * `asSalesforceId` throws on invalid input — we swallow the throw at the URL
 * boundary so a hand-crafted bad URL doesn't crash the app.
 */
function safeId(value: string | undefined): string | null {
    if (!value) return null;
    try {
        return asSalesforceId(value);
    } catch {
        return null;
    }
}

/**
 * Adapter from our pure {@link WorkbenchPageRef} to the LWR `PageReference`
 * runtime shape. LWR requires `attributes` (we don't use them) and treats
 * empty values as `string | null` (we treat them as `string | undefined`
 * because that's what `Object.entries` produces on stripped fields).
 *
 * Kept as a tiny adapter at the boundary so the shared module stays
 * agnostic to `lwr/navigation`'s internals.
 */
function toLwrPageReference(ref: WorkbenchPageRef): PageReference {
    const state: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(ref.state)) {
        state[k] = v ?? null;
    }
    return { type: ref.type, attributes: {}, state };
}

/**
 * Navigate the host to a new agentforce URL. Pulled out as a free function
 * so command handlers (which run in module scope, not component scope) can
 * reach it. Falls back to the legacy `store_application.navigate` toast-bus
 * path because the host's NavigationContext is bound to the rendered app
 * instance, not to a static service.
 */
function dispatchNavigate(state: Record<string, string | undefined>): void {
    const ref = buildPageRef('agentforce', state);
    const target = `sftoolkit:${JSON.stringify(ref)}`;
    legacyStore.dispatch(legacyStore_application.navigate(target));
}

/**
 * Pull the active connector off the host store. Command handlers run at
 * module scope (not component scope) so they can't go through `this.connector`.
 * The connector lives on `state.application.connector`; the legacy slice owns
 * that field today and is the only source of truth for it across both
 * extension and web targets.
 */
function getActiveConnector(): ConnectorLike | null {
    const state = store.getState() as {
        application?: { connector?: ConnectorLike | null };
    };
    return state.application?.connector ?? null;
}

/**
 * Parse a `stepId` URL value. Two valid encodings:
 *   - numeric string (1-based StepOrder, e.g. "5")
 *   - Salesforce step Id (matches `asSalesforceId`)
 * Returns the parsed StepOrder or null if neither encoding matches. We
 * don't currently support Id-based lookup at the slice layer (would
 * require a steps-by-id index); the caller falls back to firstError when
 * we return null.
 */
/**
 * Read the agentforce slice off the host store. Used by the slash command
 * fuzzy-match path so we can look up an agent by label or DeveloperName
 * without a component reference.
 */
function getAgentforceAgents(): GenAiPlanner[] {
    const state = store.getState() as {
        agentforce?: { agents?: GenAiPlanner[] };
    };
    return state.agentforce?.agents ?? [];
}

/**
 * Resolve a free-text query (typed by the user as `/af-agent <name>`) to
 * the highest-scoring agent in the loaded list. Returns null when there
 * is no usable signal — caller should leave the URL untouched in that case.
 *
 * Both `MasterLabel` (the user-visible name shown in the inspector tree)
 * and `DeveloperName` (the API name used in metadata) are scored, with
 * the higher of the two winning. Ties go to the first agent encountered
 * (deterministic by SOQL `ORDER BY MasterLabel` upstream).
 */
function resolveAgentByName(name: string, agents: GenAiPlanner[]): GenAiPlanner | null {
    const trimmed = name.trim();
    if (!trimmed || agents.length === 0) return null;
    let best: { agent: GenAiPlanner; score: number } | null = null;
    for (const agent of agents) {
        const labelMatch = fuzzyMatch(trimmed, agent.MasterLabel);
        const devMatch = fuzzyMatch(trimmed, agent.DeveloperName);
        const score = Math.max(labelMatch?.score ?? 0, devMatch?.score ?? 0);
        if (score <= 0) continue;
        if (!best || score > best.score) {
            best = { agent, score };
        }
    }
    return best?.agent ?? null;
}

function parseStepOrder(stepId: string | undefined): number | null {
    if (!stepId) return null;
    if (/^\d+$/.test(stepId)) {
        const n = Number.parseInt(stepId, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
}

/**
 * N14 — single analytics event for the agentforce app. Module-scope flag so
 * the event fires ONCE per session (not per re-render or tab switch). The
 * deferred `agent_selected` event is intentionally NOT wired (high
 * cardinality, low signal until UA shape stabilizes — see roadmap N14).
 */
let _appOpenedFired = false;
function fireAppOpenedOnce(alias: string | null | undefined): void {
    if (_appOpenedFired) return;
    _appOpenedFired = true;
    Analytics.trackAppOpen('agentforce', { alias: alias ?? null });
}

let _agentforceBootstrapped = false;
function bootstrapAgentforceExtension() {
    if (_agentforceBootstrapped) return;
    _agentforceBootstrapped = true;

    registerCommand('agentforce.open', () => {
        return dispatchNavigate({});
    });

    registerCommand('agentforce.openAgent', async ({ agentId, name, tab, query }) => {
        // Precedence: explicit `agentId` (electron / agent-tool / typed
        // call site) wins over `name` / `query` (slash command). Both
        // supplied is unusual but well-defined — the typed id always wins.
        const validId = safeId(agentId);
        if (validId) {
            store.dispatch(agentsSlice.actions.selectAgent({ agentId: validId }));
            dispatchNavigate({
                agentId: validId,
                tab: isValidTab(tab) ? tab : 'inspector',
            });
            return;
        }

        // Fallback: fuzzy-match on `name` or the raw `/af-agent <text>`
        // arg string. If the agents list isn't loaded yet (slash fired
        // before login or before the inspector mounted), kick off a fetch
        // and re-attempt once the payload lands.
        const needle = (name ?? query ?? '').trim();
        if (!needle) return;

        let agents = getAgentforceAgents();
        if (agents.length === 0) {
            const connector = getActiveConnector();
            if (!connector) return;
            try {
                await store.dispatch(fetchAgents({ connector }));
            } catch {
                return;
            }
            agents = getAgentforceAgents();
        }

        const matched = resolveAgentByName(needle, agents);
        if (!matched) return;

        store.dispatch(agentsSlice.actions.selectAgent({ agentId: matched.Id }));
        dispatchNavigate({
            agentId: matched.Id,
            tab: isValidTab(tab) ? tab : 'inspector',
        });
    });

    registerCommand('agentforce.openTrace', async ({ conversationId, stepId, query }) => {
        // Slash command (`/af-trace <id>`) forwards the raw arg via `query`
        // when no typed `conversationId` is supplied.
        const candidate = conversationId ?? query?.trim();
        const validId = safeId(candidate);
        if (!validId) return;

        // 1. Select interaction (clears prior steps + resets cursor).
        store.dispatch(debuggerSlice.actions.selectInteraction(validId));

        // 2. Queue the deep-link jump intent BEFORE dispatching fetchSteps
        //    so `fetchSteps.fulfilled` can apply it deterministically when
        //    the payload lands. If `stepId` parses as a StepOrder we jump
        //    there; otherwise we jump to the first errored step.
        const stepOrder = parseStepOrder(stepId);
        store.dispatch(
            debuggerSlice.actions.setPendingJumpIntent(
                stepOrder !== null ? { stepOrder } : 'firstError'
            )
        );

        // 3. Trigger the steps fetch — but only if we have a connector. In
        //    the no-connector case (rare: command fired before login) the
        //    intent stays parked; the debugger component's own
        //    `selectedAgentId`-driven fetch path will eventually load
        //    steps and the intent will be applied at that point.
        const connector = getActiveConnector();
        if (connector) {
            store.dispatch(
                debuggerFetchSteps({
                    connector,
                    interactionId: validId,
                })
            );
        }

        // 4. Reflect into URL last so navigation hydration (which would
        //    re-call selectInteraction) doesn't blow away the intent we
        //    just queued.
        dispatchNavigate({
            conversationId: validId,
            stepId,
            tab: 'debugger',
        });
    });

    registerCommand('agentforce.openTopic', async ({ agentId, topicId }) => {
        const validAgent = safeId(agentId);
        const validTopic = safeId(topicId);
        if (!validAgent || !validTopic) return;
        store.dispatch(agentsSlice.actions.selectAgent({ agentId: validAgent }));
        store.dispatch(agentsSlice.actions.selectTopic({ topicId: validTopic }));
        dispatchNavigate({
            agentId: validAgent,
            topicId: validTopic,
            tab: 'inspector',
        });
    });
}
bootstrapAgentforceExtension();

export default class App extends ToolkitElement {
    @track activeTab: AgentforceTab = 'inspector';

    @wire(NavigationContext)
    navContext: unknown;

    /**
     * Backing field for the wired pageRef setter. The setter shape (rather
     * than a plain `@wire(...) field`) lets us short-circuit on no-op
     * updates via `pageRefStateEquals` — LWR re-emits the same pageRef on
     * internal cache refreshes which would otherwise re-dispatch the
     * select* actions.
     */
    _pageRef: WorkbenchPageRef | null = null;
    @wire(CurrentPageReference)
    set pageRef(next: WorkbenchPageRef | null | undefined) {
        if (pageRefStateEquals(this._pageRef, next ?? null)) return;
        this._pageRef = next ?? null;
        this.loadFromNavigation();
    }
    get pageRef(): WorkbenchPageRef | null {
        return this._pageRef;
    }

    // Subscribe so we can persist `selectedAgentId` / `selectedTopicId`
    // back into the URL when other surfaces change them. Currently a no-op
    // sink — the URL is the source of truth on hydration; outbound
    // navigation goes through `navigateTo`.
    @wire(connectStore, { store })
    storeChange(_state: unknown): void {
        // intentional no-op for now
    }

    connectedCallback(): void {
        // N14 — single analytics event per session.
        fireAppOpenedOnce(this.alias);
        // The wired setter usually fires before connectedCallback, so this
        // is a belt-and-braces hydration for the case where a pageRef was
        // already set on the parent before the app mounted.
        if (this._pageRef) {
            this.loadFromNavigation();
        }
    }

    /** Read URL params and reflect them into the local + slice state. */
    loadFromNavigation(): void {
        const state = readAppState<AgentforceUrlKey>(this._pageRef, 'agentforce');
        if (!state) return;

        const validAgent = safeId(state.agentId);
        if (validAgent) {
            store.dispatch(agentsSlice.actions.selectAgent({ agentId: validAgent }));
        }

        const validTopic = safeId(state.topicId);
        if (validTopic) {
            store.dispatch(agentsSlice.actions.selectTopic({ topicId: validTopic }));
        }

        const validConversation = safeId(state.conversationId);
        if (validConversation) {
            store.dispatch(debuggerSlice.actions.selectInteraction(validConversation));

            // URL-hydrated deep link: if the user pasted a `?conversationId=…`
            // URL (vs. firing `agentforce.openTrace`), the command-handler
            // path didn't run, so we need to queue the jump intent + kick
            // off the steps fetch here as well. The slice's idempotent
            // re-selection guard above keeps this from racing the command
            // handler when both fire.
            const stepOrder = parseStepOrder(state.stepId);
            store.dispatch(
                debuggerSlice.actions.setPendingJumpIntent(
                    stepOrder !== null ? { stepOrder } : 'firstError'
                )
            );
            const connector = getActiveConnector();
            if (connector) {
                store.dispatch(
                    debuggerFetchSteps({
                        connector,
                        interactionId: validConversation,
                    })
                );
            }
        }

        if (isValidTab(state.tab)) {
            this.activeTab = state.tab;
        }
    }

    /**
     * Update the URL — and therefore the wired pageRef — to reflect a new
     * selection. Existing state is merged so callers can pass partial
     * updates (e.g. just `{ tab }`).
     */
    navigateTo(patch: {
        tab?: AgentforceTab;
        agentId?: string;
        conversationId?: string;
        stepId?: string;
        topicId?: string;
    }): void {
        const current = readAppState<AgentforceUrlKey>(this._pageRef, 'agentforce') || {};
        const merged: Record<string, string | undefined> = {
            tab: patch.tab ?? current.tab,
            agentId: patch.agentId ?? current.agentId,
            conversationId: patch.conversationId ?? current.conversationId,
            stepId: patch.stepId ?? current.stepId,
            topicId: patch.topicId ?? current.topicId,
        };
        const ref = buildPageRef('agentforce', merged);
        navigate(this.navContext, toLwrPageReference(ref));
    }

    get isInspectorActive(): boolean {
        return this.activeTab === 'inspector';
    }

    get isDependenciesActive(): boolean {
        return this.activeTab === 'dependencies';
    }

    get isDebuggerActive(): boolean {
        return this.activeTab === 'debugger';
    }

    get isEditorActive(): boolean {
        return this.activeTab === 'editor';
    }

    handleSelectInspector = (): void => {
        this.activeTab = 'inspector';
        this.navigateTo({ tab: 'inspector' });
    };

    handleSelectDependencies = (): void => {
        this.activeTab = 'dependencies';
        this.navigateTo({ tab: 'dependencies' });
    };

    handleSelectDebugger = (): void => {
        this.activeTab = 'debugger';
        this.navigateTo({ tab: 'debugger' });
    };

    handleSelectEditor = (): void => {
        this.activeTab = 'editor';
        this.navigateTo({ tab: 'editor' });
    };
}
