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
    tokenCount: number | null;
    hasTokens: boolean;
    status: string;
    statusIcon: string;
    statusClass: string;
    input: string;
    output: string;
    isExpanded: boolean;
    isActive: boolean;
    cardClass: string;
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
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private _playbackTimer: ReturnType<typeof setInterval> | null = null;
    private _isActive: boolean = false;

    private _previousAgentId: string | null = null;

    connectedCallback() {
        super.connectedCallback?.();
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
        }

        // Auto-play timer management
        if (this.playbackActive && !this._playbackTimer) {
            this._playbackTimer = setInterval(() => {
                store.dispatch(DEBUGGER.reduxSlice.actions.nextStep());
            }, this.playbackSpeed);
        } else if (!this.playbackActive && this._playbackTimer) {
            clearInterval(this._playbackTimer);
            this._playbackTimer = null;
        }

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
        return this.steps
            .filter(s => this._filters[s.StepType] !== false)
            .map((s, _i, filtered) => {
                const originalIndex = this.steps.indexOf(s);
                const isActive = originalIndex === this.currentStepIndex;
                return {
                    id: s.Id,
                    stepType: s.StepType,
                    typeLabel: STEP_TYPE_LABELS[s.StepType] || s.StepType,
                    typeClass: `step-type-badge step-type_${(s.StepType || '').toLowerCase()}`,
                    duration: formatDuration(s.Duration),
                    tokenCount: s.TokenCount,
                    hasTokens: s.TokenCount != null && s.TokenCount > 0,
                    status: s.Status,
                    statusIcon: s.Status === 'Success' ? '✓' : s.Status === 'Error' ? '✗' : '—',
                    statusClass: `step-status step-status_${(s.Status || '').toLowerCase()}`,
                    input: prettifyJson(s.StepInput),
                    output: prettifyJson(s.StepOutput),
                    isExpanded: this.expandedSteps.has(s.Id),
                    isActive,
                    cardClass: isActive ? 'step-card step-card--active' : 'step-card',
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

    handleFilterChange(e: Event) {
        const input = e.target as HTMLInputElement;
        const type = input.dataset.type;
        if (!type) return;
        store.dispatch(DEBUGGER.reduxSlice.actions.setFilter({ type, enabled: input.checked }));
        localStorage.setItem(
            'workbench.agentforce.debugger.filters',
            JSON.stringify(this._filters)
        );
    }

    get filterItems() {
        return Object.entries(this._filters).map(([key, enabled]) => ({
            key,
            label: key.replace(/([A-Z])/g, ' $1').trim(),
            enabled,
        }));
    }
}
