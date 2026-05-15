import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { track, wire } from 'lwc';
import { DEBUGGER } from 'agentforce/slices';

import type { GenAiInteraction, GenAiInteractionStep } from 'agentforce/slices/debugger';

interface InteractionItem {
    id: string;
    conversationId: string;
    startTime: string;
    formattedTime: string;
    duration: string;
    status: string;
    statusClass: string;
    itemClass: string;
}

interface StepItem {
    id: string;
    stepType: string;
    typeLabel: string;
    typeClass: string;
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
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private _playbackTimer: ReturnType<typeof setInterval> | null = null;
    private _playbackTimerSpeed: number | null = null;
    private _isActive: boolean = false;

    private _previousAgentId: string | null = null;

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
    }

    renderedCallback() {
        const activeCard = this.template.querySelector('.step-card--active');
        if (activeCard) {
            activeCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    @wire(connectStore, { store })
    storeChange({ agentforce, agentforceDebugger, application }: any) {
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

    get hasSteps(): boolean {
        return this.steps.length > 0;
    }

    get hasSelectedInteraction(): boolean {
        return this.selectedInteractionId !== null;
    }

    get interactionList(): InteractionItem[] {
        return this.interactions.map(i => ({
            id: i.Id,
            conversationId: i.ConversationIdentifier || i.Id.substring(0, 8),
            startTime: i.StartTime,
            formattedTime: formatTimestamp(i.StartTime),
            duration: computeInteractionDuration(i),
            status: i.Status,
            statusClass: `interaction-status interaction-status_${(i.Status || '').toLowerCase()}`,
            itemClass:
                i.Id === this.selectedInteractionId
                    ? 'interaction-item interaction-item_selected'
                    : 'interaction-item',
        }));
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
            return {
                id: s.Id,
                stepType: s.StepType,
                typeLabel: STEP_TYPE_LABELS[s.StepType] || s.StepType,
                typeClass: `step-type-badge step-type_${(s.StepType || '').toLowerCase()}`,
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
        localStorage.setItem(
            'workbench.agentforce.debugger.filters',
            JSON.stringify(nextFilters)
        );
    }

    get filterItems() {
        return Object.entries(this._filters).map(([key, enabled]) => ({
            key,
            label: key.replace(/([A-Z])/g, ' $1').trim(),
            enabled,
        }));
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
