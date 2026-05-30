import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { api, wire } from 'lwc';
import { AGENTS } from 'agentforce/slices';
import type {
    AgentScriptContent,
    GenAiPlanner,
    GenAiPlugin,
    GenAiFunction,
} from 'agentforce/slices/agents';
import type { AgentforceStoreShape } from 'agentforce/slices/types';

interface FieldEntry {
    label: string;
    value: string;
    key: string;
}

/**
 * Union of records the viewer can display in its detail panel.
 *
 * The viewer reads heterogeneous SOQL records (planner / plugin / function);
 * we keep a single union here so `selectedRecord` can stay strongly typed.
 */
type SelectedRecord = GenAiPlanner | GenAiPlugin | GenAiFunction;

export default class Viewer extends ToolkitElement {
    agents: GenAiPlanner[] = [];
    topics: GenAiPlugin[] = [];
    actions: GenAiFunction[] = [];
    selectedAgentId: string | null = null;
    selectedTopicId: string | null = null;
    selectedScriptContent: AgentScriptContent | null = null;
    scriptContentLoading = false;

    _selectedActionId: string | null = null;

    @api
    get selectedActionId(): string | null {
        return this._selectedActionId;
    }
    set selectedActionId(value: string | null) {
        this._selectedActionId = value;
    }

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: AgentforceStoreShape) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        if (agentforce) {
            this.agents = agentforce.agents || [];
            this.topics = agentforce.topics || [];
            this.actions = agentforce.actions || [];
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.selectedTopicId = agentforce.selectedTopicId || null;
            this.selectedScriptContent = agentforce.selectedScriptContent || null;
            this.scriptContentLoading = agentforce.scriptContentLoading || false;
        }
    }

    copyJson() {
        if (this.isScript && this.selectedScriptContent) {
            navigator.clipboard.writeText(this.selectedScriptContent.agentSource);
            return;
        }
        const record = this.selectedRecord;
        if (!record) return;
        navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    }

    get selectedRecord(): SelectedRecord | null {
        if (this._selectedActionId) {
            const action = this.actions.find(a => a.Id === this._selectedActionId);
            if (action) return action;
        }
        if (this.selectedTopicId) {
            const topic = this.topics.find(t => t.Id === this.selectedTopicId);
            if (topic) return topic;
        }
        if (this.selectedAgentId) {
            return this.agents.find(a => a.Id === this.selectedAgentId) || null;
        }
        return null;
    }

    get selectedType(): string | null {
        if (!this.selectedRecord) return null;
        const record = this.selectedRecord;
        if (this.actions.some(a => a.Id === record.Id)) return 'action';
        if (this.topics.some(t => t.Id === record.Id)) return 'topic';
        if (this.agents.some(a => a.Id === record.Id)) return 'agent';
        return null;
    }

    get hasSelection(): boolean {
        return this.selectedRecord !== null || this.isScript;
    }

    get isScript(): boolean {
        return this.selectedScriptContent !== null || this.scriptContentLoading;
    }

    get scriptSource(): string {
        return this.selectedScriptContent?.agentSource || '';
    }

    get scriptName(): string {
        return this.selectedScriptContent?.fullName?.replace(/_/g, ' ') || '';
    }

    get recordTitle(): string {
        return this.selectedRecord?.MasterLabel || 'Untitled';
    }

    get recordTypeBadge(): string {
        const type = this.selectedType;
        if (type === 'agent') return 'Agent';
        if (type === 'topic') return 'Topic';
        if (type === 'action') return 'Action';
        return '';
    }

    get isAgent(): boolean {
        return this.selectedType === 'agent';
    }

    get isTopic(): boolean {
        return this.selectedType === 'topic';
    }

    get isAction(): boolean {
        return this.selectedType === 'action';
    }

    get agentFields(): FieldEntry[] {
        const record = this.selectedRecord;
        if (!record) return [];
        const agent = this.agents.find(a => a.Id === record.Id);
        if (!agent) return [];
        const topicsCount = this.topics.filter(t => t.GenAiPlannerId === agent.Id).length;
        return [
            { key: 'label', label: 'MasterLabel', value: agent.MasterLabel || '' },
            { key: 'devname', label: 'DeveloperName', value: agent.DeveloperName || '' },
            { key: 'desc', label: 'Description', value: agent.Description || 'No description' },
            { key: 'topics', label: 'Topics', value: String(topicsCount) },
        ];
    }

    get topicFields(): FieldEntry[] {
        const record = this.selectedRecord;
        if (!record) return [];
        const topic = this.topics.find(t => t.Id === record.Id);
        if (!topic) return [];
        const parentAgent = this.agents.find(a => a.Id === topic.GenAiPlannerId);
        return [
            { key: 'label', label: 'MasterLabel', value: topic.MasterLabel || '' },
            { key: 'devname', label: 'DeveloperName', value: topic.DeveloperName || '' },
            { key: 'desc', label: 'Description', value: topic.Description || 'No description' },
            { key: 'agent', label: 'Parent Agent', value: parentAgent?.MasterLabel || 'Unknown' },
        ];
    }

    get actionFields(): FieldEntry[] {
        const record = this.selectedRecord;
        if (!record) return [];
        const action = this.actions.find(a => a.Id === record.Id);
        if (!action) return [];
        return [
            { key: 'label', label: 'MasterLabel', value: action.MasterLabel || '' },
            { key: 'devname', label: 'DeveloperName', value: action.DeveloperName || '' },
            { key: 'type', label: 'ActionType', value: action.ActionType || '' },
            { key: 'flow', label: 'FlowDefinitionId', value: action.FlowDefinitionId || 'N/A' },
        ];
    }
}
