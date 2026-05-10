import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { wire } from 'lwc';
import { ensureMermaidLoaded } from 'shared/loader';

import type { GenAiPlanner, GenAiPlugin, GenAiFunction, FlowRef, ApexRef } from 'agentforce/slices/agents';

export default class Dependencies extends ToolkitElement {
    agents: GenAiPlanner[] = [];
    topics: GenAiPlugin[] = [];
    actions: GenAiFunction[] = [];
    selectedAgentId: string | null = null;
    dependencies: { flows: FlowRef[]; apexClasses: ApexRef[] } = { flows: [], apexClasses: [] };
    loading = false;
    _rendered = false;
    _lastGraphKey = '';

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: any) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        if (agentforce) {
            this.agents = agentforce.agents || [];
            this.topics = agentforce.topics || [];
            this.actions = agentforce.actions || [];
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.dependencies = agentforce.dependencies || { flows: [], apexClasses: [] };
            this.loading = agentforce.loading || false;
        }

        if (this._rendered) {
            this.renderGraph();
        }
    }

    renderedCallback() {
        this._rendered = true;
        this.renderGraph();
    }

    get hasSelection(): boolean {
        return this.selectedAgentId !== null;
    }

    get legendItems() {
        return [
            { key: 'agent', label: 'Agent', cls: 'legend-badge legend-badge_agent' },
            { key: 'topic', label: 'Topic', cls: 'legend-badge legend-badge_topic' },
            { key: 'action', label: 'Action', cls: 'legend-badge legend-badge_action' },
            { key: 'flow', label: 'Flow', cls: 'legend-badge legend-badge_flow' },
            { key: 'apex', label: 'Apex', cls: 'legend-badge legend-badge_apex' },
        ];
    }

    private buildMermaidGraph(): string {
        const agent = this.agents.find(a => a.Id === this.selectedAgentId);
        if (!agent) return '';

        const lines: string[] = ['graph TD'];
        const agentNode = `Agent_${this.sanitizeId(agent.Id)}`;
        lines.push(`    ${agentNode}["Agent: ${this.sanitizeLabel(agent.MasterLabel)}"]`);

        const agentTopics = this.topics.filter(t => t.GenAiPlannerId === agent.Id);

        for (const topic of agentTopics) {
            const topicNode = `Topic_${this.sanitizeId(topic.Id)}`;
            lines.push(`    ${topicNode}["Topic: ${this.sanitizeLabel(topic.MasterLabel)}"]`);
            lines.push(`    ${agentNode} --> ${topicNode}`);

            const topicActions = this.actions.filter(a => a.GenAiPluginId === topic.Id);
            for (const action of topicActions) {
                const actionNode = `Action_${this.sanitizeId(action.Id)}`;
                lines.push(`    ${actionNode}["Action: ${this.sanitizeLabel(action.MasterLabel)}"]`);
                lines.push(`    ${topicNode} --> ${actionNode}`);

                const flowRef = this.dependencies.flows.find(f => f.actionId === action.Id);
                if (flowRef) {
                    const flowNode = `Flow_${this.sanitizeId(flowRef.id)}`;
                    lines.push(`    ${flowNode}["Flow: ${this.sanitizeLabel(flowRef.label)}"]`);
                    lines.push(`    ${actionNode} -->|Flow| ${flowNode}`);
                }

                const apexRef = this.dependencies.apexClasses.find(a => a.actionId === action.Id);
                if (apexRef) {
                    const apexNode = `Apex_${this.sanitizeId(apexRef.id)}`;
                    lines.push(`    ${apexNode}["Apex: ${this.sanitizeLabel(apexRef.name)}"]`);
                    lines.push(`    ${actionNode} -->|Apex| ${apexNode}`);
                }

                if (!flowRef && !apexRef && action.FlowDefinitionId) {
                    const flowNode = `Flow_${this.sanitizeId(action.FlowDefinitionId)}`;
                    lines.push(`    ${flowNode}["Flow: ${this.sanitizeLabel(action.FlowDefinitionId)}"]`);
                    lines.push(`    ${actionNode} -->|Flow| ${flowNode}`);
                }
            }
        }

        lines.push('');
        lines.push('    classDef agentStyle fill:#1b96ff,color:#fff,stroke:#0176d3');
        lines.push('    classDef topicStyle fill:#2e844a,color:#fff,stroke:#22683e');
        lines.push('    classDef actionStyle fill:#dd7a01,color:#fff,stroke:#b86e00');
        lines.push('    classDef flowStyle fill:#7526c3,color:#fff,stroke:#5a1ba9');
        lines.push('    classDef apexStyle fill:#c23934,color:#fff,stroke:#a31b16');

        const agentNodes = [`Agent_${this.sanitizeId(agent.Id)}`];
        const topicNodes = agentTopics.map(t => `Topic_${this.sanitizeId(t.Id)}`);
        const actionNodes: string[] = [];
        const flowNodes: string[] = [];
        const apexNodes: string[] = [];

        for (const topic of agentTopics) {
            const topicActions = this.actions.filter(a => a.GenAiPluginId === topic.Id);
            for (const action of topicActions) {
                actionNodes.push(`Action_${this.sanitizeId(action.Id)}`);
                const flowRef = this.dependencies.flows.find(f => f.actionId === action.Id);
                if (flowRef) {
                    flowNodes.push(`Flow_${this.sanitizeId(flowRef.id)}`);
                } else if (action.FlowDefinitionId) {
                    flowNodes.push(`Flow_${this.sanitizeId(action.FlowDefinitionId)}`);
                }
                const apexRef = this.dependencies.apexClasses.find(a => a.actionId === action.Id);
                if (apexRef) {
                    apexNodes.push(`Apex_${this.sanitizeId(apexRef.id)}`);
                }
            }
        }

        if (agentNodes.length) lines.push(`    class ${agentNodes.join(',')} agentStyle`);
        if (topicNodes.length) lines.push(`    class ${topicNodes.join(',')} topicStyle`);
        if (actionNodes.length) lines.push(`    class ${actionNodes.join(',')} actionStyle`);
        if (flowNodes.length) lines.push(`    class ${flowNodes.join(',')} flowStyle`);
        if (apexNodes.length) lines.push(`    class ${apexNodes.join(',')} apexStyle`);

        return lines.join('\n');
    }

    private async renderGraph() {
        if (!this.refs?.mermaid) return;
        if (!this.hasSelection) {
            this.refs.mermaid.innerHTML = '';
            return;
        }

        const graphDefinition = this.buildMermaidGraph();
        if (!graphDefinition) {
            this.refs.mermaid.innerHTML = '';
            return;
        }

        const graphKey = graphDefinition;
        if (graphKey === this._lastGraphKey) return;
        this._lastGraphKey = graphKey;

        const mermaid = await ensureMermaidLoaded();
        if (!mermaid) return;

        this.refs.mermaid.innerHTML = '';
        const { svg, bindFunctions } = await (mermaid as any).render(
            'agentforce-dep-graph',
            graphDefinition
        );
        this.refs.mermaid.innerHTML = svg;
        if (bindFunctions) {
            bindFunctions(this.refs.mermaid);
        }
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9]/g, '_');
    }

    private sanitizeLabel(label: string): string {
        return label.replace(/"/g, '#quot;').replace(/[[\]]/g, '');
    }
}
