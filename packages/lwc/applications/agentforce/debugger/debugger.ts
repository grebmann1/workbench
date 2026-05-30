import { hasCommand, invokeCommand } from 'host-api/commands';
import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { track, wire } from 'lwc';
import { DEBUGGER } from 'agentforce/slices';
import { extractStepName } from './extractStepName.ts';
import { extractRecordIds } from './extractRecordIds.ts';
import { buildSetupUrl } from 'shared/sf/setupUrl';
import {
    deriveVariantFromError,
    type EmptyStateVariant,
} from 'agentforce/shared/emptyStates/emptyStates';

import type { GenAiInteraction, GenAiInteractionStep } from 'agentforce/slices/debugger';
import type { AgentforceStoreShape } from 'agentforce/slices/types';

interface InteractionItem {
    id: string;
    conversationId: string;
    startTime: string;
    formattedTime: string;
    duration: string;
    status: string;
    statusClass: string;
    itemClass: string;
    /**
     * N12 — show inline summary stats (steps/duration/tokens) on the
     * selected interaction row. Eliminates the dedicated summary toolbar
     * row in the right pane.
     */
    showSummary: boolean;
}

interface StepItem {
    id: string;
    stepType: string;
    typeLabel: string;
    typeClass: string;
    /**
     * N13 — Human-readable name parsed from `StepInput` (model name, topic,
     * action, planner name, …). Memoized via `extractStepName`'s WeakMap so
     * we never reparse the same step twice across re-renders.
     */
    name: string;
    hasName: boolean;
    duration: string;
    durationMs: number;
    tokenCount: number | null;
    hasTokens: boolean;
    status: string;
    statusIcon: string;
    statusClass: string;
    input: string;
    output: string;
    rawInput: string;
    rawOutput: string;
    prevOutput: string;
    isExpanded: boolean;
    isActive: boolean;
    cardClass: string;
    isLLMCall: boolean;
    isNotLLMCall: boolean;
    /**
     * N9a — record Ids surfaced from `StepInput`/`StepOutput` so the
     * step row can offer "Open record" buttons. Capped at 5 unique Ids
     * by `extractRecordIds`. Empty array when none detected.
     */
    recordIds: Array<{ id: string; key: string }>;
    hasRecordIds: boolean;
}

function formatDuration(ms: number | null | undefined): string {
    if (ms == null) return '--';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch {
        return iso;
    }
}

function computeInteractionDuration(interaction: GenAiInteraction): string {
    if (!interaction.StartTime || !interaction.EndTime) return '--';
    const start = new Date(interaction.StartTime).getTime();
    const end = new Date(interaction.EndTime).getTime();
    const diff = end - start;
    if (diff < 0) return '--';
    return formatDuration(diff);
}

function prettifyJson(raw: string): string {
    if (!raw) return '';
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}

const STEP_TYPE_LABELS: Record<string, string> = {
    PlannerInvocation: 'Planner',
    TopicClassification: 'Topic Classification',
    ActionExecution: 'Action Execution',
    LLMCall: 'LLM Call',
    GuardrailCheck: 'Guardrail Check',
};

const REFRESH_DEBOUNCE_MS = 500;
const REFRESH_SHORT_CIRCUIT_MS = 2000;

export default class Debugger extends ToolkitElement {
    interactions: GenAiInteraction[] = [];
    steps: GenAiInteractionStep[] = [];
    selectedInteractionId: string | null = null;
    selectedAgentId: string | null = null;
    loading = false;
    error: string | null = null;
    expandedSteps: Set<string> = new Set();

    @track currentStepIndex: number = -1;
    @track playbackActive: boolean = false;
    @track playbackSpeed: number = 1500;
    @track _filters: Record<string, boolean> = {};
    @track searchQuery: string = '';
    /**
     * N12 — disclosure popover state for the unified toolbar's "Filters
     * (N)" button. Default closed; flipped by {@link handleFiltersToggle}
     * and reset on Escape / outside-click via {@link _outsideClickHandler}.
     */
    @track filtersOpen: boolean = false;
    private _outsideClickHandler: ((e: MouseEvent) => void) | null = null;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private _playbackTimer: ReturnType<typeof setInterval> | null = null;
    private _playbackTimerSpeed: number | null = null;
    private _isActive: boolean = false;

    private _previousAgentId: string | null = null;

    // N5 refresh-button state for the interaction list. Debounce prevents
    // rapid double-clicks; the 2-second short-circuit prevents network spam.
    private _lastRefreshAt = 0;
    private _refreshDebounce: ReturnType<typeof setTimeout> | null = null;

    connectedCallback() {
        super.connectedCallback?.();
        this.restorePersistedFilters();
        this._keyHandler = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
            if (!this._isActive) return;

            switch (e.key) {
                case 'j':
                case 'ArrowDown':
                    store.dispatch(DEBUGGER.reduxSlice.actions.nextStep());
                    e.preventDefault();
                    break;
                case 'k':
                case 'ArrowUp':
                    store.dispatch(DEBUGGER.reduxSlice.actions.prevStep());
                    e.preventDefault();
                    break;
                case ' ':
                    store.dispatch(DEBUGGER.reduxSlice.actions.togglePlayback());
                    e.preventDefault();
                    break;
                case 'Escape':
                    // N12 — Escape first dismisses the filters popover if
                    // open, then falls through to clearing the active step.
                    if (this.filtersOpen) {
                        this.filtersOpen = false;
                        this._removeOutsideClick();
                        e.preventDefault();
                        break;
                    }
                    store.dispatch(DEBUGGER.reduxSlice.actions.setStepIndex(-1));
                    break;
                case 'f':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        const input = this.template.querySelector(
                            '.viz-search-input'
                        ) as HTMLInputElement;
                        if (input) input.focus();
                    }
                    break;
                case 'F8':
                    // Jump to the first error step. Browser/devtools `F8`
                    // is a "resume execution" debugger shortcut — but only
                    // when devtools have keyboard focus, which they don't
                    // here, so it's safe to claim. The `isInInputElement`
                    // guard at the top of the handler already exempts
                    // INPUT/TEXTAREA/contenteditable.
                    e.preventDefault();
                    store.dispatch(DEBUGGER.reduxSlice.actions.jumpToFirstError());
                    break;
            }
        };
        window.addEventListener('keydown', this._keyHandler, true);
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler, true);
        }
        if (this._playbackTimer) {
            clearInterval(this._playbackTimer);
            this._playbackTimer = null;
            this._playbackTimerSpeed = null;
        }
        if (this._refreshDebounce !== null) {
            clearTimeout(this._refreshDebounce);
            this._refreshDebounce = null;
        }
        // N12 — drop the outside-click listener if the disclosure popover
        // is open at unmount time (rare, but possible when the user
        // navigates away mid-interaction).
        this._removeOutsideClick();
    }

    /**
     * Refresh the interactions list (and steps for the selected interaction
     * if any). Disabled while loading; debounced 500ms; short-circuits if
     * last refresh < 2s ago. `bypassCache: true` plumbed through for F2.
     */
    handleRefresh() {
        if (this.loading) return;
        if (!this.selectedAgentId) return;
        const now = Date.now();
        if (now - this._lastRefreshAt < REFRESH_SHORT_CIRCUIT_MS) return;
        if (this._refreshDebounce !== null) clearTimeout(this._refreshDebounce);
        this._refreshDebounce = setTimeout(() => {
            if (this.connector && this.selectedAgentId) {
                store.dispatch(
                    DEBUGGER.fetchInteractions({
                        connector: this.connector,
                        agentId: this.selectedAgentId,
                        bypassCache: true,
                    })
                );
                if (this.selectedInteractionId) {
                    store.dispatch(
                        DEBUGGER.fetchSteps({
                            connector: this.connector,
                            interactionId: this.selectedInteractionId,
                            bypassCache: true,
                        })
                    );
                }
            }
            this._lastRefreshAt = Date.now();
            this._refreshDebounce = null;
        }, REFRESH_DEBOUNCE_MS);
    }

    renderedCallback() {
        const activeCard = this.template.querySelector('.step-card--active');
        if (activeCard) {
            activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    @wire(connectStore, { store })
    storeChange({ agentforce, agentforceDebugger, application }: AgentforceStoreShape) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        this._isActive = isCurrentApp;
        if (!isCurrentApp) return;

        if (agentforce) {
            this.selectedAgentId = agentforce.selectedAgentId || null;
        }

        if (agentforceDebugger) {
            this.interactions = agentforceDebugger.interactions || [];
            this.steps = agentforceDebugger.steps || [];
            this.selectedInteractionId = agentforceDebugger.selectedInteractionId || null;
            this.loading = agentforceDebugger.loading || false;
            this.error = agentforceDebugger.error || null;
            this.currentStepIndex = agentforceDebugger.currentStepIndex;
            this.playbackActive = agentforceDebugger.playbackActive;
            this.playbackSpeed = agentforceDebugger.playbackSpeed;
            this._filters = agentforceDebugger.filters;
            this.searchQuery = agentforceDebugger.searchQuery;
        }

        // Auto-play timer management
        this.syncPlaybackTimer();

        if (this.selectedAgentId && this.selectedAgentId !== this._previousAgentId) {
            this._previousAgentId = this.selectedAgentId;
            this.expandedSteps = new Set();
            if (this.connector) {
                store.dispatch(
                    DEBUGGER.fetchInteractions({
                        connector: this.connector,
                        agentId: this.selectedAgentId,
                    })
                );
            }
        }
    }

    get hasAgent(): boolean {
        return this.selectedAgentId !== null;
    }

    get hasInteractions(): boolean {
        return this.interactions.length > 0;
    }

    /**
     * Top-level loading branch: only fire the full-panel skeleton when we
     * have no useful data AND an agent is already selected. Otherwise the
     * inline "select an agent" message keeps showing during initial
     * dispatches that race the slice load.
     */
    get loadingNoData(): boolean {
        return this.loading && !this.hasInteractions && this.hasAgent && !this.error;
    }

    /**
     * Render the top-level error empty-state only when the error blocks the
     * entire panel — i.e. we have no interactions and no transient stale
     * data. Stale-vs-clear: Engineer 7 keeps stale interactions on
     * rejection, in which case the user keeps browsing and the footer
     * toast surfaces the error.
     */
    get hasInteractionsError(): boolean {
        return !!this.error && !this.hasInteractions && this.hasAgent;
    }

    get errorVariant(): EmptyStateVariant {
        return deriveVariantFromError(this.error) || 'error';
    }

    get hasSteps(): boolean {
        return this.steps.length > 0;
    }

    get hasSelectedInteraction(): boolean {
        return this.selectedInteractionId !== null;
    }

    get interactionList(): InteractionItem[] {
        return this.interactions.map(i => {
            const isSelected = i.Id === this.selectedInteractionId;
            return {
                id: i.Id,
                conversationId: i.ConversationIdentifier || i.Id.substring(0, 8),
                startTime: i.StartTime,
                formattedTime: formatTimestamp(i.StartTime),
                duration: computeInteractionDuration(i),
                status: i.Status,
                statusClass: `interaction-status interaction-status_${(i.Status || '').toLowerCase()}`,
                itemClass: isSelected
                    ? 'interaction-item interaction-item_selected'
                    : 'interaction-item',
                // N12 — only the selected row renders the summary stats so
                // we don't need a separate chrome row in the right pane.
                showSummary: isSelected && this.steps.length > 0,
            };
        });
    }

    get stepList(): StepItem[] {
        const query = this.searchQuery.trim().toLowerCase();
        const filtered = this.steps
            .map((step, originalIndex) => ({ step, originalIndex }))
            .filter(({ step }) => this._filters[step.StepType] !== false)
            .filter(({ step }) => {
                if (!query) return true;
                return (
                    (step.StepType || '').toLowerCase().includes(query) ||
                    (step.StepInput || '').toLowerCase().includes(query) ||
                    (step.StepOutput || '').toLowerCase().includes(query)
                );
            });

        return filtered.map(({ step: s, originalIndex }, idx, arr) => {
            const isActive = originalIndex === this.currentStepIndex;
            const isExpanded = this.expandedSteps.has(s.Id);
            const isLLMCall = s.StepType === 'LLMCall';
            const input = isExpanded && !isLLMCall ? prettifyJson(s.StepInput) : '';
            const output = isExpanded && !isLLMCall ? prettifyJson(s.StepOutput) : '';
            const typeLabel = STEP_TYPE_LABELS[s.StepType] || s.StepType;
            // N13 — extractStepName memoizes per step reference, so this is
            // O(1) on cache hits across re-renders.
            const stepName = extractStepName(s);
            // Suppress duplicate display when the parsed name matches the
            // type label (e.g. an unknown StepType falls back to the type).
            const hasName = stepName.length > 0 && stepName !== typeLabel;
            // N9a — surface up to 5 unique record Ids from input/output
            // so the row can offer "Open record" buttons. Pure regex —
            // no SOQL — so this is cheap to recompute per render.
            const idsFromInput = extractRecordIds(s.StepInput || '');
            const idsFromOutput = extractRecordIds(s.StepOutput || '');
            const mergedIds: string[] = [];
            const seenIds = new Set<string>();
            for (const id of [...idsFromInput, ...idsFromOutput]) {
                if (seenIds.has(id)) continue;
                seenIds.add(id);
                mergedIds.push(id);
                if (mergedIds.length >= 5) break;
            }
            const recordIds = mergedIds.map(id => ({ id, key: `${s.Id}:${id}` }));
            return {
                id: s.Id,
                stepType: s.StepType,
                typeLabel,
                typeClass: `step-type-badge step-type_${(s.StepType || '').toLowerCase()}`,
                name: stepName,
                hasName,
                duration: formatDuration(s.Duration),
                durationMs: s.Duration || 0,
                tokenCount: s.TokenCount,
                hasTokens: s.TokenCount != null && s.TokenCount > 0,
                status: s.Status,
                statusIcon: s.Status === 'Success' ? '✓' : s.Status === 'Error' ? '✗' : '—',
                statusClass: `step-status step-status_${(s.Status || '').toLowerCase()}`,
                input,
                output,
                rawInput: s.StepInput || '',
                rawOutput: s.StepOutput || '',
                prevOutput: idx > 0 ? arr[idx - 1].step.StepOutput || '' : '',
                isExpanded,
                isActive,
                cardClass: isActive ? 'step-card step-card--active' : 'step-card',
                isLLMCall,
                isNotLLMCall: !isLLMCall,
                recordIds,
                hasRecordIds: recordIds.length > 0,
            };
        });
    }

    get summaryTotalDuration(): string {
        const total = this.steps.reduce((sum, s) => sum + (s.Duration || 0), 0);
        return formatDuration(total);
    }

    get summaryTotalTokens(): number {
        return this.steps.reduce((sum, s) => sum + (s.TokenCount || 0), 0);
    }

    get summaryStepCount(): number {
        return this.steps.length;
    }

    handleInteractionClick(event: Event) {
        const target = event.currentTarget as HTMLElement;
        const interactionId = target.dataset.id;
        if (!interactionId) return;

        store.dispatch(DEBUGGER.reduxSlice.actions.selectInteraction(interactionId));
        this.expandedSteps = new Set();

        if (this.connector) {
            store.dispatch(
                DEBUGGER.fetchSteps({
                    connector: this.connector,
                    interactionId,
                })
            );
        }
    }

    handleStepToggle(event: Event) {
        const target = event.currentTarget as HTMLElement;
        const stepId = target.dataset.id;
        if (!stepId) return;

        if (this.expandedSteps.has(stepId)) {
            this.expandedSteps.delete(stepId);
        } else {
            this.expandedSteps.add(stepId);
        }
        this.expandedSteps = new Set(this.expandedSteps);
    }

    /**
     * N9a — "Open record" cross-app jump from a debugger step row.
     *
     * Architect non-negotiable: `hasCommand` MUST guard the
     * `invokeCommand` call. If recordviewer is not mounted (rare: the
     * command is registered at module-eval time when the bundle loads,
     * but the bundle may not be loaded yet on first navigation), fall
     * back to opening the org record URL via {@link buildSetupUrl} in a
     * new tab so the user still gets somewhere useful.
     */
    async handleOpenRecord(event: Event): Promise<void> {
        // Stop the step-row toggle from firing on the surrounding header.
        event.stopPropagation();
        const target = event.currentTarget as HTMLElement;
        const recordId = target.dataset.recordId;
        if (!recordId) return;

        if (hasCommand('recordviewer.open')) {
            await invokeCommand('recordviewer.open', { recordId });
            return;
        }

        // Web fallback: open the record in a new tab using Engineer 3's
        // pure setup-url builder. We pass `type: 'Record'`, which uses the
        // universal classic-style record URL — Lightning auto-redirects.
        const orgUrl = this.connector?.conn?.instanceUrl ?? '';
        if (!orgUrl) return;
        try {
            const url = buildSetupUrl(orgUrl, { type: 'Record', id: recordId });
            window.open(url, '_blank');
        } catch {
            // buildSetupUrl validates the id shape and throws on
            // malformed input. We already filter via extractRecordIds,
            // but defensive guard keeps a bad payload from breaking the
            // click handler.
        }
    }

    get filteredStepCount(): number {
        return this.stepList.length;
    }

    get playbackVisibleIndices(): number[] {
        return this.steps
            .map((s, i) => ({ type: s.StepType, index: i }))
            .filter(item => this._filters[item.type] !== false)
            .map(item => item.index);
    }

    get playbackCurrentIndex(): number {
        return this.playbackVisibleIndices.indexOf(this.currentStepIndex);
    }

    get playbackTotalSteps(): number {
        return this.playbackVisibleIndices.length;
    }

    handlePlaybackPrev() {
        store.dispatch(DEBUGGER.reduxSlice.actions.prevStep());
    }

    handlePlaybackNext() {
        store.dispatch(DEBUGGER.reduxSlice.actions.nextStep());
    }

    handlePlaybackToggle() {
        store.dispatch(DEBUGGER.reduxSlice.actions.togglePlayback());
    }

    handlePlaybackSpeed(e: CustomEvent) {
        store.dispatch(DEBUGGER.reduxSlice.actions.setPlaybackSpeed(e.detail.speed));
    }

    handleFilterChange(e: Event) {
        const input = e.target as HTMLInputElement;
        const type = input.dataset.type;
        if (!type) return;
        const nextFilters = {
            ...this._filters,
            [type]: input.checked,
        };
        store.dispatch(DEBUGGER.reduxSlice.actions.setFilter({ type, enabled: input.checked }));
        localStorage.setItem('workbench.agentforce.debugger.filters', JSON.stringify(nextFilters));
    }

    get filterItems() {
        return Object.entries(this._filters).map(([key, enabled]) => ({
            key,
            label: key.replace(/([A-Z])/g, ' $1').trim(),
            enabled,
        }));
    }

    /**
     * N12 — count of currently-enabled step-type filters, surfaced inside
     * the disclosure button label as `Filters (N)`. We count enabled
     * filters explicitly rather than `Object.keys(_filters).length` so the
     * badge reflects what the user actually has on.
     */
    get activeFilterCount(): number {
        return Object.values(this._filters).filter(v => v !== false).length;
    }

    /** N12 — `aria-expanded` accepts only "true" / "false". */
    get filtersOpenStr(): string {
        return this.filtersOpen ? 'true' : 'false';
    }

    /**
     * N12 — toggle the filters disclosure popover. When opening, install
     * a one-shot outside-click + Escape handler that auto-dismisses;
     * removed on close to avoid leaks. Click-outside is detected by
     * walking from `e.target` and bailing if we hit the popover or its
     * trigger button (both live inside this component's shadow root).
     */
    handleFiltersToggle(event: Event) {
        event.stopPropagation();
        this.filtersOpen = !this.filtersOpen;
        if (this.filtersOpen) {
            this._outsideClickHandler = (e: MouseEvent) => {
                const path = e.composedPath();
                const popover = this.template.querySelector('.debugger-filters-popover');
                const trigger = this.template.querySelector('.debugger-toolbar__filters .btn-fsm');
                if (popover && path.includes(popover as EventTarget)) return;
                if (trigger && path.includes(trigger as EventTarget)) return;
                this.filtersOpen = false;
                this._removeOutsideClick();
            };
            document.addEventListener('click', this._outsideClickHandler, true);
        } else {
            this._removeOutsideClick();
        }
    }

    private _removeOutsideClick() {
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler, true);
            this._outsideClickHandler = null;
        }
    }

    handleSearchInput(e: Event) {
        const value = (e.target as HTMLInputElement).value;
        store.dispatch(DEBUGGER.reduxSlice.actions.setSearchQuery(value));
    }

    handleSearchClear() {
        store.dispatch(DEBUGGER.reduxSlice.actions.setSearchQuery(''));
    }

    handleSearchKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            store.dispatch(DEBUGGER.reduxSlice.actions.setSearchQuery(''));
            (e.target as HTMLElement).blur();
        }
    }

    get totalStepCount(): number {
        return this.steps.length;
    }

    get hasSearchQuery(): boolean {
        return this.searchQuery.length > 0;
    }

    private syncPlaybackTimer() {
        if (!this.playbackActive) {
            if (this._playbackTimer) {
                clearInterval(this._playbackTimer);
                this._playbackTimer = null;
                this._playbackTimerSpeed = null;
            }
            return;
        }

        const speedChanged =
            this._playbackTimer !== null &&
            this._playbackTimerSpeed !== null &&
            this._playbackTimerSpeed !== this.playbackSpeed;

        if (speedChanged && this._playbackTimer) {
            clearInterval(this._playbackTimer);
            this._playbackTimer = null;
            this._playbackTimerSpeed = null;
        }

        if (!this._playbackTimer) {
            this._playbackTimer = setInterval(() => {
                store.dispatch(DEBUGGER.reduxSlice.actions.nextStep());
            }, this.playbackSpeed);
            this._playbackTimerSpeed = this.playbackSpeed;
        }
    }

    private restorePersistedFilters() {
        const raw = localStorage.getItem('workbench.agentforce.debugger.filters');
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            for (const [type, enabled] of Object.entries(parsed)) {
                if (typeof enabled !== 'boolean') continue;
                store.dispatch(DEBUGGER.reduxSlice.actions.setFilter({ type, enabled }));
            }
        } catch {
            // Ignore malformed persisted state.
        }
    }
}
