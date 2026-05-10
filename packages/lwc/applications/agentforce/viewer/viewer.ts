import ToolkitElement from 'host-api/element';
import { store, connectStore } from 'host-api/store';
import { api, wire } from 'lwc';
import { AGENTS } from 'agentforce/slices';

interface FieldEntry {
    label: string;
    value: string;
    key: string;
}

export default class Viewer extends ToolkitElement {
    agents: any[] = [];
    topics: any[] = [];
    actions: any[] = [];
    selectedAgentId: string | null = null;
    selectedTopicId: string | null = null;

    _selectedActionId: string | null = null;

    @api
    get selectedActionId(): string | null {
        return this._selectedActionId;
    }
    set selectedActionId(value: string | null) {
        this._selectedActionId = value;
    }

    @wire(connectStore, { store })
    storeChange({ agentforce, application }: any) {
        const isCurrentApp = this.verifyIsActive(application?.currentApplication);
        if (!isCurrentApp) return;

        if (agentforce) {
            this.agents = agentforce.agents || [];
            this.topics = agentforce.topics || [];
            this.actions = agentforce.actions || [];
            this.selectedAgentId = agentforce.selectedAgentId || null;
            this.selectedTopicId = agentforce.selectedTopicId || null;
        }
    }

    copyJson() {
        const record = this.selectedRecord;
        if (!record) return;
        navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    }

    get selectedRecord(): any | null {
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
        return this.selectedRecord !== null;
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
        const topicsCount = this.topics.filter(t => t.GenAiPlannerId === record.Id).length;
        return [
            { key: 'label', label: 'MasterLabel', value: record.MasterLabel || '' },
            { key: 'devname', label: 'DeveloperName', value: record.DeveloperName || '' },
            { key: 'desc', label: 'Description', value: record.Description || 'No description' },
            { key: 'topics', label: 'Topics', value: String(topicsCount) },
        ];
    }

    get topicFields(): FieldEntry[] {
        const record = this.selectedRecord;
        if (!record) return [];
        const parentAgent = this.agents.find(a => a.Id === record.GenAiPlannerId);
        return [
            { key: 'label', label: 'MasterLabel', value: record.MasterLabel || '' },
            { key: 'devname', label: 'DeveloperName', value: record.DeveloperName || '' },
            { key: 'desc', label: 'Description', value: record.Description || 'No description' },
            { key: 'agent', label: 'Parent Agent', value: parentAgent?.MasterLabel || 'Unknown' },
        ];
    }

    get actionFields(): FieldEntry[] {
        const record = this.selectedRecord;
        if (!record) return [];
        return [
            { key: 'label', label: 'MasterLabel', value: record.MasterLabel || '' },
            { key: 'devname', label: 'DeveloperName', value: record.DeveloperName || '' },
            { key: 'type', label: 'ActionType', value: record.ActionType || '' },
            { key: 'flow', label: 'FlowDefinitionId', value: record.FlowDefinitionId || 'N/A' },
        ];
    }
}
