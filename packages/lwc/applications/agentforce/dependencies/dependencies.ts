import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { wire, track } from 'lwc';
import { ensureMermaidLoaded } from 'shared/loader';
import { analyze } from './graphAnalysis';

import type { GenAiPlanner, GenAiPlugin, GenAiFunction, FlowRef, ApexRef } from 'agentforce/slices/agents';
import type { GraphData, GraphNode, GraphEdge, AnalysisResult } from './graphAnalysis';

export default class Dependencies extends ToolkitElement {
    agents: GenAiPlanner[] = [];
    topics: GenAiPlugin[] = [];
    actions: GenAiFunction[] = [];
    selectedAgentId: string | null = null;
    dependencies: { flows: FlowRef[]; apexClasses: ApexRef[] } = { flows: [], apexClasses: [] };
    loading = false;
    _rendered = false;
    _lastGraphKey = '';

    @track private _zoom: number = 1;
    @track private _panX: number = 0;
    @track private _panY: number = 0;
    @track private _analysisResult: AnalysisResult | null = null;
    private _isPanning: boolean = false;
    private _panStart = { x: 0, y: 0, panX: 0, panY: 0 };
    private _originalViewBox: { x: number; y: number; w: number; h: number } | null = null;

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: any) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        if (agentforce) {
            const prevAgentId = this.selectedAgentId;
            this.agents = agentforce.agents || [];
            this.topics = agentforce.topics || [];
            this.actions = agentforce.actions || [];
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.dependencies = agentforce.dependencies || { flows: [], apexClasses: [] };
            this.loading = agentforce.loading || false;

            if (this.selectedAgentId !== prevAgentId) {
                this._zoom = 1;
                this._panX = 0;
                this._panY = 0;
                this._originalViewBox = null;
            }
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

        const svgEl = this.refs.mermaid.querySelector('svg');
        if (svgEl) {
            const vbAttr = svgEl.getAttribute('viewBox');
            if (vbAttr) {
                const vb = vbAttr.split(' ').map(Number);
                if (vb.length === 4) {
                    this._originalViewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
                }
            }
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            svgEl.style.width = '100%';
            svgEl.style.height = '100%';
            this._applyViewBox(svgEl);
        }

        const graphData = this.buildGraphData();
        if (graphData.nodes.length > 0) {
            this._analysisResult = analyze(graphData);
            this.annotateGraph(this._analysisResult);
        } else {
            this._analysisResult = null;
        }
    }

    private _applyViewBox(svgEl?: Element) {
        const svg = svgEl || this.refs.mermaid?.querySelector('svg');
        if (!svg || !this._originalViewBox) return;
        const { x, y, w, h } = this._originalViewBox;
        const scaledW = w / this._zoom;
        const scaledH = h / this._zoom;
        const cx = x + w / 2 + this._panX;
        const cy = y + h / 2 + this._panY;
        svg.setAttribute('viewBox', `${cx - scaledW / 2} ${cy - scaledH / 2} ${scaledW} ${scaledH}`);
    }

    handleWheel(e: WheelEvent) {
        e.preventDefault();
        if (!this._originalViewBox) return;
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        this._zoom = Math.max(0.33, Math.min(3.0, this._zoom * factor));
        this._applyViewBox();
    }

    handlePointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        this._isPanning = true;
        this._panStart = { x: e.clientX, y: e.clientY, panX: this._panX, panY: this._panY };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    handlePointerMove(e: PointerEvent) {
        if (!this._isPanning || !this._originalViewBox) return;
        const rect = (e.currentTarget as Element).getBoundingClientRect();
        const dx = (e.clientX - this._panStart.x) / rect.width * this._originalViewBox.w / this._zoom;
        const dy = (e.clientY - this._panStart.y) / rect.height * this._originalViewBox.h / this._zoom;
        this._panX = this._panStart.panX - dx;
        this._panY = this._panStart.panY - dy;
        this._applyViewBox();
    }

    handlePointerUp(e: PointerEvent) {
        this._isPanning = false;
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }

    handleZoomIn() {
        this._zoom = Math.min(3.0, this._zoom * 1.25);
        this._applyViewBox();
    }

    handleZoomOut() {
        this._zoom = Math.max(0.33, this._zoom * 0.8);
        this._applyViewBox();
    }

    handleZoomReset() {
        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._applyViewBox();
    }

    get zoomPercent(): string {
        return `${Math.round(this._zoom * 100)}%`;
    }

    get hasGraph(): boolean {
        return !!this._originalViewBox;
    }

    private buildGraphData(): GraphData {
        const agent = this.agents.find(a => a.Id === this.selectedAgentId);
        if (!agent) return { nodes: [], edges: [] };

        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        const agentNodeId = `Agent_${this.sanitizeId(agent.Id)}`;
        nodes.push({ id: agentNodeId, label: agent.MasterLabel, type: 'agent' });

        const agentTopics = this.topics.filter(t => t.GenAiPlannerId === agent.Id);
        for (const topic of agentTopics) {
            const topicNodeId = `Topic_${this.sanitizeId(topic.Id)}`;
            nodes.push({ id: topicNodeId, label: topic.MasterLabel, type: 'topic' });
            edges.push({ from: agentNodeId, to: topicNodeId });

            const topicActions = this.actions.filter(a => a.GenAiPluginId === topic.Id);
            for (const action of topicActions) {
                const actionNodeId = `Action_${this.sanitizeId(action.Id)}`;
                nodes.push({ id: actionNodeId, label: action.MasterLabel, type: 'action' });
                edges.push({ from: topicNodeId, to: actionNodeId });

                const flowRef = this.dependencies.flows.find(f => f.actionId === action.Id);
                if (flowRef) {
                    const flowNodeId = `Flow_${this.sanitizeId(flowRef.id)}`;
                    if (!nodes.find(n => n.id === flowNodeId)) {
                        nodes.push({ id: flowNodeId, label: flowRef.label, type: 'flow' });
                    }
                    edges.push({ from: actionNodeId, to: flowNodeId, label: 'Flow' });
                } else if (action.FlowDefinitionId) {
                    const flowNodeId = `Flow_${this.sanitizeId(action.FlowDefinitionId)}`;
                    if (!nodes.find(n => n.id === flowNodeId)) {
                        nodes.push({ id: flowNodeId, label: action.FlowDefinitionId, type: 'flow' });
                    }
                    edges.push({ from: actionNodeId, to: flowNodeId, label: 'Flow' });
                }

                const apexRef = this.dependencies.apexClasses.find(a => a.actionId === action.Id);
                if (apexRef) {
                    const apexNodeId = `Apex_${this.sanitizeId(apexRef.id)}`;
                    if (!nodes.find(n => n.id === apexNodeId)) {
                        nodes.push({ id: apexNodeId, label: apexRef.name, type: 'apex' });
                    }
                    edges.push({ from: actionNodeId, to: apexNodeId, label: 'Apex' });
                }
            }
        }

        return { nodes, edges };
    }

    private annotateGraph(analysis: AnalysisResult) {
        const svg = this.refs.mermaid?.querySelector('svg');
        if (!svg) return;

        const cycleNodes = new Set(analysis.cycles.flat());
        for (const nodeId of cycleNodes) {
            const el = svg.querySelector(`[id*="${nodeId}"]`);
            if (el) {
                const rect = el.querySelector('rect') || el.querySelector('polygon');
                if (rect) rect.setAttribute('stroke-dasharray', '5,3');
            }
        }

        for (const nodeId of analysis.bottlenecks) {
            const el = svg.querySelector(`[id*="${nodeId}"]`);
            if (el) {
                const rect = el.querySelector('rect') || el.querySelector('polygon');
                if (rect) rect.setAttribute('stroke-width', '3');
            }
        }
    }

    get hasCycles(): boolean {
        return (this._analysisResult?.cycles.length ?? 0) > 0;
    }

    get cycleCount(): number {
        return this._analysisResult?.cycles.length ?? 0;
    }

    get hasBottlenecks(): boolean {
        return (this._analysisResult?.bottlenecks.length ?? 0) > 0;
    }

    get topBottleneckLabel(): string {
        if (!this._analysisResult?.bottlenecks.length) return '';
        const id = this._analysisResult.bottlenecks[0];
        const allItems = [
            ...this.agents.map(a => ({ id: `Agent_${this.sanitizeId(a.Id)}`, label: a.MasterLabel })),
            ...this.topics.map(t => ({ id: `Topic_${this.sanitizeId(t.Id)}`, label: t.MasterLabel })),
            ...this.actions.map(a => ({ id: `Action_${this.sanitizeId(a.Id)}`, label: a.MasterLabel })),
        ];
        const match = allItems.find(i => i.id === id);
        return match?.label || id;
    }

    get graphDiameter(): number {
        return this._analysisResult?.diameter ?? 0;
    }

    get hasAnalysis(): boolean {
        return this._analysisResult !== null;
    }

    private sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9]/g, '_');
    }

    private sanitizeLabel(label: string): string {
        return label.replace(/"/g, '#quot;').replace(/[[\]]/g, '');
    }
}
