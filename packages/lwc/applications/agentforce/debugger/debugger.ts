import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { wire } from 'lwc';
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

    private _previousAgentId: string | null = null;

    @wire(connectStore, { store })
    storeChange({ agentforce, agentforceDebugger, application }: any) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
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
        return this.steps.map(s => ({
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
        }));
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
}
